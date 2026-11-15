package service

import (
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log"
	"net/smtp"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"netdisk/api/internal/model"
)

type EmailService struct {
	db *gorm.DB
	mu sync.Mutex
}

func NewEmailService(db *gorm.DB) *EmailService {
	return &EmailService{db: db}
}

// ExtractionResult 邮箱提取清洗与去重统计结果
type ExtractionResult struct {
	TotalFound       int      `json:"total_found"`        // 原始文本匹配到的邮箱/QQ号总数
	BatchUniqueCount int      `json:"batch_unique_count"` // 本次文本内去重后的独立邮箱数
	ExistingCount    int      `json:"existing_count"`     // 数据库名录中已存在的邮箱数
	NewInsertedCount int      `json:"new_inserted_count"` // 本次全新入库的有效邮箱数
	SampleEmails     []string `json:"sample_emails"`      // 预览样本 (最多前15个)
}

// ExtractAndCleanContacts 智能多源文本清洗提取并入库
// 1. 自动提取标准邮箱 (如 xxx@163.com)
// 2. 自动检测 5~11 位纯 QQ 号并智能补全为 xxx@qq.com (支持QQ群成员复制文本、聊天记录)
// 3. 全局大小写归一化、去空白、批次内去重
// 4. 数据库查重，仅将全新邮箱插入数据库，并记录标签和来源
func (s *EmailService) ExtractAndCleanContacts(rawText string, groupTag string, source string) (*ExtractionResult, error) {
	if strings.TrimSpace(rawText) == "" {
		return &ExtractionResult{}, nil
	}

	if groupTag == "" {
		groupTag = "general"
	}
	if source == "" {
		source = "paste"
	}

	// 1. 正则匹配标准邮箱
	emailRegex := regexp.MustCompile(`(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`)
	matches := emailRegex.FindAllString(rawText, -1)

	// 2. 智能提取纯 QQ 号 (如 QQ 群列表中的 12345678, 或 (12345678), 或 QQ: 12345678)
	// 避免把邮箱前缀里的数字重复匹配：先将文本中已匹配到的标准邮箱临时占位或做前后边界判定
	qqRegex := regexp.MustCompile(`(?:^|[^a-zA-Z0-9@._\-])([1-9][0-9]{4,10})(?:[^a-zA-Z0-9@._\-]|\b|$)`)
	qqMatches := qqRegex.FindAllStringSubmatch(rawText, -1)

	uniqueMap := make(map[string]bool)
	var allExtracted []string

	// 处理标准邮箱
	for _, m := range matches {
		cleaned := strings.ToLower(strings.TrimSpace(m))
		if cleaned != "" {
			allExtracted = append(allExtracted, cleaned)
			uniqueMap[cleaned] = true
		}
	}

	// 处理 QQ 号转为 @qq.com
	for _, qm := range qqMatches {
		if len(qm) > 1 {
			qqNum := qm[1]
			// 过滤掉普通端口号(如 4001, 8080)或年份(如 2026)等非 QQ 号长数字：QQ号通常至少 5 位且非极常见年份
			if len(qqNum) >= 5 && len(qqNum) <= 11 && qqNum != "2024" && qqNum != "2025" && qqNum != "2026" {
				qqEmail := fmt.Sprintf("%s@qq.com", qqNum)
				allExtracted = append(allExtracted, qqEmail)
				uniqueMap[qqEmail] = true
			}
		}
	}

	batchUnique := make([]string, 0, len(uniqueMap))
	for e := range uniqueMap {
		batchUnique = append(batchUnique, e)
	}

	if len(batchUnique) == 0 {
		return &ExtractionResult{
			TotalFound: len(allExtracted),
		}, nil
	}

	// 3. 查重：分批检查数据库中已存在的邮箱
	existingMap := make(map[string]bool)
	const chunkSize = 500
	for i := 0; i < len(batchUnique); i += chunkSize {
		end := i + chunkSize
		if end > len(batchUnique) {
			end = len(batchUnique)
		}
		chunk := batchUnique[i:end]

		var existing []string
		s.db.Model(&model.EmailContact{}).Where("email IN ?", chunk).Pluck("email", &existing)
		for _, e := range existing {
			existingMap[strings.ToLower(e)] = true
		}
	}

	// 4. 组装待入库的新邮箱列表
	var toInsert []model.EmailContact
	var sampleEmails []string

	for _, email := range batchUnique {
		if !existingMap[email] {
			toInsert = append(toInsert, model.EmailContact{
				Email:     email,
				GroupTag:  groupTag,
				Source:    source,
				Status:    "active",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			})
			if len(sampleEmails) < 15 {
				sampleEmails = append(sampleEmails, email)
			}
		}
	}

	// 5. 批量写入数据库 (每 200 条一批)
	if len(toInsert) > 0 {
		if err := s.db.CreateInBatches(toInsert, 200).Error; err != nil {
			log.Printf("[EmailService] Error batch inserting contacts: %v", err)
			return nil, err
		}
	}

	return &ExtractionResult{
		TotalFound:       len(allExtracted),
		BatchUniqueCount: len(batchUnique),
		ExistingCount:    len(existingMap),
		NewInsertedCount: len(toInsert),
		SampleEmails:     sampleEmails,
	}, nil
}

// GetEmailConfig 获取发信配置
func (s *EmailService) GetEmailConfig() (*model.EmailConfig, error) {
	var cfg model.EmailConfig
	err := s.db.First(&cfg, "id = ?", "global").Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			defaultCfg := model.EmailConfig{
				ID:              "global",
				SMTPHost:        "smtp.qq.com",
				SMTPPort:        465,
				SenderName:      "学霸网精选真题",
				SenderEmail:     "",
				DailyLimit:      500,
				IntervalSeconds: 1.5,
				IsEnabled:       true,
			}
			s.db.Create(&defaultCfg)
			return &defaultCfg, nil
		}
		return nil, err
	}
	return &cfg, nil
}

// SaveEmailConfig 保存发信配置
func (s *EmailService) SaveEmailConfig(cfg *model.EmailConfig) error {
	cfg.ID = "global"
	cfg.UpdatedAt = time.Now()
	return s.db.Save(cfg).Error
}

// SendTestEmail 发送测试邮件验证 SMTP 凭据
func (s *EmailService) SendTestEmail(toEmail string) error {
	cfg, err := s.GetEmailConfig()
	if err != nil {
		return err
	}
	if cfg.SMTPUser == "" || cfg.SMTPPass == "" {
		return fmt.Errorf("SMTP 账号或密码/授权码未配置")
	}

	subject := "【学霸网 xuebaw.com】邮件推送与 SMTP 通道连通性测试"
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #334155;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #0f172a 0%%, #0284c7 100%%); padding: 24px 28px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">👑 学霸网 · 邮件服务测试成功</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">中小学名校同步教辅 · 网盘真题学习资源分享平台</p>
    </div>
    <div style="padding: 24px 28px; font-size: 14px; line-height: 1.7;">
      <p style="margin: 0 0 12px 0;">恭喜！您的 SMTP 发信通道已成功连通！</p>
      <div style="background: #f1f5f9; padding: 14px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 16px;">
        <div>📡 发信主机: <b>%s:%d</b></div>
        <div>👤 发件名称: <b>%s</b></div>
        <div>✉️ 发信地址: <b>%s</b></div>
        <div>🕒 发送时间: <b>%s</b></div>
      </div>
      <p style="color: #64748b; font-size: 12.5px; margin: 0;">现在您可以通过管理后台一键向目标家长、考生推送最新真题试卷和网盘转存资源。</p>
    </div>
    <div style="padding: 14px 28px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8;">
      学霸网 官方网址: <a href="https://xuebaw.com" style="color: #0284c7; text-decoration: none;">https://xuebaw.com</a>
    </div>
  </div>
</body>
</html>`, cfg.SMTPHost, cfg.SMTPPort, cfg.SenderName, cfg.SenderEmail, time.Now().Format("2006-01-02 15:04:05"))

	sendErr := s.sendRawEmail(cfg, toEmail, subject, htmlBody)
	now := time.Now()
	cfg.LastTestedAt = &now
	if sendErr != nil {
		cfg.LastTestStatus = "error"
		cfg.LastTestMsg = sendErr.Error()
		s.SaveEmailConfig(cfg)
		return sendErr
	}

	cfg.LastTestStatus = "success"
	cfg.LastTestMsg = "测试邮件发送成功！"
	s.SaveEmailConfig(cfg)
	return nil
}

// sendRawEmail 底层 SMTP 发送器 (自适应 465 SSL 与 587/25 TLS)
func (s *EmailService) sendRawEmail(cfg *model.EmailConfig, toEmail string, subject string, htmlBody string) error {
	from := cfg.SenderEmail
	if from == "" {
		from = cfg.SMTPUser
	}
	senderName := cfg.SenderName
	if senderName == "" {
		senderName = "学霸网"
	}

	header := make(map[string]string)
	header["From"] = fmt.Sprintf("=?UTF-8?B?%s?= <%s>", encodeBase64(senderName), from)
	header["To"] = toEmail
	header["Subject"] = fmt.Sprintf("=?UTF-8?B?%s?=", encodeBase64(subject))
	header["MIME-Version"] = "1.0"
	header["Content-Type"] = "text/html; charset=UTF-8"
	header["Date"] = time.Now().Format(time.RFC1123Z)

	message := ""
	for k, v := range header {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + htmlBody

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)

	// 如果端口是 465，使用直接 TLS/SSL 握手 (QQ邮箱、163 等最推荐)
	if cfg.SMTPPort == 465 {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         cfg.SMTPHost,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("TLS 连接 SMTP 服务器失败: %v", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return fmt.Errorf("创建 SMTP Client 失败: %v", err)
		}
		defer client.Close()

		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP 认证失败 (请核对账号与授权码/密码): %v", err)
		}

		if err := client.Mail(from); err != nil {
			return fmt.Errorf("MAIL FROM 错误: %v", err)
		}
		if err := client.Rcpt(toEmail); err != nil {
			return fmt.Errorf("RCPT TO 错误: %v", err)
		}
		w, err := client.Data()
		if err != nil {
			return fmt.Errorf("DATA 错误: %v", err)
		}
		_, err = w.Write([]byte(message))
		if err != nil {
			return err
		}
		return w.Close()
	}

	// 针对 587/25 端口，使用标准 STARTTLS
	auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	return smtp.SendMail(addr, auth, from, []string{toEmail}, []byte(message))
}

// encodeBase64 工具函数
func encodeBase64(str string) string {
	return base64.StdEncoding.EncodeToString([]byte(str))
}

// SendCampaignRequest 营销群发请求参数
type SendCampaignRequest struct {
	CampaignType   string    `json:"campaign_type"` // resource (资料推荐), site (站点推广)
	ResourceID     string    `json:"resource_id"`
	Subject        string    `json:"subject"`
	CustomMessage  string    `json:"custom_message"`
	TargetType     string    `json:"target_type"` // all(全量), tag(按标签), manual(临时直接贴入)
	TargetTag      string    `json:"target_tag"`
	ManualEmails   string    `json:"manual_emails"`   // 文本框直接贴入的邮箱/QQ
	SkipRecentDays int       `json:"skip_recent_days"` // 排除 X 天内已发送过的邮箱 (防重复打扰)
}

// SendCampaign 执行营销群发活动 (异步后台协程排队)
func (s *EmailService) SendCampaign(req SendCampaignRequest) (*model.EmailCampaignLog, error) {
	cfg, err := s.GetEmailConfig()
	if err != nil {
		return nil, err
	}
	if cfg.SMTPUser == "" || cfg.SMTPPass == "" {
		return nil, fmt.Errorf("请先在发信设置中配置 SMTP 账号与授权码")
	}

	var resTitle string
	var resource model.Resource
	if req.CampaignType == "resource" && req.ResourceID != "" {
		if err := s.db.Preload("Links").First(&resource, "id = ?", req.ResourceID).Error; err == nil {
			resTitle = resource.Title
		}
	}

	// 收集目标邮箱并去重
	var targetEmails []string
	uniqueMap := make(map[string]bool)

	if req.TargetType == "manual" {
		// 临时直接输入的文本，使用智能提取器
		res, _ := s.ExtractAndCleanContacts(req.ManualEmails, "manual", "manual")
		for _, e := range res.SampleEmails {
			uniqueMap[e] = true
		}
		// 查出本批次所有入库/提取的
		emailRegex := regexp.MustCompile(`(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`)
		for _, m := range emailRegex.FindAllString(req.ManualEmails, -1) {
			uniqueMap[strings.ToLower(strings.TrimSpace(m))] = true
		}
	} else if req.TargetType == "tag" && req.TargetTag != "" {
		var contacts []model.EmailContact
		query := s.db.Where("group_tag = ? AND status = ?", req.TargetTag, "active")
		if req.SkipRecentDays > 0 {
			cutoff := time.Now().AddDate(0, 0, -req.SkipRecentDays)
			query = query.Where("last_sent_at IS NULL OR last_sent_at < ?", cutoff)
		}
		query.Find(&contacts)
		for _, c := range contacts {
			uniqueMap[c.Email] = true
		}
	} else {
		// all 全量激活联系人
		var contacts []model.EmailContact
		query := s.db.Where("status = ?", "active")
		if req.SkipRecentDays > 0 {
			cutoff := time.Now().AddDate(0, 0, -req.SkipRecentDays)
			query = query.Where("last_sent_at IS NULL OR last_sent_at < ?", cutoff)
		}
		query.Find(&contacts)
		for _, c := range contacts {
			uniqueMap[c.Email] = true
		}
	}

	for e := range uniqueMap {
		targetEmails = append(targetEmails, e)
	}

	if len(targetEmails) == 0 {
		return nil, fmt.Errorf("未筛选到任何有效的目标收件邮箱 (可能均在近期冷却期内或输入为空)")
	}

	subject := req.Subject
	if subject == "" {
		if resTitle != "" {
			subject = fmt.Sprintf("【备考精选真题】%s - A4高清可打印", resTitle)
		} else {
			subject = "【学霸网】中小学名校同步教辅与期末冲刺真题网盘合集已更新！"
		}
	}

	var resIDPtr *uuid.UUID
	if resource.ID != uuid.Nil {
		resIDPtr = &resource.ID
	}

	campaign := model.EmailCampaignLog{
		CampaignType:  req.CampaignType,
		ResourceID:    resIDPtr,
		ResourceTitle: resTitle,
		Subject:       subject,
		TotalCount:    len(targetEmails),
		TargetTag:     req.TargetTag,
		Status:        "sending",
		CreatedAt:     time.Now(),
	}
	if err := s.db.Create(&campaign).Error; err != nil {
		return nil, err
	}

	// 渲染 HTML 邮件正文
	htmlContent := s.renderCampaignHTML(resource, req.CustomMessage, subject)

	// 启动后台异步协程平滑排队发信
	go s.processCampaignBackground(campaign.ID, targetEmails, subject, htmlContent, cfg.IntervalSeconds)

	return &campaign, nil
}

// processCampaignBackground 后台异步发信协程 (严格遵守频控间隔，避免被判垃圾邮件)
func (s *EmailService) processCampaignBackground(campaignID uuid.UUID, emails []string, subject string, htmlBody string, intervalSeconds float64) {
	if intervalSeconds < 0.5 {
		intervalSeconds = 1.0
	}

	successCount := 0
	failedCount := 0

	for _, to := range emails {
		cfg, err := s.GetEmailConfig()
		if err != nil || !cfg.IsEnabled {
			break
		}

		sendErr := s.sendRawEmail(cfg, to, subject, htmlBody)
		now := time.Now()

		if sendErr != nil {
			failedCount++
			log.Printf("[EmailService] Failed to send email to %s: %v", to, sendErr)
		} else {
			successCount++
			// 更新联系人的发送计数与最后时间
			s.db.Model(&model.EmailContact{}).Where("email = ?", to).Updates(map[string]interface{}{
				"send_count":   gorm.Expr("send_count + 1"),
				"last_sent_at": &now,
			})
		}

		// 实时更新批次进度
		s.db.Model(&model.EmailCampaignLog{}).Where("id = ?", campaignID).Updates(map[string]interface{}{
			"success_count": successCount,
			"failed_count":  failedCount,
		})

		time.Sleep(time.Duration(intervalSeconds * float64(time.Second)))
	}

	completedAt := time.Now()
	finalStatus := "completed"
	if successCount == 0 && failedCount > 0 {
		finalStatus = "failed"
	}
	s.db.Model(&model.EmailCampaignLog{}).Where("id = ?", campaignID).Updates(map[string]interface{}{
		"status":       finalStatus,
		"completed_at": &completedAt,
	})
	log.Printf("[EmailService] Campaign %s finished. Success: %d, Failed: %d", campaignID, successCount, failedCount)
}

// renderCampaignHTML 生成高转化高质感响应式邮件正文
func (s *EmailService) renderCampaignHTML(res model.Resource, customMsg string, subject string) string {
	resBlock := ""
	if res.ID != uuid.Nil {
		linksHTML := ""
		for _, l := range res.Links {
			driveName := "夸克网盘"
			if l.DriveType == "baidu" {
				driveName = "百度网盘"
			} else if l.DriveType == "alipan" {
				driveName = "阿里云盘"
			}
			codeText := ""
			if l.ExtractCode != "" {
				codeText = fmt.Sprintf(" (提取码: <b>%s</b>)", l.ExtractCode)
			}
			linksHTML += fmt.Sprintf(`
        <div style="margin-top: 8px;">
          <a href="%s" target="_blank" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13.5px; box-shadow: 0 2px 6px rgba(2,132,199,0.3);">
            ⚡ 保存 %s 资源文件%s
          </a>
        </div>`, l.ShareURL, driveName, codeText)
		}

		resURL := fmt.Sprintf("https://xuebaw.com/resource/%s", res.Slug)
		resBlock = fmt.Sprintf(`
      <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 18px 0;">
        <div style="font-size: 11.5px; color: #0284c7; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">🎯 重点真题推荐</div>
        <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #0f172a; line-height: 1.5;">%s</h3>
        <p style="margin: 0 0 14px 0; font-size: 13px; color: #64748b; line-height: 1.6;">%s</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
          <span style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">📄 100%% A4矢量极清打印</span>
          <span style="background: #ecfdf5; color: #065f46; padding: 3px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">🎬 4K原画微课视频</span>
          <span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">🔒 永久防丢</span>
        </div>
        %s
        <div style="margin-top: 14px; font-size: 12px; color: #64748b;">
          在线试看与答题卡下载: <a href="%s" style="color: #0284c7; text-decoration: underline;">点击进入学霸网查看试卷详情</a>
        </div>
      </div>`, res.Title, res.Description, linksHTML, resURL)
	}

	customMsgBlock := ""
	if strings.TrimSpace(customMsg) != "" {
		customMsgBlock = fmt.Sprintf(`
      <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; font-size: 13.5px; color: #1e40af; line-height: 1.7; margin-bottom: 16px;">
        %s
      </div>`, strings.ReplaceAll(customMsg, "\n", "<br>"))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', sans-serif; background: #f1f5f9; color: #334155;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    
    <!-- 顶部品牌彩条 -->
    <div style="background: linear-gradient(135deg, #0f172a 0%%, #0369a1 60%%, #0284c7 100%%); padding: 24px 28px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 12px; font-weight: 700; background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 12px; letter-spacing: 0.5px;">👑 学霸网 · 精选资料推送</span>
        <span style="font-size: 12px; opacity: 0.85;">xuebaw.com</span>
      </div>
      <h1 style="margin: 12px 0 0 0; font-size: 18px; font-weight: 700; line-height: 1.4;">%s</h1>
    </div>

    <!-- 正文内容区 -->
    <div style="padding: 24px 28px; font-size: 14px; line-height: 1.75; color: #334155;">
      %s
      %s
      
      <p style="margin: 18px 0 0 0; font-size: 13px; color: #64748b;">
        温馨提示：建议您在收到资料后，先点击【保存到网盘】再下载或在电脑上连接打印机直接 A4 纸双面打印，字体与公式清晰无毛边！
      </p>
    </div>

    <!-- 底部保障区 -->
    <div style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.6; text-align: center;">
      <div>学霸网 (xuebaw.com) · 中小学名校教辅与网盘真题分享平台</div>
      <div style="margin-top: 4px;">此邮件为公益学习资料推荐，如需查阅更多初高中期末真题、教辅微课，请访问 <a href="https://xuebaw.com" style="color: #0284c7; text-decoration: none;">xuebaw.com</a></div>
    </div>
  </div>
</body>
</html>`, subject, customMsgBlock, resBlock)
}

// ContactQuery 名录查询参数
type ContactQuery struct {
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
	GroupTag string `json:"group_tag"`
	Search   string `json:"search"`
}

// GetContacts 分页查询邮箱名录
func (s *EmailService) GetContacts(query ContactQuery) ([]model.EmailContact, int64, error) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 200 {
		query.PageSize = 50
	}

	db := s.db.Model(&model.EmailContact{})
	if query.GroupTag != "" && query.GroupTag != "all" {
		db = db.Where("group_tag = ?", query.GroupTag)
	}
	if query.Search != "" {
		sStr := "%" + query.Search + "%"
		db = db.Where("email ILIKE ? OR name ILIKE ? OR remark ILIKE ?", sStr, sStr, sStr)
	}

	var total int64
	db.Count(&total)

	var contacts []model.EmailContact
	offset := (query.Page - 1) * query.PageSize
	err := db.Order("created_at DESC").Offset(offset).Limit(query.PageSize).Find(&contacts).Error
	return contacts, total, err
}

// DeleteContact 单个删除联系人
func (s *EmailService) DeleteContact(id string) error {
	return s.db.Where("id = ?", id).Delete(&model.EmailContact{}).Error
}

// BatchDeleteContacts 批量删除联系人
func (s *EmailService) BatchDeleteContacts(ids []string) error {
	return s.db.Where("id IN ?", ids).Delete(&model.EmailContact{}).Error
}

// GetCampaignLogs 分页查询群发日志
func (s *EmailService) GetCampaignLogs(page, pageSize int) ([]model.EmailCampaignLog, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var total int64
	s.db.Model(&model.EmailCampaignLog{}).Count(&total)

	var logs []model.EmailCampaignLog
	offset := (page - 1) * pageSize
	err := s.db.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&logs).Error
	return logs, total, err
}

// EmailStatsResult 整体营销与名录统计看板
type EmailStatsResult struct {
	TotalContacts    int64 `json:"total_contacts"`
	ActiveContacts   int64 `json:"active_contacts"`
	TotalSentSuccess int64 `json:"total_sent_success"`
	TotalCampaigns   int64 `json:"total_campaigns"`
}

// GetEmailStats 营销与名录统计
func (s *EmailService) GetEmailStats() (*EmailStatsResult, error) {
	var res EmailStatsResult
	s.db.Model(&model.EmailContact{}).Count(&res.TotalContacts)
	s.db.Model(&model.EmailContact{}).Where("status = ?", "active").Count(&res.ActiveContacts)
	s.db.Model(&model.EmailCampaignLog{}).Select("COALESCE(SUM(success_count), 0)").Scan(&res.TotalSentSuccess)
	s.db.Model(&model.EmailCampaignLog{}).Count(&res.TotalCampaigns)
	return &res, nil
}

// ResolveContactEmail 智能解析求助联系人中的有效邮箱或 QQ 号
func ResolveContactEmail(contact string) string {
	c := strings.TrimSpace(contact)
	if c == "" {
		return ""
	}
	// 1. 如果已是完整邮箱 (包含 @ 和 .)
	emailRegex := regexp.MustCompile(`(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`)
	if m := emailRegex.FindString(c); m != "" {
		return strings.ToLower(m)
	}
	// 2. 如果纯数字且 5~11 位，智能判定为 QQ 号，自动补全 @qq.com
	qqRegex := regexp.MustCompile(`^[1-9][0-9]{4,10}$`)
	if qqRegex.MatchString(c) {
		return c + "@qq.com"
	}
	// 3. 尝试匹配文本中的 QQ 号 (如 QQ: 12345678 或 qq12345678)
	subQQRegex := regexp.MustCompile(`(?i)(?:qq|qq号|qq群)?[:：\s]*([1-9][0-9]{4,10})`)
	if subMatch := subQQRegex.FindStringSubmatch(c); len(subMatch) > 1 {
		return subMatch[1] + "@qq.com"
	}
	return ""
}

// SendResourceFulfilledNotification 求资料上架邮件闭环通知
func (s *EmailService) SendResourceFulfilledNotification(req *model.ResourceRequest, resource *model.Resource, adminNote string) (bool, string, error) {
	if req == nil {
		return false, "需求记录为空", fmt.Errorf("request is nil")
	}

	targetEmail := ResolveContactEmail(req.Contact)
	if targetEmail == "" {
		return false, fmt.Sprintf("联系方式 '%s' 无法解析为有效邮箱或QQ号", req.Contact), nil
	}

	cfg, err := s.GetEmailConfig()
	if err != nil {
		return false, "获取发信配置失败: " + err.Error(), err
	}
	if !cfg.IsEnabled {
		return false, "发信功能当前处于关闭状态", nil
	}
	if cfg.SMTPUser == "" || cfg.SMTPPass == "" {
		return false, "未配置 SMTP 发信账号或授权码", nil
	}

	// 如果关联了资源ID但没有传入具体资源对象，尝试查库
	if resource == nil && req.FulfilledResourceID != nil {
		var res model.Resource
		if err := s.db.Preload("Links").First(&res, "id = ?", *req.FulfilledResourceID).Error; err == nil {
			resource = &res
		}
	}

	resTitle := req.Title
	if resource != nil && resource.Title != "" {
		resTitle = resource.Title
	}

	subject := fmt.Sprintf("【学霸网】您求助的《%s》已整理上架，可立即下载！", resTitle)

	// 拼接直达链接与转存卡片
	var actionBtnURL string
	var linksHTML string

	if resource != nil {
		actionBtnURL = fmt.Sprintf("https://xuebaw.com/resource/%s", resource.Slug)
		for _, l := range resource.Links {
			driveName := "夸克网盘"
			driveBadgeColor := "#0284c7"
			if l.DriveType == "baidu" {
				driveName = "百度网盘"
				driveBadgeColor = "#2563eb"
			} else if l.DriveType == "alipan" {
				driveName = "阿里云盘"
				driveBadgeColor = "#f59e0b"
			}
			codeText := ""
			if l.ExtractCode != "" {
				codeText = fmt.Sprintf(" (提取码: <b style='color:#0f172a;'>%s</b>)", l.ExtractCode)
			}
			linksHTML += fmt.Sprintf(`
        <div style="margin-top: 10px;">
          <a href="%s" target="_blank" style="display: inline-block; background: %s; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-weight: 700; font-size: 13.5px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);">
            ⚡ 保存至 %s 极速转存%s
          </a>
        </div>`, l.ShareURL, driveBadgeColor, driveName, codeText)
		}
	} else {
		actionBtnURL = fmt.Sprintf("https://xuebaw.com/search?q=%s", url.QueryEscape(req.Title))
	}

	noteText := adminNote
	if strings.TrimSpace(noteText) == "" {
		noteText = req.FulfilledNote
	}
	if strings.TrimSpace(noteText) == "" {
		noteText = "您求助的试卷/资料已整理就绪，包含高清单文件试卷及参考答案，欢迎点击保存至网盘学习！"
	}

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 20px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f1f5f9; color: #334155;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    
    <!-- 顶栏：学霸网品牌 -->
    <div style="background: linear-gradient(135deg, #091e3a 0%%, #0369a1 60%%, #0284c7 100%%); padding: 28px 32px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 13px; font-weight: 700; background: rgba(255,255,255,0.22); padding: 4px 12px; border-radius: 12px; letter-spacing: 0.5px;">🎓 学霸网 · 求助资料上架通知</span>
        <span style="font-size: 12px; opacity: 0.85;">xuebaw.com</span>
      </div>
      <h1 style="margin: 14px 0 0 0; font-size: 19px; font-weight: 700; line-height: 1.45; color: #ffffff;">您求助的资料已整理上架！</h1>
    </div>

    <!-- 正文内容区 -->
    <div style="padding: 28px 32px; font-size: 14px; line-height: 1.75; color: #334155;">
      <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #0f172a;">
        亲爱的同学 / 家长：
      </p>
      <p style="margin: 0 0 16px 0; color: #475569;">
        您此前在 <b>学霸网 (xuebaw.com)</b> 提交的资料求助需求已有最新进展！站长已加急搜集、核对并正式发布上线，现将直达下载方式同步通知给您：
      </p>

      <!-- 资料卡片 -->
      <div style="background: #f8fafc; border: 1.5px solid #e0e7ff; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 11.5px; color: #4f46e5; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">
          📚 您所求助的需求
        </div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; line-height: 1.5;">
          %s
        </div>

        <!-- 站长留言回复 -->
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #1e40af; line-height: 1.6; margin-bottom: 16px;">
          <strong>站长留言：</strong>%s
        </div>

        <!-- 直达按钮与网盘链接 -->
        <div style="margin-top: 16px;">
          <a href="%s" target="_blank" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 3px 10px rgba(2,132,199,0.35);">
            ⚡ 立即前往学霸网下载 / 查看详情 &rarr;
          </a>
        </div>
        %s
      </div>

      <!-- 打印与使用技巧 -->
      <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 12px 16px; font-size: 12.5px; color: #854d0e; line-height: 1.6; margin-top: 20px;">
        💡 <b>学习使用小贴士：</b><br>
        1. 建议先将资料保存到您个人的网盘中，防链接失效；<br>
        2. 本站真题试卷均支持 <b>A4 纸高清双面打印</b>，排版工整无水印；<br>
        3. 如还需其它省市一模卷、期末冲刺卷或课本教辅，欢迎随时在学霸网再次提交求助！
      </div>
    </div>

    <!-- 底部版权与免责声明 -->
    <div style="padding: 18px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; line-height: 1.6; text-align: center;">
      <div>学霸网 (xuebaw.com) · 中小学名校教辅与网盘真题分享平台</div>
      <div style="margin-top: 4px;">本邮件为系统对您此前提交求资料需求的自动闭环通知。如非本人操作请忽略。</div>
    </div>
  </div>
</body>
</html>`, req.Title, noteText, actionBtnURL, linksHTML)

	// 发送邮件
	if err := s.sendRawEmail(cfg, targetEmail, subject, htmlBody); err != nil {
		log.Printf("[EmailService] Failed to send fulfill notification to %s: %v", targetEmail, err)
		return false, fmt.Sprintf("向 %s 发信失败: %v", targetEmail, err), err
	}

	// 记录成功状态
	now := time.Now()
	s.db.Model(&model.ResourceRequest{}).Where("id = ?", req.ID).Updates(map[string]interface{}{
		"email_notified":    true,
		"email_notified_at": &now,
	})
	req.EmailNotified = true
	req.EmailNotifiedAt = &now

	// 自动将有效联系人收录到 EmailContact 库，方便后续推送相关年级学科资源 (忽略重复)
	contactRecord := model.EmailContact{
		Email:    targetEmail,
		GroupTag: "request_fulfilled",
		Source:   "resource_request",
		Status:   "active",
		Remark:   fmt.Sprintf("求资料需求《%s》已满足用户", req.Title),
	}
	s.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&contactRecord)

	log.Printf("[EmailService] Successfully sent fulfill notification to %s for request %s", targetEmail, req.ID)
	return true, targetEmail, nil
}
