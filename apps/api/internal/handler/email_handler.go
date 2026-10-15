package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type EmailHandler struct {
	emailService *service.EmailService
}

func NewEmailHandler(emailService *service.EmailService) *EmailHandler {
	return &EmailHandler{emailService: emailService}
}

// GetConfig 获取发信配置
func (h *EmailHandler) GetConfig(c fiber.Ctx) error {
	cfg, err := h.emailService.GetEmailConfig()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"code": 200,
		"data": cfg,
	})
}

// SaveConfig 保存发信配置
func (h *EmailHandler) SaveConfig(c fiber.Ctx) error {
	var cfg model.EmailConfig
	if err := c.Bind().Body(&cfg); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的配置参数"})
	}
	if err := h.emailService.SaveEmailConfig(&cfg); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"code":    200,
		"message": "发信配置保存成功",
		"data":    cfg,
	})
}

// SendTest 发送测试邮件
func (h *EmailHandler) SendTest(c fiber.Ctx) error {
	var req struct {
		ToEmail string `json:"to_email"`
	}
	if err := c.Bind().Body(&req); err != nil || req.ToEmail == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请输入测试接收邮箱地址"})
	}
	if err := h.emailService.SendTestEmail(req.ToEmail); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"code":    200,
		"message": "测试邮件已成功发出，请查收邮箱！",
	})
}

// ExtractContacts 智能提取与去重清洗名录
func (h *EmailHandler) ExtractContacts(c fiber.Ctx) error {
	var req struct {
		RawText  string `json:"raw_text"`
		GroupTag string `json:"group_tag"`
		Source   string `json:"source"`
	}
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数无效"})
	}
	if req.RawText == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请粘贴需要解析的文本内容"})
	}

	result, err := h.emailService.ExtractAndCleanContacts(req.RawText, req.GroupTag, req.Source)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "提取清洗与排重完成",
		"data":    result,
	})
}

// GetContacts 分页获取邮箱名录
func (h *EmailHandler) GetContacts(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	tag := c.Query("group_tag", "")
	search := c.Query("search", "")

	contacts, total, err := h.emailService.GetContacts(service.ContactQuery{
		Page:     page,
		PageSize: pageSize,
		GroupTag: tag,
		Search:   search,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items":     contacts,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// DeleteContact 删除联系人
func (h *EmailHandler) DeleteContact(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数错误"})
	}
	if err := h.emailService.DeleteContact(id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"code":    200,
		"message": "删除联系人成功",
	})
}

// BatchDeleteContacts 批量删除联系人
func (h *EmailHandler) BatchDeleteContacts(c fiber.Ctx) error {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请选择要删除的联系人"})
	}
	if err := h.emailService.BatchDeleteContacts(req.IDs); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"code":    200,
		"message": "批量删除联系人成功",
	})
}

// SendCampaign 执行营销群发活动
func (h *EmailHandler) SendCampaign(c fiber.Ctx) error {
	var req service.SendCampaignRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "参数解析失败"})
	}

	campaign, err := h.emailService.SendCampaign(req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "营销群发任务已成功启动，正在后台平滑发送！",
		"data":    campaign,
	})
}

// GetCampaignLogs 分页获取群发日志
func (h *EmailHandler) GetCampaignLogs(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))

	logs, total, err := h.emailService.GetCampaignLogs(page, pageSize)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items":     logs,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// GetStats 营销看板统计
func (h *EmailHandler) GetStats(c fiber.Ctx) error {
	stats, err := h.emailService.GetEmailStats()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"code": 200,
		"data": stats,
	})
}
