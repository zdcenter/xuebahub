package handler

import (
	"github.com/gofiber/fiber/v3"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type SearchHandler struct {
	aggregator *service.SearchAggregatorService
}

func NewSearchHandler(agg *service.SearchAggregatorService) *SearchHandler {
	return &SearchHandler{aggregator: agg}
}

// GlobalSearch 全网多源并发搜索接口
func (h *SearchHandler) GlobalSearch(c fiber.Ctx) error {
	keyword := c.Query("q")
	if keyword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "搜索关键词不能为空",
		})
	}

	// 1. 先查本地精选自营库
	var localItems []model.Resource
	database.DB.Preload("Links").
		Where("is_published = ? AND (title ILIKE ? OR subtitle ILIKE ?)", true, "%"+keyword+"%", "%"+keyword+"%").
		Limit(10).
		Find(&localItems)

	// 2. 并发触发外部全网聚合通道 (利用 Go 协程并发拉取)
	externalResults, _ := h.aggregator.AggregateSearch(c.Context(), keyword)

	// 异步记录搜索日志，驱动热搜监控与转化分析
	go func(kw, ip string, count int) {
		database.DB.Create(&model.SearchLog{
			Keyword:     kw,
			ClientIP:    ip,
			ResultCount: count,
		})
	}(keyword, c.IP(), len(localItems)+len(externalResults))

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"keyword":          keyword,
			"local_verified":   localItems,      // 本地高可信精品教辅
			"external_crawled": externalResults, // 全网聚合抓取通道
		},
	})
}
