package handler

import (
	"strings"
	"time"

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

// SearchLogStatRow 后台搜索词聚合统计
type SearchLogStatRow struct {
	Keyword        string    `json:"keyword"`
	SearchCount    int64     `json:"search_count"`
	ResultCount    int       `json:"result_count"`
	LastSearchedAt time.Time `json:"last_searched_at"`
}

// ListAdminSearchLogs 获取用户搜索关键词统计 (支持未命中 0 结果过滤)
func (h *SearchHandler) ListAdminSearchLogs(c fiber.Ctx) error {
	filter := c.Query("filter", "missed")
	var rows []SearchLogStatRow

	q := database.DB.Model(&model.SearchLog{}).
		Select("keyword, COUNT(*) as search_count, MIN(result_count) as result_count, MAX(created_at) as last_searched_at").
		Group("keyword")

	if filter == "missed" {
		q = q.Having("MIN(result_count) = 0")
	}

	if err := q.Order("search_count DESC, last_searched_at DESC").Limit(100).Scan(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取搜索关键词统计失败",
		})
	}

	if rows == nil {
		rows = []SearchLogStatRow{}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": rows,
	})
}

// DeleteAdminSearchLog 清理/标记已处理某个搜索关键词
func (h *SearchHandler) DeleteAdminSearchLog(c fiber.Ctx) error {
	kw := strings.TrimSpace(c.Query("keyword"))
	if kw == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "缺少 keyword 参数",
		})
	}

	if err := database.DB.Where("keyword = ?", kw).Delete(&model.SearchLog{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "删除搜索记录失败",
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "已处理并移除该搜索词",
	})
}
