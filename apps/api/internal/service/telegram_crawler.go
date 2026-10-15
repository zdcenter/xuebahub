package service

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
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
			Timeout: 25 * time.Second,
		},
	}
	// 完全采用 Telegram 官方 Webhook 实时自动推送架构，彻底取消 60 秒轮询
	// 启动时自动异步校验并确保 Webhook 地址就绪
	go s.ensureWebhookActive()
	return s
}

// getClient 动态获取支持 Proxy 和 TLS 的 HTTP 客户端
func (s *TelegramCrawlerService) getClient(cfg *model.TelegramConfig) *http.Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		Proxy:           http.ProxyFromEnvironment,
	}

	proxyStr := ""
	if cfg != nil && strings.TrimSpace(cfg.ProxyURL) != "" {
		proxyStr = strings.TrimSpace(cfg.ProxyURL)
	} else if p := os.Getenv("HTTPS_PROXY"); p != "" {
		proxyStr = p
	} else if p := os.Getenv("HTTP_PROXY"); p != "" {
		proxyStr = p
	} else if p := os.Getenv("https_proxy"); p != "" {
		proxyStr = p
	} else if p := os.Getenv("http_proxy"); p != "" {
		proxyStr = p
	} else if p := os.Getenv("all_proxy"); p != "" {
		proxyStr = p
	}

	if proxyStr != "" {
		if u, err := url.Parse(proxyStr); err == nil {
			transport.Proxy = http.ProxyURL(u)
		}
	} else {
		// 智能探测本地 Clash / Clash Verge (7897, 7890) 代理端口
		for _, port := range []string{"7897", "7890"} {
			conn, err := net.DialTimeout("tcp", "127.0.0.1:"+port, 150*time.Millisecond)
			if err == nil {
				conn.Close()
				if u, err := url.Parse("http://127.0.0.1:" + port); err == nil {
					transport.Proxy = http.ProxyURL(u)
					break
				}
			}
		}
	}

	return &http.Client{
		Timeout:   25 * time.Second,
		Transport: transport,
	}
}

// getApiBaseURL 获取 Telegram API 网关地址 (支持反代或官方默认)
func (s *TelegramCrawlerService) getApiBaseURL(cfg *model.TelegramConfig) string {
	if cfg != nil && strings.TrimSpace(cfg.ApiBaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(cfg.ApiBaseURL), "/")
	}
	return "https://api.telegram.org"
}

// ensureWebhookActive 系统启动时自动确保 Webhook 处于活跃注册状态 (纯 Webhook 实时触发模式，彻底取消后台定时轮询)
func (s *TelegramCrawlerService) ensureWebhookActive() {
	time.Sleep(2 * time.Second)
	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return
	}
	if strings.TrimSpace(cfg.BotToken) != "" {
		_ = s.SetWebhook(cfg.WebhookURL)
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
	client := s.getClient(&cfg)
	baseURL := s.getApiBaseURL(&cfg)
	offset := cfg.LastUpdateID + 1
	tgURL := fmt.Sprintf("%s/bot%s/getUpdates?offset=%d&limit=100&timeout=5", baseURL, cfg.BotToken, offset)

	req, err := http.NewRequest("GET", tgURL, nil)
	if err != nil {
		s.updateSyncStatus(&cfg, "error", fmt.Sprintf("构建请求失败: %v", err))
		return nil, err
	}
	req.Header.Set("User-Agent", "NetdiskCrawler/1.0")

	resp, err := client.Do(req)
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
		if strings.TrimSpace(cfg.WebhookURL) != "" {
			webhookURL = strings.TrimSpace(cfg.WebhookURL)
		} else {
			webhookURL = "https://api.xuebaw.com:8443/api/v1/public/telegram/webhook"
		}
	}
	client := s.getClient(&cfg)
	baseURL := s.getApiBaseURL(&cfg)
	apiURL := fmt.Sprintf("%s/bot%s/setWebhook?url=%s&drop_pending_updates=true", baseURL, cfg.BotToken, url.QueryEscape(webhookURL))
	req, err := http.NewRequest("POST", apiURL, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
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

	client := s.getClient(&cfg)
	baseURL := s.getApiBaseURL(&cfg)
	apiURL := fmt.Sprintf("%s/bot%s/deleteWebhook?drop_pending_updates=false", baseURL, cfg.BotToken)
	req, err := http.NewRequest("POST", apiURL, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
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

	client := s.getClient(&cfg)
	baseURL := s.getApiBaseURL(&cfg)
	apiURL := fmt.Sprintf("%s/bot%s/getWebhookInfo", baseURL, cfg.BotToken)
	resp, err := client.Get(apiURL)
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

// ResolveChannel 根据输入的用户名前缀 (@xxx) 或 t.me 链接或数字 ID 智能解析频道真实信息
func (s *TelegramCrawlerService) ResolveChannel(input string) (*model.TelegramChannel, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, fmt.Errorf("频道输入不能为空")
	}

	chatTarget := input
	if strings.Contains(input, "t.me/") {
		parts := strings.Split(input, "t.me/")
		if len(parts) > 1 {
			target := strings.Trim(parts[1], "/")
			target = strings.Split(target, "?")[0]
			target = strings.Split(target, "/")[0]
			if !strings.HasPrefix(target, "+") && !strings.HasPrefix(target, "joinchat") {
				chatTarget = "@" + target
			}
		}
	} else if !strings.HasPrefix(input, "@") && !strings.HasPrefix(input, "-") {
		matched, _ := regexp.MatchString(`^[a-zA-Z0-9_]{4,}$`, input)
		if matched {
			chatTarget = "@" + input
		}
	}

	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil || strings.TrimSpace(cfg.BotToken) == "" {
		return nil, fmt.Errorf("未配置 Telegram Bot Token，无法调用 Telegram API")
	}

	client := s.getClient(&cfg)
	baseURL := s.getApiBaseURL(&cfg)
	apiURL := fmt.Sprintf("%s/bot%s/getChat?chat_id=%s", baseURL, cfg.BotToken, url.QueryEscape(chatTarget))

	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("请求 Telegram getChat 失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var tgResp struct {
		Ok          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			ID          int64  `json:"id"`
			Title       string `json:"title"`
			Username    string `json:"username"`
			Type        string `json:"type"`
			Description string `json:"description"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &tgResp); err != nil {
		return nil, fmt.Errorf("解析 Telegram 响应失败: %w", err)
	}
	if !tgResp.Ok {
		return nil, fmt.Errorf("Telegram 无法找到该频道: %s (请确认频道是否为公开频道，或已将 Bot 加入该频道)", tgResp.Description)
	}

	driveType := "auto"
	lowerTitle := strings.ToLower(tgResp.Result.Title + " " + tgResp.Result.Description + " " + tgResp.Result.Username)
	if strings.Contains(lowerTitle, "夸克") || strings.Contains(lowerTitle, "quark") {
		driveType = "quark"
	} else if strings.Contains(lowerTitle, "百度") || strings.Contains(lowerTitle, "baidu") {
		driveType = "baidu"
	} else if strings.Contains(lowerTitle, "阿里") || strings.Contains(lowerTitle, "alipan") {
		driveType = "alipan"
	}

	ch := &model.TelegramChannel{
		ChannelID: fmt.Sprintf("%d", tgResp.Result.ID),
		Name:      tgResp.Result.Title,
		DriveType: driveType,
		IsActive:  true,
		Remark:    tgResp.Result.Description,
	}
	return ch, nil
}

// BroadcastResource 将入库发布的资料排版成高颜值图文消息，自动广播推送到站长自己的 Telegram 频道列表
func (s *TelegramCrawlerService) BroadcastResource(res *model.Resource, customChannelID string) error {
	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil || strings.TrimSpace(cfg.BotToken) == "" {
		return fmt.Errorf("Telegram 机器人未配置")
	}

	var targets []string
	if strings.TrimSpace(customChannelID) != "" {
		targets = append(targets, strings.TrimSpace(customChannelID))
	} else {
		// 从广播频道列表中获取所有处于激活状态的频道
		var bChannels []model.TelegramBroadcastChannel
		s.db.Where("is_active = ?", true).Find(&bChannels)
		for _, bc := range bChannels {
			if strings.TrimSpace(bc.ChannelID) != "" {
				targets = append(targets, strings.TrimSpace(bc.ChannelID))
			}
		}
		// 如果广播频道列表为空，回退到历史配置中的 BroadcastChannelID
		if len(targets) == 0 && strings.TrimSpace(cfg.BroadcastChannelID) != "" {
			targets = append(targets, strings.TrimSpace(cfg.BroadcastChannelID))
		}
	}

	if len(targets) == 0 {
		return fmt.Errorf("未配置任何活跃的广播频道，请先在【资源广播中枢】添加并启用至少一个广播频道")
	}

	var links []model.ResourceLink
	s.db.Where("resource_id = ? AND status = ?", res.ID, "active").Find(&links)
	if len(links) == 0 && len(res.Links) > 0 {
		links = res.Links
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("📚 <b>【2026精选真题】%s</b>\n\n", htmlEscape(res.Title)))

	sb.WriteString(fmt.Sprintf("📌 <b>分类信息</b>：%s · %s · %s", htmlEscape(res.Stage), htmlEscape(res.Grade), htmlEscape(res.Subject)))
	if res.Edition != "" {
		sb.WriteString(fmt.Sprintf(" (%s)", htmlEscape(res.Edition)))
	}
	sb.WriteString("\n")

	if res.FileType != "" || res.FileSize != "" {
		sb.WriteString(fmt.Sprintf("💾 <b>资料规格</b>：%s", htmlEscape(res.FileType)))
		if res.FileSize != "" {
			sb.WriteString(fmt.Sprintf(" · %s", htmlEscape(res.FileSize)))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("\n")

	if len(links) > 0 {
		for _, l := range links {
			driveName := "网盘"
			switch strings.ToLower(l.DriveType) {
			case "quark":
				driveName = "夸克网盘"
			case "baidu":
				driveName = "百度网盘"
			case "alipan":
				driveName = "阿里网盘"
			case "xunlei":
				driveName = "迅雷网盘"
			}
			sb.WriteString(fmt.Sprintf("📂 <b>%s</b>：\n", driveName))
			sb.WriteString(fmt.Sprintf("🔗 直达链接：<a href=\"%s\">%s</a>\n", l.ShareURL, l.ShareURL))
			if l.ExtractCode != "" {
				sb.WriteString(fmt.Sprintf("🔑 提取密码：<code>%s</code>\n", htmlEscape(l.ExtractCode)))
			}
			sb.WriteString("\n")
		}
	}

	slugOrID := strings.TrimSpace(res.Slug)
	if slugOrID == "" {
		slugOrID = res.ID.String()
	}
	landingURL := fmt.Sprintf("https://xuebaw.com/resource/%s", slugOrID)
	sb.WriteString(fmt.Sprintf("🌐 <b>学霸网全套真题与微课在线预览与A4打印</b>：\n👉 <a href=\"%s\">%s</a>\n\n", landingURL, landingURL))
	sb.WriteString("⚡ <i>学霸网 (xuebaw.com) · 每日精选名校试卷与课件实时更新</i>")

	msgText := sb.String()
	var successCount int
	var lastErr error

	for _, target := range targets {
		if !strings.HasPrefix(target, "@") && !strings.HasPrefix(target, "-") {
			target = "@" + target
		}
		if err := s.sendTelegramMessage(&cfg, target, msgText); err != nil {
			log.Printf("[BroadcastResource] 推送到频道 %s 失败: %v", target, err)
			lastErr = err
		} else {
			successCount++
			s.db.Model(&model.TelegramBroadcastChannel{}).
				Where("channel_id = ? OR channel_id = ?", target, strings.TrimPrefix(target, "@")).
				UpdateColumn("item_count", gorm.Expr("item_count + ?", 1))
		}
	}

	if successCount == 0 && lastErr != nil {
		return fmt.Errorf("广播推送失败: %w", lastErr)
	}

	return nil
}

// SendTestBroadcast 发送一条测试广播验证机器人发帖权限 (支持指定频道或测试全部活跃频道)
func (s *TelegramCrawlerService) SendTestBroadcast(targetChannel string) error {
	var cfg model.TelegramConfig
	if err := s.db.First(&cfg).Error; err != nil || strings.TrimSpace(cfg.BotToken) == "" {
		return fmt.Errorf("Telegram 机器人未配置")
	}

	var targets []string
	if strings.TrimSpace(targetChannel) != "" {
		targets = append(targets, strings.TrimSpace(targetChannel))
	} else {
		var bChannels []model.TelegramBroadcastChannel
		s.db.Where("is_active = ?", true).Find(&bChannels)
		for _, bc := range bChannels {
			if strings.TrimSpace(bc.ChannelID) != "" {
				targets = append(targets, strings.TrimSpace(bc.ChannelID))
			}
		}
		if len(targets) == 0 && strings.TrimSpace(cfg.BroadcastChannelID) != "" {
			targets = append(targets, strings.TrimSpace(cfg.BroadcastChannelID))
		}
	}

	if len(targets) == 0 {
		return fmt.Errorf("请提供广播频道或先在【资源广播中枢】添加并启用至少一个广播频道")
	}

	testMsg := "🎉 <b>学霸网资源发布机器人 · 广播通道连接成功！</b>\n\n" +
		"✅ 本频道已成功与【学霸网资源中台】建立专属推送链路。\n" +
		"⚡ 后续在管理后台审核发布新资料或从采集草稿池一键入库时，将自动秒级广播到本频道，向全体订阅者推送最新试卷与网盘转存直达链接！\n\n" +
		"🌐 官方主站：<a href=\"https://xuebaw.com\">https://xuebaw.com</a>"

	var successCount int
	var lastErr error
	for _, target := range targets {
		if !strings.HasPrefix(target, "@") && !strings.HasPrefix(target, "-") {
			target = "@" + target
		}
		if err := s.sendTelegramMessage(&cfg, target, testMsg); err != nil {
			log.Printf("[SendTestBroadcast] 测试推送到频道 %s 失败: %v", target, err)
			lastErr = err
		} else {
			successCount++
		}
	}

	if successCount == 0 && lastErr != nil {
		return fmt.Errorf("测试广播发送失败: %w (请确保已将 Bot 添加为频道管理员并开启发帖权限)", lastErr)
	}

	return nil
}

func (s *TelegramCrawlerService) sendTelegramMessage(cfg *model.TelegramConfig, chatID string, text string) error {
	client := s.getClient(cfg)
	baseURL := s.getApiBaseURL(cfg)
	apiURL := fmt.Sprintf("%s/bot%s/sendMessage", baseURL, cfg.BotToken)

	payload := map[string]interface{}{
		"chat_id":                  chatID,
		"text":                     text,
		"parse_mode":               "HTML",
		"disable_web_page_preview": false,
	}
	bodyBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("连接 Telegram API 失败: %w", err)
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
		return fmt.Errorf("Telegram 拒绝发送: %s (请确保已将 Bot 添加为该频道的管理员，并赋予'发布消息'权限)", tgResp.Description)
	}

	return nil
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

