package handler

import (
	"math"

	"github.com/gofiber/fiber/v3"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type StatsHandler struct{}

func NewStatsHandler() *StatsHandler {
	return &StatsHandler{}
}

type OverviewStats struct {
	TotalResources     int64   `json:"total_resources"`
	PublishedResources int64   `json:"published_resources"`
	TotalViews         int64   `json:"total_views"`
	TotalSaves         int64   `json:"total_saves"`
	SaveRate           float64 `json:"save_rate"`
	TotalLinks         int64   `json:"total_links"`
	ActiveLinks        int64   `json:"active_links"`
	InvalidLinks       int64   `json:"invalid_links"`
	ReportedLinks      int64   `json:"reported_links"`
	HealthRate         float64 `json:"health_rate"`
	TotalClicks        int64   `json:"total_clicks"`
	TotalAccounts      int64   `json:"total_accounts"`
	ValidAccounts      int64   `json:"valid_accounts"`
}

type DriveStatItem struct {
	DriveType  string  `json:"drive_type"`
	Name       string  `json:"name"`
	Icon       string  `json:"icon"`
	LinkCount  int64   `json:"link_count"`
	ClickCount int64   `json:"click_count"`
	Percentage float64 `json:"percentage"`
}

type ChannelStatItem struct {
	ChannelSlug   string  `json:"channel_slug"`
	ChannelName   string  `json:"channel_name"`
	Icon          string  `json:"icon"`
	ResourceCount int64   `json:"resource_count"`
	ViewCount     int64   `json:"view_count"`
	SaveCount     int64   `json:"save_count"`
	SaveRate      float64 `json:"save_rate"`
}

type TopResourceItem struct {
	ID          string  `json:"id"`
	Slug        string  `json:"slug"`
	Title       string  `json:"title"`
	ChannelSlug string  `json:"channel_slug"`
	FileType    string  `json:"file_type"`
	ViewCount   int     `json:"view_count"`
	SaveCount   int     `json:"save_count"`
	SaveRate    float64 `json:"save_rate"`
}

type SearchStatItem struct {
	Keyword     string `json:"keyword"`
	Count       int64  `json:"count"`
	ResultCount int    `json:"result_count"`
}

type DashboardStatsResponse struct {
	Overview     OverviewStats     `json:"overview"`
	Drives       []DriveStatItem   `json:"drives"`
	Channels     []ChannelStatItem `json:"channels"`
	TopResources []TopResourceItem `json:"top_resources"`
	Searches     []SearchStatItem  `json:"searches"`
}

// round1 保留 1 位小数
func round1(val float64) float64 {
	return math.Round(val*10) / 10
}

// GetDashboardStats 聚合全站真实核心运营与网盘转存监控数据
func (h *StatsHandler) GetDashboardStats(c fiber.Ctx) error {
	db := database.DB

	var overview OverviewStats

	// 1. 资料量与总浏览、总转存
	db.Model(&model.Resource{}).Count(&overview.TotalResources)
	db.Model(&model.Resource{}).Where("is_published = true").Count(&overview.PublishedResources)

	var resSum struct {
		SumViews int64
		SumSaves int64
	}
	db.Model(&model.Resource{}).Select("COALESCE(SUM(view_count), 0) as sum_views, COALESCE(SUM(save_count), 0) as sum_saves").Scan(&resSum)
	overview.TotalViews = resSum.SumViews
	overview.TotalSaves = resSum.SumSaves
	if overview.TotalViews > 0 {
		overview.SaveRate = round1(float64(overview.TotalSaves) / float64(overview.TotalViews) * 100)
	}

	// 2. 链接存活健康监控
	db.Model(&model.ResourceLink{}).Count(&overview.TotalLinks)
	db.Model(&model.ResourceLink{}).Where("status = 'active'").Count(&overview.ActiveLinks)
	db.Model(&model.ResourceLink{}).Where("status = 'invalid'").Count(&overview.InvalidLinks)
	db.Model(&model.ResourceLink{}).Where("status = 'reported'").Count(&overview.ReportedLinks)

	var linkSum struct {
		SumClicks int64
	}
	db.Model(&model.ResourceLink{}).Select("COALESCE(SUM(click_count), 0) as sum_clicks").Scan(&linkSum)
	overview.TotalClicks = linkSum.SumClicks

	if overview.TotalLinks > 0 {
		overview.HealthRate = round1(float64(overview.ActiveLinks) / float64(overview.TotalLinks) * 100)
	} else {
		overview.HealthRate = 100.0
	}

	// 网盘账号健康监控
	db.Model(&model.NetdiskAccount{}).Count(&overview.TotalAccounts)
	db.Model(&model.NetdiskAccount{}).Where("status = 'valid'").Count(&overview.ValidAccounts)

	// 3. 各网盘渠道分布统计
	type DriveRow struct {
		DriveType  string
		LinkCount  int64
		ClickCount int64
	}
	var driveRows []DriveRow
	db.Model(&model.ResourceLink{}).
		Select("drive_type, COUNT(*) as link_count, COALESCE(SUM(click_count), 0) as click_count").
		Group("drive_type").
		Order("click_count DESC, link_count DESC").
		Scan(&driveRows)

	driveNameMap := map[string]struct{ Name, Icon string }{
		"quark":  {"夸克网盘", "⚡"},
		"baidu":  {"百度网盘", "📦"},
		"aliyun": {"阿里云盘", "☁️"},
		"xunlei": {"迅雷云盘", "⚡"},
	}

	var driveStats []DriveStatItem
	for _, row := range driveRows {
		meta, ok := driveNameMap[row.DriveType]
		if !ok {
			meta = struct{ Name, Icon string }{row.DriveType, "💾"}
		}
		var pct float64 = 0
		if overview.TotalClicks > 0 {
			pct = round1(float64(row.ClickCount) / float64(overview.TotalClicks) * 100)
		} else if overview.TotalLinks > 0 {
			pct = round1(float64(row.LinkCount) / float64(overview.TotalLinks) * 100)
		}
		driveStats = append(driveStats, DriveStatItem{
			DriveType:  row.DriveType,
			Name:       meta.Name,
			Icon:       meta.Icon,
			LinkCount:  row.LinkCount,
			ClickCount: row.ClickCount,
			Percentage: pct,
		})
	}

	// 4. 各频道综合效益统计
	var channels []model.Channel
	db.Find(&channels)
	channelMap := make(map[string]model.Channel)
	for _, ch := range channels {
		channelMap[ch.Slug] = ch
	}

	type ChanRow struct {
		ChannelSlug   string
		ResourceCount int64
		ViewCount     int64
		SaveCount     int64
	}
	var chanRows []ChanRow
	db.Model(&model.Resource{}).
		Select("channel_slug, COUNT(*) as resource_count, COALESCE(SUM(view_count), 0) as view_count, COALESCE(SUM(save_count), 0) as save_count").
		Group("channel_slug").
		Scan(&chanRows)

	var channelStats []ChannelStatItem
	for _, cr := range chanRows {
		chMeta, ok := channelMap[cr.ChannelSlug]
		name := cr.ChannelSlug
		icon := "📁"
		if ok {
			name = chMeta.Name
			icon = chMeta.Icon
		}
		var rate float64 = 0
		if cr.ViewCount > 0 {
			rate = round1(float64(cr.SaveCount) / float64(cr.ViewCount) * 100)
		}
		channelStats = append(channelStats, ChannelStatItem{
			ChannelSlug:   cr.ChannelSlug,
			ChannelName:   name,
			Icon:          icon,
			ResourceCount: cr.ResourceCount,
			ViewCount:     cr.ViewCount,
			SaveCount:     cr.SaveCount,
			SaveRate:      rate,
		})
	}

	// 5. 热门高转化资源排行榜 (Top 10)
	var topResList []model.Resource
	db.Where("is_published = true").
		Order("save_count DESC, view_count DESC").
		Limit(10).
		Find(&topResList)

	var topResources []TopResourceItem
	for _, r := range topResList {
		var rate float64 = 0
		if r.ViewCount > 0 {
			rate = round1(float64(r.SaveCount) / float64(r.ViewCount) * 100)
		}
		topResources = append(topResources, TopResourceItem{
			ID:          r.ID.String(),
			Slug:        r.Slug,
			Title:       r.Title,
			ChannelSlug: r.ChannelSlug,
			FileType:    r.FileType,
			ViewCount:   r.ViewCount,
			SaveCount:   r.SaveCount,
			SaveRate:    rate,
		})
	}

	// 6. 热搜词与长尾意向监控 (Top 10)
	type SearchRow struct {
		Keyword     string
		Count       int64
		ResultCount int
	}
	var searchRows []SearchRow
	db.Model(&model.SearchLog{}).
		Select("keyword, COUNT(*) as count, MAX(result_count) as result_count").
		Group("keyword").
		Order("count DESC").
		Limit(10).
		Scan(&searchRows)

	var searchStats []SearchStatItem
	for _, sr := range searchRows {
		searchStats = append(searchStats, SearchStatItem{
			Keyword:     sr.Keyword,
			Count:       sr.Count,
			ResultCount: sr.ResultCount,
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": DashboardStatsResponse{
			Overview:     overview,
			Drives:       driveStats,
			Channels:     channelStats,
			TopResources: topResources,
			Searches:     searchStats,
		},
	})
}
