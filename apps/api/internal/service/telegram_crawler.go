package service

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"netdisk/api/internal/model"
)

type TelegramCrawlerService struct {
	db     *gorm.DB
	parser *NetdiskParserService
	client *http.Client
	mu     sync.Mutex
}

func NewTelegramCrawlerService(db *gorm.DB, parser *NetdiskParserService) *TelegramCrawlerService {
	s := &TelegramCrawlerService{
		db:     db,
		parser: parser,
		client: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}
	// 启动后台自动轮询采集 worker
	go s.startBackgroundWorker()
	return s
}

// startBackgroundWorker 定时检查并拉取订阅频道更新
func (s *TelegramCrawlerService) startBackgroundWorker() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		var cfg model.TelegramConfig
		if err := s.db.First(&cfg).Error; err != nil {
			continue
		}
		// 如果当前处于 Webhook 实时触发模式，则不执行 getUpdates 轮询以避免 Telegram 409 冲突
		if cfg.SyncMode == "webhook" {
			continue
		}
		if cfg.AutoSync && cfg.BotToken != "" {
			_, _ = s.SyncNow()
		}
	}
}

// TelegramUpdateMessage 包含频道广播或群消息
type TelegramUpdateMessage struct {
	MessageID int64 `json:"message_id"`
	Date      int64 `json:"date"`
	Chat      struct {
		ID       int64  `json:"id"`
		Title    string `json:"title"`
		Type     string `json:"type"`
		Username string `json:"username"`
	} `json:"chat"`
	Text    string `json:"text"`
	Caption string `json:"caption"`
}

type TelegramUpdate struct {
	UpdateID    int64                  `json:"update_id"`
	ChannelPost *TelegramUpdateMessage `json:"channel_post"`
	Message     *TelegramUpdateMessage `json:"message"`
}

type TelegramGetUpdatesResponse struct {
	Ok          bool             `json:"ok"`
	Result      []TelegramUpdate `json:"result"`
	Description string           `json:"description,omitempty"`
}

// SyncResult 同步结果报告
type SyncResult struct {
	TotalFetched int    `json:"total_fetched"`
	NewDrafts    int    `json:"new_drafts"`
	Skipped      int    `json:"skipped"`
	Message      string `json:"message"`
}

// SyncNow 立即从 Telegram Bot API 拉取最新消息并解析入草稿库
func (s *TelegramCrawlerService) SyncNow() (*SyncResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return nil, fmt.Errorf("未找到 Telegram 配置: %w", err)
	}

	if strings.TrimSpace(cfg.BotToken) == "" {
		return nil, fmt.Errorf("Telegram Bot Token 为空，请先配置")
	}

	// 获取已启用的监控频道列表
	var channels []model.TelegramChannel
	s.db.Where("is_active = ?", true).Find(&channels)
	channelMap := make(map[string]model.TelegramChannel)
	for _, ch := range channels {
		channelMap[ch.ChannelID] = ch
	}

	// 构造请求 Telegram getUpdates
	offset := cfg.LastUpdateID + 1
	tgURL := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&limit=100&timeout=5", cfg.BotToken, offset)

	req, err := http.NewRequest("GET", tgURL, nil)
	if err != nil {
		s.updateSyncStatus(&cfg, "error", fmt.Sprintf("构建请求失败: %v", err))
		return nil, err
	}
	req.Header.Set("User-Agent", "NetdiskCrawler/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		s.updateSyncStatus(&cfg, "error", fmt.Sprintf("连接 Telegram API 失败: %v", err))
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		s.updateSyncStatus(&cfg, "error", fmt.Sprintf("读取响应失败: %v", err))
		return nil, err
	}

	var tgResp TelegramGetUpdatesResponse
	if err := json.Unmarshal(body, &tgResp); err != nil {
		s.updateSyncStatus(&cfg, "error", fmt.Sprintf("解析 Telegram 响应 JSON 失败: %v", err))
		return nil, err
	}

	if !tgResp.Ok {
		s.updateSyncStatus(&cfg, "error", fmt.Sprintf("Telegram API 报错: %s", tgResp.Description))
		return nil, fmt.Errorf("Telegram API 错误: %s", tgResp.Description)
	}

	result := &SyncResult{
		TotalFetched: len(tgResp.Result),
	}

	maxUpdateID := cfg.LastUpdateID

	for _, up := range tgResp.Result {
		if up.UpdateID > maxUpdateID {
			maxUpdateID = up.UpdateID
		}

		msg := up.ChannelPost
		if msg == nil {
			msg = up.Message
		}
		if msg == nil {
			continue
		}

		chatIDStr := fmt.Sprintf("%d", msg.Chat.ID)
		rawText := msg.Text
		if rawText == "" {
			rawText = msg.Caption
		}
		if strings.TrimSpace(rawText) == "" {
			result.Skipped++
			continue
		}

		// 检查是否属于我们监听的频道
		monitoredCh, isMonitored := channelMap[chatIDStr]
		sourceName := msg.Chat.Title
		if sourceName == "" {
			sourceName = fmt.Sprintf("频道 %s", chatIDStr)
		}
		defaultDrive := "auto"
		if isMonitored {
			if monitoredCh.Name != "" {
				sourceName = monitoredCh.Name
			}
			defaultDrive = monitoredCh.DriveType
		}

		// 解析内容中提取网盘链接
		parsedDrafts := s.ExtractDraftsFromText(rawText, sourceName, chatIDStr, msg.MessageID, defaultDrive)
		for _, draft := range parsedDrafts {
			// 去重检查: 同一 share_url 或同一 (channel_id, message_id)
			var existing model.ResourceDraft
			err := s.db.Where("share_url = ? OR (channel_id = ? AND message_id = ?)", draft.ShareURL, draft.ChannelID, draft.MessageID).First(&existing).Error
			if err == nil {
				// 已存在
				result.Skipped++
				continue
			}

			if err := s.db.Create(&draft).Error; err == nil {
				result.NewDrafts++
				// 更新对应频道采集数
				if isMonitored {
					s.db.Model(&model.TelegramChannel{}).Where("id = ?", monitoredCh.ID).UpdateColumn("item_count", gorm.Expr("item_count + 1"))
				}
			} else {
				log.Printf("保存采集草稿失败: %v", err)
			}
		}
	}

	// 更新 last_update_id 与状态
	cfg.LastUpdateID = maxUpdateID
	now := time.Now()
	cfg.LastSyncAt = &now
	cfg.LastSyncStatus = "success"
	cfg.LastSyncMessage = fmt.Sprintf("成功获取 %d 条消息，新增 %d 份待审核草稿", result.TotalFetched, result.NewDrafts)
	s.db.Save(&cfg)

	result.Message = cfg.LastSyncMessage
	return result, nil
}

func (s *TelegramCrawlerService) updateSyncStatus(cfg *model.TelegramConfig, status, msg string) {
	now := time.Now()
	cfg.LastSyncAt = &now
	cfg.LastSyncStatus = status
	cfg.LastSyncMessage = msg
	s.db.Save(cfg)
}

// ExtractDraftsFromText 从一段文本中解析提取所有网盘链接、提取码、标题与文件信息
func (s *TelegramCrawlerService) ExtractDraftsFromText(rawText string, sourceName string, channelID string, messageID int64, defaultDrive string) []model.ResourceDraft {
	var drafts []model.ResourceDraft

	// 正则提取所有网盘链接
	// 夸克: pan.quark.cn/s/xxx
	// 百度: pan.baidu.com/s/xxx
	// 阿里: alipan.com/s/xxx 或 aliyundrive.com/s/xxx
	// 迅雷: pan.xunlei.com/s/xxx
	// 123: 123pan.com/s/xxx
	// 天翼: cloud.189.cn
	urlPattern := regexp.MustCompile(`https?://[a-zA-Z0-9\.\-_/]+(/s/[a-zA-Z0-9_\-]+|/t/[a-zA-Z0-9_\-]+|\?code=[a-zA-Z0-9_\-]+|[a-zA-Z0-9_\-]+)`)
	matches := urlPattern.FindAllString(rawText, -1)

	// 提取密码 / 提取码
	codePattern := regexp.MustCompile(`(?:提取码|密码|pwd|code|访问码)[:：\s]*([a-zA-Z0-9]{4,8})`)
	codeMatch := codePattern.FindStringSubmatch(rawText)
	globalExtractCode := ""
	if len(codeMatch) > 1 {
		globalExtractCode = strings.TrimSpace(codeMatch[1])
	}

	// 提取文件大小，如 大小: 1.2G, 500MB
	sizePattern := regexp.MustCompile(`(?:大小|size)[:：\s]*([0-9\.]+\s*(?:GB|MB|KB|G|M|K))`)
	sizeMatch := sizePattern.FindStringSubmatch(rawText)
	globalSize := "未知"
	if len(sizeMatch) > 1 {
		globalSize = strings.TrimSpace(sizeMatch[1])
	}

	// 提取标题：优先取包含书名号《》、中括号【】或首行有意义文字
	cleanTitle := s.ExtractTitleFromText(rawText)

	seenURLs := make(map[string]bool)

	for _, rawURL := range matches {
		driveType := s.DetectDriveType(rawURL)
		if driveType == "" {
			if defaultDrive != "" && defaultDrive != "auto" {
				driveType = defaultDrive
			} else {
				continue // 忽略非网盘的杂项链接
			}
		}

		// 规范化 URL
		shareURL := strings.TrimSpace(rawURL)
		if seenURLs[shareURL] {
			continue
		}
		seenURLs[shareURL] = true

		// 检查链接本身带不带 pwd 参数，如 https://pan.baidu.com/s/xxx?pwd=abcd
		extractCode := globalExtractCode
		if u, err := url.Parse(shareURL); err == nil {
			if p := u.Query().Get("pwd"); p != "" {
				extractCode = p
			}
		}

		draft := model.ResourceDraft{
			ID:          uuid.New(),
			Title:       cleanTitle,
			SourceName:  sourceName,
			ChannelID:   channelID,
			MessageID:   messageID,
			DriveType:   driveType,
			ShareURL:    shareURL,
			ExtractCode: extractCode,
			FileSize:    globalSize,
			RawText:     rawText,
			Status:      "pending",
			IsSafe:      true,
			RawInfo:     datatypes.JSON([]byte(fmt.Sprintf(`{"extracted_at":"%s","source":"telegram"}`, time.Now().Format(time.RFC3339)))),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		drafts = append(drafts, draft)
	}

	return drafts
}

// DetectDriveType 根据 URL 特征识别网盘类型
func (s *TelegramCrawlerService) DetectDriveType(urlStr string) string {
	low := strings.ToLower(urlStr)
	switch {
	case strings.Contains(low, "quark.cn"):
		return "quark"
	case strings.Contains(low, "baidu.com"):
		return "baidu"
	case strings.Contains(low, "alipan.com") || strings.Contains(low, "aliyundrive.com"):
		return "alipan"
	case strings.Contains(low, "xunlei.com"):
		return "xunlei"
	case strings.Contains(low, "123pan.com") || strings.Contains(low, "123684.com"):
		return "123pan"
	case strings.Contains(low, "189.cn"):
		return "tianyi"
	default:
		return ""
	}
}

// ExtractTitleFromText 智能清洗并提取适合展示的标题
func (s *TelegramCrawlerService) ExtractTitleFromText(rawText string) string {
	lines := strings.Split(rawText, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// 忽略纯链接行
		if strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			continue
		}
		// 忽略纯提取码或大小行
		if strings.HasPrefix(line, "提取码") || strings.HasPrefix(line, "密码") || strings.HasPrefix(line, "大小") {
			continue
		}

		// 清洗开头的 Emoji、标签等
		clean := regexp.MustCompile(`^[^\p{Han}\w]+`).ReplaceAllString(line, "")
		clean = regexp.MustCompile(`^(资源名称|名称|标题|书名)[:：\s]*`).ReplaceAllString(clean, "")
		clean = strings.TrimSpace(clean)

		if len([]rune(clean)) >= 4 && len([]rune(clean)) <= 80 {
			return clean
		}
	}

	// 如果没有找到合适的单行，返回截断的首句
	runes := []rune(strings.TrimSpace(rawText))
	if len(runes) > 50 {
		return string(runes[:50]) + "..."
	}
	return string(runes)
}

// ManualIngest 手动粘贴原始文本进行智能解析并加入草稿池
func (s *TelegramCrawlerService) ManualIngest(rawText string, sourceName string, driveType string) ([]model.ResourceDraft, error) {
	rawText = strings.TrimSpace(rawText)
	if rawText == "" {
		return nil, fmt.Errorf("提交的文本内容为空")
	}

	if sourceName == "" {
		sourceName = "手动粘贴采集"
	}

	drafts := s.ExtractDraftsFromText(rawText, sourceName, "manual", time.Now().Unix(), driveType)
	if len(drafts) == 0 {
		return nil, fmt.Errorf("未能从提交的文本中识别到有效的网盘分享链接 (支持夸克/百度/阿里/迅雷)")
	}

	var inserted []model.ResourceDraft
	for _, draft := range drafts {
		var existing model.ResourceDraft
		if err := s.db.Where("share_url = ?", draft.ShareURL).First(&existing).Error; err == nil {
			// 已存在跳过
			continue
		}
		if err := s.db.Create(&draft).Error; err == nil {
			inserted = append(inserted, draft)
		}
	}

	return inserted, nil
}

// SetWebhook 向 Telegram 官方注册 Webhook 回调地址
func (s *TelegramCrawlerService) SetWebhook(webhookURL string) error {
	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return fmt.Errorf("读取配置失败: %w", err)
	}
	if strings.TrimSpace(cfg.BotToken) == "" {
		return fmt.Errorf("Bot Token 为空，请先配置机器人凭证")
	}
	if strings.TrimSpace(webhookURL) == "" {
		webhookURL = "https://api.xuebaw.com:8443/api/v1/public/telegram/webhook"
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook?url=%s&drop_pending_updates=true", cfg.BotToken, url.QueryEscape(webhookURL))
	req, err := http.NewRequest("POST", apiURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("请求 Telegram setWebhook 失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var tgResp struct {
		Ok          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(body, &tgResp); err != nil {
		return fmt.Errorf("解析 Telegram 响应失败: %s", string(body))
	}
	if !tgResp.Ok {
		return fmt.Errorf("Telegram 拒绝: %s", tgResp.Description)
	}

	cfg.SyncMode = "webhook"
	cfg.WebhookURL = webhookURL
	cfg.LastSyncStatus = "success"
	now := time.Now()
	cfg.LastSyncAt = &now
	cfg.LastSyncMessage = fmt.Sprintf("⚡ Webhook 实时自动触发已就绪 (%s)", webhookURL)
	s.db.Save(&cfg)
	return nil
}

// DeleteWebhook 取消 Webhook 并恢复定时轮询模式
func (s *TelegramCrawlerService) DeleteWebhook() error {
	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return fmt.Errorf("读取配置失败: %w", err)
	}
	if strings.TrimSpace(cfg.BotToken) == "" {
		return fmt.Errorf("Bot Token 为空")
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/deleteWebhook?drop_pending_updates=false", cfg.BotToken)
	req, err := http.NewRequest("POST", apiURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("请求 Telegram deleteWebhook 失败: %w", err)
	}
	defer resp.Body.Close()

	cfg.SyncMode = "polling"
	cfg.LastSyncStatus = "idle"
	cfg.LastSyncMessage = "已取消 Webhook，切回定时自动轮询模式"
	s.db.Save(&cfg)
	return nil
}

// GetWebhookInfo 获取 Telegram 官方 Webhook 真实状态
func (s *TelegramCrawlerService) GetWebhookInfo() (map[string]interface{}, error) {
	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}
	if strings.TrimSpace(cfg.BotToken) == "" {
		return nil, fmt.Errorf("Bot Token 为空")
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getWebhookInfo", cfg.BotToken)
	resp, err := s.client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result, nil
}

