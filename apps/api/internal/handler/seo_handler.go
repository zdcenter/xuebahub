package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type SeoHandler struct {
	seoService *service.SeoService
}

func NewSeoHandler(seoService *service.SeoService) *SeoHandler {
	return &SeoHandler{
		seoService: seoService,
	}
}

// GetConfig 获取 SEO 与搜索引擎主动收录配置
func (h *SeoHandler) GetConfig(c fiber.Ctx) error {
	cfg, err := h.seoService.GetConfig()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "获取 SEO 配置失败: " + err.Error(),
		})
	}
	return c.JSON(cfg)
}

// SaveConfig 保存 SEO 配置
func (h *SeoHandler) SaveConfig(c fiber.Ctx) error {
	var cfg model.SeoConfig
	if err := c.Bind().Body(&cfg); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "解析请求体参数失败: " + err.Error(),
		})
	}

	if err := h.seoService.SaveConfig(&cfg); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "保存 SEO 配置失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "SEO 搜索引擎收录配置已成功更新",
		"config":  cfg,
	})
}

type BatchPushRequest struct {
	Engine      string      `json:"engine"` // "all", "baidu", "bing"
	ResourceIDs []uuid.UUID `json:"resource_ids"`
	CustomURLs  []string    `json:"custom_urls"`
}

// BatchPush 批量推送指定资料或自定义 URL
func (h *SeoHandler) BatchPush(c fiber.Ctx) error {
	var req BatchPushRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "请求参数格式错误: " + err.Error(),
		})
	}

	if req.Engine == "" {
		req.Engine = "all"
	}

	summary, err := h.seoService.BatchPush(req.Engine, req.ResourceIDs, req.CustomURLs)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(summary)
}

type PushAllRequest struct {
	Engine string `json:"engine"` // "all", "baidu", "bing"
	Limit  int    `json:"limit"`  // 默认 1000
}

// PushAll 全站已上架资料一键全量秒推
func (h *SeoHandler) PushAll(c fiber.Ctx) error {
	var req PushAllRequest
	_ = c.Bind().Body(&req)

	if req.Engine == "" {
		req.Engine = "all"
	}
	if req.Limit <= 0 {
		req.Limit = 1000
	}

	summary, err := h.seoService.PushAllPublished(req.Engine, req.Limit)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(summary)
}

// GetLogs 获取搜索引擎收录提交流水记录
func (h *SeoHandler) GetLogs(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))

	logs, total, err := h.seoService.GetLogs(page, pageSize)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "获取推送日志失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"logs":      logs,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetStats 获取 SEO 综合看板数据
func (h *SeoHandler) GetStats(c fiber.Ctx) error {
	stats, err := h.seoService.GetStats()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "获取 SEO 统计数据失败: " + err.Error(),
		})
	}
	return c.JSON(stats)
}

// GetPublicSitemap 公开端输出动态标准 XML Sitemap 站点地图
func (h *SeoHandler) GetPublicSitemap(c fiber.Ctx) error {
	xmlContent, err := h.seoService.GenerateSitemapXML()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString("生成 sitemap.xml 失败: " + err.Error())
	}

	c.Set("Content-Type", "application/xml; charset=utf-8")
	c.Set("Cache-Control", "public, max-age=3600")
	return c.SendString(xmlContent)
}

// ServeIndexNowKeyFile 动态响应 IndexNow 密钥验证文件 (/{key}.txt)
// 微软 Bing IndexNow 协议要求网站根目录存在一个 {key}.txt 文件，内容即为 key 本身
func (h *SeoHandler) ServeIndexNowKeyFile(c fiber.Ctx) error {
	requestedFile := c.Params("keyfile") // 例如 "7f8a9b2c3d4e5f60718293a4b5c6d7e8.txt"
	if requestedFile == "" {
		return c.Status(fiber.StatusNotFound).SendString("Not Found")
	}

	// 仅处理 .txt 结尾的文件请求
	if len(requestedFile) <= 4 || requestedFile[len(requestedFile)-4:] != ".txt" {
		return c.Next()
	}

	requestedKey := requestedFile[:len(requestedFile)-4]

	// 从数据库读取当前配置的 bing_api_key 进行比对
	cfg, err := h.seoService.GetConfig()
	if err != nil || cfg.BingApiKey == "" {
		return c.Status(fiber.StatusNotFound).SendString("Not Found")
	}

	if requestedKey != cfg.BingApiKey {
		return c.Status(fiber.StatusNotFound).SendString("Not Found")
	}

	c.Set("Content-Type", "text/plain; charset=utf-8")
	c.Set("Cache-Control", "public, max-age=86400")
	return c.SendString(cfg.BingApiKey)
}


