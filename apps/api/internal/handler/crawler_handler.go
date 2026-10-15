package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type CrawlerHandler struct {
	crawlerService *service.TelegramCrawlerService
	db             *gorm.DB
}

func NewCrawlerHandler(crawlerService *service.TelegramCrawlerService) *CrawlerHandler {
	return &CrawlerHandler{
		crawlerService: crawlerService,
		db:             database.DB,
	}
}

// GetConfig 获取 Telegram 采集机器人配置及统计指标
func (h *CrawlerHandler) GetConfig(c fiber.Ctx) error {
	var cfg model.TelegramConfig
	if err := h.db.First(&cfg).Error; err != nil {
		// 自动初始化
		cfg = model.TelegramConfig{
			BotToken:            "7315955834:AAEr_bxkFhKheGyYzNZ_3Mzwskl8TrTuHYA",
			BotUsername:         "demoMovieFind_bot",
			SyncMode:            "webhook",
			WebhookURL:          "https://api.xuebaw.com:8443/api/v1/public/telegram/webhook",
			AutoSync:            false,
			SyncIntervalSeconds: 60,
			LastSyncStatus:      "idle",
			LastSyncMessage:     "初始化就绪",
		}
		h.db.Create(&cfg)
	}

	var totalDrafts, pendingDrafts, approvedDrafts, ignoredDrafts int64
	h.db.Model(&model.ResourceDraft{}).Count(&totalDrafts)
	h.db.Model(&model.ResourceDraft{}).Where("status = ?", "pending").Count(&pendingDrafts)
	h.db.Model(&model.ResourceDraft{}).Where("status = ?", "approved").Count(&approvedDrafts)
	h.db.Model(&model.ResourceDraft{}).Where("status = ?", "ignored").Count(&ignoredDrafts)

	var channelCount int64
	h.db.Model(&model.TelegramChannel{}).Where("is_active = ?", true).Count(&channelCount)

	return c.JSON(fiber.Map{
		"config": cfg,
		"stats": fiber.Map{
			"total_drafts":       totalDrafts,
			"pending_drafts":     pendingDrafts,
			"approved_drafts":    approvedDrafts,
			"ignored_drafts":     ignoredDrafts,
			"monitored_channels": channelCount,
		},
	})
}

// UpdateConfig 更新 Telegram 机器人参数
func (h *CrawlerHandler) UpdateConfig(c fiber.Ctx) error {
	type UpdateReq struct {
		BotToken    string `json:"bot_token"`
		BotUsername string `json:"bot_username"`
		WebhookURL  string `json:"webhook_url"`
		ProxyURL    string `json:"proxy_url"`
		ApiBaseURL         string  `json:"api_base_url"`
		IsEnabled          *bool   `json:"is_enabled"`
		BroadcastChannelID *string `json:"broadcast_channel_id"`
		AutoBroadcast      *bool   `json:"auto_broadcast"`
		BroadcastTemplate  *string `json:"broadcast_template"`
	}

	var req UpdateReq
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数格式错误"})
	}

	var cfg model.TelegramConfig
	if err := h.db.First(&cfg).Error; err != nil {
		cfg.ID = 1
	}

	if req.BotToken != "" {
		cfg.BotToken = strings.TrimSpace(req.BotToken)
	}
	cfg.BotUsername = strings.TrimSpace(req.BotUsername)
	if req.WebhookURL != "" {
		cfg.WebhookURL = strings.TrimSpace(req.WebhookURL)
	}
	cfg.ProxyURL = strings.TrimSpace(req.ProxyURL)
	cfg.ApiBaseURL = strings.TrimSpace(req.ApiBaseURL)
	if req.IsEnabled != nil {
		cfg.IsEnabled = *req.IsEnabled
	}
	if req.BroadcastChannelID != nil {
		cfg.BroadcastChannelID = strings.TrimSpace(*req.BroadcastChannelID)
	}
	if req.AutoBroadcast != nil {
		cfg.AutoBroadcast = *req.AutoBroadcast
	}
	if req.BroadcastTemplate != nil {
		cfg.BroadcastTemplate = *req.BroadcastTemplate
	}
	// 锁定为 Webhook 实时触发模式
	cfg.SyncMode = "webhook"
	cfg.AutoSync = false

	if err := h.db.Save(&cfg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "更新配置失败"})
	}

	// 自动向 Telegram 注册/同步该 Webhook 地址
	if cfg.BotToken != "" {
		if err := h.crawlerService.SetWebhook(cfg.WebhookURL); err != nil {
			log.Printf("更新配置后注册 Webhook 提示: %v", err)
		}
	}

	return c.JSON(fiber.Map{
		"message": "Telegram 机器人配置更新成功，已同步注册 Webhook 实时通道",
		"config":  cfg,
	})
}

// ToggleMasterSwitch 切换全局采集与监控总开关 (一键暂停/开启)
func (h *CrawlerHandler) ToggleMasterSwitch(c fiber.Ctx) error {
	var cfg model.TelegramConfig
	if err := h.db.First(&cfg).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "未找到配置"})
	}

	cfg.IsEnabled = !cfg.IsEnabled
	statusText := "已恢复全局实时监控"
	if !cfg.IsEnabled {
		statusText = "已暂停全局监控 (阻断所有新消息自动入库)"
		cfg.LastSyncMessage = "⏸️ 监控总开关已暂停：当前阻断所有频道新资源自动入库"
	} else {
		cfg.LastSyncMessage = "🟢 监控总开关已恢复：正在实时监听频道新消息并自动推送"
	}
	h.db.Save(&cfg)

	return c.JSON(fiber.Map{
		"message":    fmt.Sprintf("✅ 采集监控总开关%s", statusText),
		"is_enabled": cfg.IsEnabled,
		"config":     cfg,
	})
}

// SyncNow 立即校验并刷新 Telegram Webhook 实时触发状态 (纯 Webhook 架构，已取消 60 秒轮询)
func (h *CrawlerHandler) SyncNow(c fiber.Ctx) error {
	var cfg model.TelegramConfig
	if err := h.db.First(&cfg).Error; err != nil || strings.TrimSpace(cfg.BotToken) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Telegram Bot Token 未配置，请先填写 Bot 凭证",
		})
	}

	if err := h.crawlerService.SetWebhook(cfg.WebhookURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Webhook 连通校验失败: %v", err),
		})
	}

	info, _ := h.crawlerService.GetWebhookInfo()
	return c.JSON(fiber.Map{
		"success": true,
		"result": fiber.Map{
			"message": "⚡ Webhook 实时触发通道正常！频道一有新消息发布，Telegram 将在 0 秒内瞬间自动推送到本系统，无需后台轮询。",
			"info":    info,
		},
	})
}

// ListChannels 获取所有被监听的电报频道
func (h *CrawlerHandler) ListChannels(c fiber.Ctx) error {
	var channels []model.TelegramChannel
	h.db.Order("created_at asc").Find(&channels)
	return c.JSON(fiber.Map{
		"channels": channels,
	})
}

// CreateChannel 新增监听频道
func (h *CrawlerHandler) CreateChannel(c fiber.Ctx) error {
	type CreateReq struct {
		ChannelID string `json:"channel_id"`
		Name      string `json:"name"`
		DriveType string `json:"drive_type"`
		Remark    string `json:"remark"`
	}

	var req CreateReq
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数格式错误"})
	}

	channelID := strings.TrimSpace(req.ChannelID)
	if channelID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "频道 ID 不能为空"})
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("频道 %s", channelID)
	}

	driveType := strings.TrimSpace(req.DriveType)
	if driveType == "" {
		driveType = "auto"
	}

	ch := model.TelegramChannel{
		ID:        uuid.New(),
		ChannelID: channelID,
		Name:      name,
		DriveType: driveType,
		IsActive:  true,
		Remark:    req.Remark,
	}

	if err := h.db.Create(&ch).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "频道 ID 已存在或创建失败"})
	}

	return c.JSON(fiber.Map{
		"message": "监听频道添加成功",
		"channel": ch,
	})
}

// UpdateChannel 修改监听频道
func (h *CrawlerHandler) UpdateChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法频道 ID"})
	}

	var ch model.TelegramChannel
	if err := h.db.First(&ch, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "频道不存在"})
	}

	type UpdateReq struct {
		Name      string `json:"name"`
		DriveType string `json:"drive_type"`
		IsActive  *bool  `json:"is_active"`
		Remark    string `json:"remark"`
	}

	var req UpdateReq
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数格式错误"})
	}

	if req.Name != "" {
		ch.Name = strings.TrimSpace(req.Name)
	}
	if req.DriveType != "" {
		ch.DriveType = strings.TrimSpace(req.DriveType)
	}
	if req.IsActive != nil {
		ch.IsActive = *req.IsActive
	}
	ch.Remark = req.Remark

	if err := h.db.Save(&ch).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "更新频道失败"})
	}

	return c.JSON(fiber.Map{
		"message": "频道更新成功",
		"channel": ch,
	})
}

// DeleteChannel 删除监听频道
func (h *CrawlerHandler) DeleteChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法频道 ID"})
	}

	if err := h.db.Delete(&model.TelegramChannel{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "删除频道失败"})
	}

	return c.JSON(fiber.Map{"message": "监听频道已移除"})
}

// ToggleChannel 快速切换监控频道的启用/暂停状态
func (h *CrawlerHandler) ToggleChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法频道 ID"})
	}

	var ch model.TelegramChannel
	if err := h.db.First(&ch, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "频道不存在"})
	}

	ch.IsActive = !ch.IsActive
	if err := h.db.Save(&ch).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "切换频道状态失败"})
	}

	actionStr := "已启动监听"
	if !ch.IsActive {
		actionStr = "已暂停监听"
	}

	return c.JSON(fiber.Map{
		"message":   fmt.Sprintf("频道 [%s] %s", ch.Name, actionStr),
		"is_active": ch.IsActive,
		"channel":   ch,
	})
}

// ListDrafts 获取采集草稿列表 (支持分页、状态筛选、网盘类型筛选、关键字搜索)
func (h *CrawlerHandler) ListDrafts(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	status := c.Query("status", "pending") // pending, approved, ignored, all
	driveType := c.Query("drive_type", "")
	search := strings.TrimSpace(c.Query("search", ""))

	query := h.db.Model(&model.ResourceDraft{})

	if status != "" && status != "all" {
		query = query.Where("status = ?", status)
	}
	if driveType != "" && driveType != "all" {
		query = query.Where("drive_type = ?", driveType)
	}
	if search != "" {
		query = query.Where("title ILIKE ? OR raw_text ILIKE ? OR source_name ILIKE ?", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	var drafts []model.ResourceDraft
	offset := (page - 1) * pageSize
	err := query.Order("created_at desc").Offset(offset).Limit(pageSize).Find(&drafts).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "查询草稿列表失败"})
	}

	return c.JSON(fiber.Map{
		"items": drafts,
		"total": total,
		"page":  page,
		"limit": pageSize,
	})
}

// IngestText 手动粘贴一段文本一键提取并加入草稿池
func (h *CrawlerHandler) IngestText(c fiber.Ctx) error {
	type IngestReq struct {
		RawText    string `json:"raw_text"`
		SourceName string `json:"source_name"`
		DriveType  string `json:"drive_type"`
	}

	var req IngestReq
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数格式错误"})
	}

	drafts, err := h.crawlerService.ManualIngest(req.RawText, req.SourceName, req.DriveType)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("成功解析并录入 %d 条待审核草稿", len(drafts)),
		"drafts":  drafts,
	})
}

// UpdateDraftStatus 更改草稿状态 (pending, ignored, approved)
func (h *CrawlerHandler) UpdateDraftStatus(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法草稿 ID"})
	}

	type StatusReq struct {
		Status string `json:"status"`
	}
	var req StatusReq
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数错误"})
	}

	if err := h.db.Model(&model.ResourceDraft{}).Where("id = ?", id).Update("status", req.Status).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "更新状态失败"})
	}

	return c.JSON(fiber.Map{"message": "草稿状态更新成功"})
}

// DeleteDraft 删除单条草稿
func (h *CrawlerHandler) DeleteDraft(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法草稿 ID"})
	}

	if err := h.db.Delete(&model.ResourceDraft{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "删除草稿失败"})
	}

	return c.JSON(fiber.Map{"message": "草稿已彻底删除"})
}

// BatchDraftAction 批量操作草稿 (batch_ignore, batch_delete)
func (h *CrawlerHandler) BatchDraftAction(c fiber.Ctx) error {
	type BatchReq struct {
		Action string      `json:"action"` // ignore, delete
		IDs    []uuid.UUID `json:"ids"`
	}

	var req BatchReq
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请选择要操作的草稿项目"})
	}

	if req.Action == "ignore" {
		h.db.Model(&model.ResourceDraft{}).Where("id IN ?", req.IDs).Update("status", "ignored")
		return c.JSON(fiber.Map{"message": fmt.Sprintf("已成功忽略 %d 条草稿", len(req.IDs))})
	} else if req.Action == "delete" {
		h.db.Where("id IN ?", req.IDs).Delete(&model.ResourceDraft{})
		return c.JSON(fiber.Map{"message": fmt.Sprintf("已彻底删除 %d 条草稿", len(req.IDs))})
	}

	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "不支持的批量操作"})
}

// HandleTelegramWebhook 接收 Telegram Webhook 推送的实时频道广播
func (h *CrawlerHandler) HandleTelegramWebhook(c fiber.Ctx) error {
	// 0. 检查全局采集与监控总开关是否开启
	var cfg model.TelegramConfig
	if err := h.db.First(&cfg).Error; err == nil && !cfg.IsEnabled {
		// 全局总开关已关闭，直接忽略丢弃本次推送
		return c.SendStatus(fiber.StatusOK)
	}

	body := c.Body()
	var update service.TelegramUpdate
	if err := json.Unmarshal(body, &update); err != nil {
		return c.SendStatus(fiber.StatusOK)
	}

	msg := update.ChannelPost
	if msg == nil {
		msg = update.Message
	}
	if msg == nil {
		return c.SendStatus(fiber.StatusOK)
	}

	rawText := msg.Text
	if rawText == "" {
		rawText = msg.Caption
	}
	if strings.TrimSpace(rawText) == "" {
		return c.SendStatus(fiber.StatusOK)
	}

	chatIDStr := fmt.Sprintf("%d", msg.Chat.ID)
	// 检查该频道是否在监控列表
	var monitoredCh model.TelegramChannel
	err := h.db.Where("channel_id = ?", chatIDStr).First(&monitoredCh).Error
	if err == nil && !monitoredCh.IsActive {
		// 频道被设为暂停状态，直接跳过忽略
		return c.SendStatus(fiber.StatusOK)
	}

	sourceName := msg.Chat.Title
	if sourceName == "" {
		if monitoredCh.Name != "" {
			sourceName = monitoredCh.Name
		} else {
			sourceName = fmt.Sprintf("频道 %s", chatIDStr)
		}
	}

	drivePref := "auto"
	if monitoredCh.DriveType != "" {
		drivePref = monitoredCh.DriveType
	}

	drafts := h.crawlerService.ExtractDraftsFromText(rawText, sourceName, chatIDStr, msg.MessageID, drivePref)
	addedCount := 0
	for _, draft := range drafts {
		var existing model.ResourceDraft
		if err := h.db.Where("share_url = ?", draft.ShareURL).First(&existing).Error; err != nil {
			if err := h.db.Create(&draft).Error; err == nil {
				addedCount++
			}
		}
	}

	if monitoredCh.ID != uuid.Nil && addedCount > 0 {
		h.db.Model(&model.TelegramChannel{}).Where("id = ?", monitoredCh.ID).UpdateColumn("item_count", gorm.Expr("item_count + ?", addedCount))
	}

	// 记录实时同步状态
	now := time.Now()
	h.db.Model(&model.TelegramConfig{}).Where("1=1").Updates(map[string]interface{}{
		"last_sync_at":      &now,
		"last_sync_status":  "success",
		"last_sync_message": fmt.Sprintf("⚡ Webhook 自动触发: 接收 [%s] 消息，新增 %d 条草稿", sourceName, addedCount),
	})

	return c.SendStatus(fiber.StatusOK)
}

// RegisterWebhook 向 Telegram 官方注册 Webhook
func (h *CrawlerHandler) RegisterWebhook(c fiber.Ctx) error {
	type Req struct {
		WebhookURL string `json:"webhook_url"`
	}
	var req Req
	_ = c.Bind().Body(&req)

	if err := h.crawlerService.SetWebhook(req.WebhookURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"message":   "Telegram Webhook 实时触发注册成功！新消息将瞬间自动推送入库",
		"sync_mode": "webhook",
	})
}

// RemoveWebhook 重新刷新并校验 Webhook 实时触发模式
func (h *CrawlerHandler) RemoveWebhook(c fiber.Ctx) error {
	var cfg model.TelegramConfig
	if err := h.db.First(&cfg).Error; err == nil && cfg.BotToken != "" {
		_ = h.crawlerService.SetWebhook(cfg.WebhookURL)
	}

	return c.JSON(fiber.Map{
		"message":   "⚡ Webhook 实时推送通道已刷新！",
		"sync_mode": "webhook",
	})
}

// GetWebhookInfo 获取 Telegram 官方 Webhook 真实注册状态
func (h *CrawlerHandler) GetWebhookInfo(c fiber.Ctx) error {
	info, err := h.crawlerService.GetWebhookInfo()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(info)
}

// ResolveChannel 智能解析 Telegram 频道信息 (@username 或 t.me/xxx 或 数字ID)
func (h *CrawlerHandler) ResolveChannel(c fiber.Ctx) error {
	type ResolveReq struct {
		Input string `json:"input"`
	}
	var req ResolveReq
	if err := c.Bind().Body(&req); err != nil || strings.TrimSpace(req.Input) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请输入有效的频道链接、@用户名或数字ID"})
	}

	ch, err := h.crawlerService.ResolveChannel(req.Input)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("解析频道失败: %v", err)})
	}

	return c.JSON(fiber.Map{
		"message": "频道识别成功",
		"channel": ch,
	})
}

// SendTestBroadcast 发送一条测试广播消息到指定或已配置的广播频道
func (h *CrawlerHandler) SendTestBroadcast(c fiber.Ctx) error {
	type TestReq struct {
		TargetChannel string `json:"target_channel"`
	}
	var req TestReq
	_ = c.Bind().Body(&req)

	target := strings.TrimSpace(req.TargetChannel)
	if target == "" {
		var cfg model.TelegramConfig
		if err := h.db.First(&cfg).Error; err == nil {
			target = cfg.BroadcastChannelID
		}
	}

	if target == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "未设置目标广播频道，请先在广播设置中填写广播频道（例如: @xuebaw_official）",
		})
	}

	if err := h.crawlerService.SendTestBroadcast(target); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("发送测试广播失败: %v（提示: 请确保机器人已被添加为该频道管理员并拥有发布消息权限）", err),
		})
	}

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("🎉 测试广播消息已成功发送至频道 %s！请前往 Telegram 查验。", target),
	})
}

// BroadcastResource 手动将某个资源一键广播至 Telegram 频道
func (h *CrawlerHandler) BroadcastResource(c fiber.Ctx) error {
	resourceIDStr := strings.TrimSpace(c.Params("resourceId"))
	var res model.Resource
	query := h.db.Preload("Links")
	if resUUID, err := uuid.Parse(resourceIDStr); err == nil {
		query = query.Where("id = ?", resUUID)
	} else {
		query = query.Where("slug = ?", resourceIDStr)
	}
	if err := query.First(&res).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "资源未找到"})
	}

	type BroadcastReq struct {
		CustomChannelID string `json:"custom_channel_id"`
	}
	var req BroadcastReq
	_ = c.Bind().Body(&req)

	if err := h.crawlerService.BroadcastResource(&res, req.CustomChannelID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("推送电报广播失败: %v", err),
		})
	}

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("📢 资源「%s」已成功推送到 Telegram 频道！", res.Title),
	})
}

// ListBroadcastChannels 获取所有广播推送频道列表
func (h *CrawlerHandler) ListBroadcastChannels(c fiber.Ctx) error {
	var channels []model.TelegramBroadcastChannel
	h.db.Order("created_at asc").Find(&channels)

	// 如果广播列表为空但 TelegramConfig 填有历史 broadcast_channel_id，自动迁移并存入一条
	if len(channels) == 0 {
		var cfg model.TelegramConfig
		if err := h.db.First(&cfg).Error; err == nil && strings.TrimSpace(cfg.BroadcastChannelID) != "" {
			autoCh := model.TelegramBroadcastChannel{
				ID:        uuid.New(),
				ChannelID: strings.TrimSpace(cfg.BroadcastChannelID),
				Name:      "默认广播频道",
				IsActive:  true,
				Remark:    "系统历史配置自动迁移",
			}
			h.db.Create(&autoCh)
			channels = append(channels, autoCh)
		}
	}

	return c.JSON(fiber.Map{
		"channels": channels,
	})
}

// CreateBroadcastChannel 新增广播推送频道
func (h *CrawlerHandler) CreateBroadcastChannel(c fiber.Ctx) error {
	type CreateReq struct {
		ChannelID string `json:"channel_id"`
		Name      string `json:"name"`
		Remark    string `json:"remark"`
	}

	var req CreateReq
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数格式错误"})
	}

	channelID := strings.TrimSpace(req.ChannelID)
	if channelID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "频道 ID / 用户名不能为空"})
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("广播频道 %s", channelID)
	}

	ch := model.TelegramBroadcastChannel{
		ID:        uuid.New(),
		ChannelID: channelID,
		Name:      name,
		IsActive:  true,
		Remark:    req.Remark,
	}

	if err := h.db.Create(&ch).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "广播频道已存在或创建失败"})
	}

	return c.JSON(fiber.Map{
		"message": "广播频道添加成功",
		"channel": ch,
	})
}

// ResolveBroadcastChannel 智能识别并直接添加广播频道
func (h *CrawlerHandler) ResolveBroadcastChannel(c fiber.Ctx) error {
	type ResolveReq struct {
		Input string `json:"input"`
	}
	var req ResolveReq
	if err := c.Bind().Body(&req); err != nil || strings.TrimSpace(req.Input) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请输入有效的频道链接、@用户名或数字ID"})
	}

	ch, err := h.crawlerService.ResolveChannel(req.Input)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("识别频道失败: %v", err)})
	}

	// 存入广播频道表
	bCh := model.TelegramBroadcastChannel{
		ID:        uuid.New(),
		ChannelID: ch.ChannelID,
		Name:      ch.Name,
		IsActive:  true,
		Remark:    ch.Remark,
	}
	if err := h.db.Create(&bCh).Error; err != nil {
		_ = h.db.Where("channel_id = ?", ch.ChannelID).First(&bCh)
	}

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("✅ 成功识别并添加广播频道【%s】", bCh.Name),
		"channel": bCh,
	})
}

// ToggleBroadcastChannel 切换广播频道的启用/暂停状态
func (h *CrawlerHandler) ToggleBroadcastChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法频道 ID"})
	}

	var ch model.TelegramBroadcastChannel
	if err := h.db.First(&ch, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "广播频道不存在"})
	}

	ch.IsActive = !ch.IsActive
	if err := h.db.Save(&ch).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "切换广播频道状态失败"})
	}

	actionStr := "已开启广播"
	if !ch.IsActive {
		actionStr = "已暂停广播"
	}

	return c.JSON(fiber.Map{
		"message":   fmt.Sprintf("频道 [%s] %s", ch.Name, actionStr),
		"is_active": ch.IsActive,
		"channel":   ch,
	})
}

// DeleteBroadcastChannel 删除广播频道
func (h *CrawlerHandler) DeleteBroadcastChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "非法频道 ID"})
	}

	if err := h.db.Delete(&model.TelegramBroadcastChannel{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "删除广播频道失败"})
	}

	return c.JSON(fiber.Map{"message": "广播频道已移除"})
}


