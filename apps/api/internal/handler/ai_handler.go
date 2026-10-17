package handler

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"netdisk/api/internal/service"
)

type AiHandler struct {
	aiService *service.AiService
}

func NewAiHandler(aiService *service.AiService) *AiHandler {
	return &AiHandler{
		aiService: aiService,
	}
}

// GenerateMeta 接收管理员请求并调用 Gemini / DeepSeek / OpenAI 模型生成副标题与内容说明
func (h *AiHandler) GenerateMeta(c fiber.Ctx) error {
	var req service.AiGenerateRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "请求参数格式错误: " + err.Error(),
		})
	}

	if strings.TrimSpace(req.Title) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "资料标题不能为空",
		})
	}

	if strings.TrimSpace(req.APIKey) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "请提供有效的 API Key",
		})
	}

	res, err := h.aiService.GenerateMeta(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "AI 模型生成失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": res,
	})
}

// TestConnection 测试与指定大模型提供商的 API 连通性
func (h *AiHandler) TestConnection(c fiber.Ctx) error {
	var req service.AiGenerateRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "请求参数格式错误: " + err.Error(),
		})
	}

	if strings.TrimSpace(req.APIKey) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "API Key 不能为空",
		})
	}

	res, err := h.aiService.TestConnection(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "连通性测试未通过: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "恭喜！API 连通性测试成功通过，大模型已准备就绪！",
		"data":    res,
	})
}
