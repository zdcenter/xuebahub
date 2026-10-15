package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"netdisk/api/internal/model"
)

type SeoService struct {
	db     *gorm.DB
	client *http.Client
}

func NewSeoService(db *gorm.DB) *SeoService {
	return &SeoService{
		db: db,
		client: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

// GetConfig 获取全局 SEO 与搜索引擎收录配置
func (s *SeoService) GetConfig() (*model.SeoConfig, error) {
	var cfg model.SeoConfig
	err := s.db.Where("id = ?", "global").First(&cfg).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			cfg = model.SeoConfig{
				ID:                "global",
				SiteDomain:        "https://xuebaw.com",
				BaiduToken:        "",
				BaiduActive:       true,
				BingApiKey:        "7f8a9b2c3d4e5f60718293a4b5c6d7e8",
				BingActive:        true,
				AutoPushOnPublish: true,
				DailyPushLimit:    100000,
				BaiduRemainQuota:  100000,
			}
			s.db.Create(&cfg)
			return &cfg, nil
		}
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig 保存或更新 SEO 配置
func (s *SeoService) SaveConfig(cfg *model.SeoConfig) error {
	cfg.ID = "global"
	cfg.UpdatedAt = time.Now()
	return s.db.Save(cfg).Error
}

type BaiduPushResponse struct {
	Remain      int      `json:"remain"`
	Success     int      `json:"success"`
	NotSameSite []string `json:"not_same_site,omitempty"`
	NotValid    []string `json:"not_valid,omitempty"`
	Error       int      `json:"error,omitempty"`
	Message     string   `json:"message,omitempty"`
}

// PushUrlsToBaidu 推送 URL 列表至百度搜索资源平台 (API 收录)
func (s *SeoService) PushUrlsToBaidu(siteDomain, token string, urls []string) (*BaiduPushResponse, string, error) {
	if token == "" {
		return nil, "", errors.New("尚未配置百度搜索资源平台 Token (准入密钥)")
	}
	if len(urls) == 0 {
		return nil, "", errors.New("待推送 URL 列表为空")
	}

	// 提取纯域名（例如从 https://xuebaw.com 提取 xuebaw.com 或保持原站点）
	domain := siteDomain
	if strings.HasPrefix(domain, "http://") || strings.HasPrefix(domain, "https://") {
		u, err := url.Parse(domain)
		if err == nil && u.Host != "" {
			domain = u.Host
		}
	}

	apiURL := fmt.Sprintf("http://data.zz.baidu.com/urls?site=%s&token=%s", url.QueryEscape(domain), url.QueryEscape(token))
	bodyPayload := strings.Join(urls, "\n")

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(bodyPayload))
	if err != nil {
		return nil, "", fmt.Errorf("创建百度请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("User-Agent", "curl/7.12.1 (XuebaWebmasterBot/1.0)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("请求百度推送接口网络错误: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("读取百度接口返回失败: %w", err)
	}
	rawResp := string(respBytes)

	var baiduResp BaiduPushResponse
	if err := json.Unmarshal(respBytes, &baiduResp); err != nil {
		return nil, rawResp, fmt.Errorf("解析百度接口返回失败 (HTTP %d): %s", resp.StatusCode, rawResp)
	}

	if baiduResp.Error != 0 {
		return &baiduResp, rawResp, fmt.Errorf("百度返回错误代码 %d: %s", baiduResp.Error, baiduResp.Message)
	}

	return &baiduResp, rawResp, nil
}

type IndexNowRequest struct {
	Host        string   `json:"host"`
	Key         string   `json:"key"`
	KeyLocation string   `json:"keyLocation,omitempty"`
	UrlList     []string `json:"urlList"`
}

// PushUrlsToIndexNow 推送 URL 列表至微软必应 / IndexNow 开放索引协议
func (s *SeoService) PushUrlsToIndexNow(siteDomain, apiKey string, urls []string) (string, error) {
	if apiKey == "" {
		return "", errors.New("尚未配置必应/IndexNow API Key")
	}
	if len(urls) == 0 {
		return "", errors.New("待推送 URL 列表为空")
	}

	host := siteDomain
	if strings.HasPrefix(host, "http://") || strings.HasPrefix(host, "https://") {
		u, err := url.Parse(host)
		if err == nil && u.Host != "" {
			host = u.Host
		}
	}

	payload := IndexNowRequest{
		Host:        host,
		Key:         apiKey,
		KeyLocation: fmt.Sprintf("https://%s/%s.txt", host, apiKey),
		UrlList:     urls,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("序列化 IndexNow 请求体失败: %w", err)
	}

	// 优先推送 indexnow.org，次推 bing.com
	endpoints := []string{
		"https://api.indexnow.org/indexnow",
		"https://www.bing.com/indexnow",
	}

	var lastErr error
	var finalResp string

	for _, endpoint := range endpoints {
		req, err := http.NewRequest("POST", endpoint, bytes.NewReader(payloadBytes))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
		req.Header.Set("User-Agent", "XuebaWebmasterIndexNow/1.0")

		resp, err := s.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBytes, _ := io.ReadAll(resp.Body)
		finalResp = string(respBytes)

		// 200 (OK) 或 202 (Accepted) 均为接收成功
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusAccepted {
			if finalResp == "" {
				finalResp = fmt.Sprintf(`{"status":%d,"message":"IndexNow received successfully by %s"}`, resp.StatusCode, endpoint)
			}
			return finalResp, nil
		}

		lastErr = fmt.Errorf("IndexNow 端点 %s 返回状态码: %d, 返回内容: %s", endpoint, resp.StatusCode, finalResp)
	}

	return finalResp, lastErr
}

// SeoBatchPushSummary 批量推送最终返回汇总
type SeoBatchPushSummary struct {
	TotalURLs       int                    `json:"total_urls"`
	BaiduSuccess    int                    `json:"baidu_success"`
	BaiduRemain     int                    `json:"baidu_remain"`
	BaiduError      string                 `json:"baidu_error,omitempty"`
	BingSuccess     bool                   `json:"bing_success"`
	BingError       string                 `json:"bing_error,omitempty"`
	Status          string                 `json:"status"` // success, partial, failed
	URLs            []string               `json:"urls"`
	Details         map[string]interface{} `json:"details"`
	SummaryMessage  string                 `json:"summary_message"`
}

// BatchPush 综合批量推送 (支持资源 ID 列表或自定义手动 URL 列表)
func (s *SeoService) BatchPush(engine string, resourceIDs []uuid.UUID, manualURLs []string) (*SeoBatchPushSummary, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, fmt.Errorf("获取 SEO 配置失败: %w", err)
	}

	sitePrefix := strings.TrimRight(cfg.SiteDomain, "/")
	if sitePrefix == "" {
		sitePrefix = "https://xuebaw.com"
	}

	urlMap := make(map[string]bool)
	var targetURLs []string

	// 1. 如果传了资源 ID，从数据库查出真实 slug 拼装 URL
	if len(resourceIDs) > 0 {
		var resources []model.Resource
		s.db.Where("id IN ?", resourceIDs).Select("id", "slug").Find(&resources)
		for _, r := range resources {
			fullURL := fmt.Sprintf("%s/resource/%s", sitePrefix, r.Slug)
			if !urlMap[fullURL] {
				urlMap[fullURL] = true
				targetURLs = append(targetURLs, fullURL)
			}
		}
	}

	// 2. 如果传了手动自定义 URL
	for _, raw := range manualURLs {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
			trimmed = sitePrefix + "/" + strings.TrimLeft(trimmed, "/")
		}
		if !urlMap[trimmed] {
			urlMap[trimmed] = true
			targetURLs = append(targetURLs, trimmed)
		}
	}

	if len(targetURLs) == 0 {
		return nil, errors.New("有效推送 URL 为空，请勾选资料或输入有效 URL")
	}

	summary := &SeoBatchPushSummary{
		TotalURLs: len(targetURLs),
		URLs:      targetURLs,
		Details:   make(map[string]interface{}),
	}

	var rawResponses []string
	baiduOK := false
	bingOK := false

	// 是否需要推百度
	needBaidu := (engine == "baidu" || engine == "all") && cfg.BaiduActive
	if needBaidu {
		if cfg.BaiduToken == "" {
			summary.BaiduError = "未配置百度准入 Token"
		} else {
			bResp, rawBaidu, bErr := s.PushUrlsToBaidu(sitePrefix, cfg.BaiduToken, targetURLs)
			if bErr != nil {
				summary.BaiduError = bErr.Error()
				rawResponses = append(rawResponses, fmt.Sprintf("[Baidu Error] %s", bErr.Error()))
			} else {
				baiduOK = true
				summary.BaiduSuccess = bResp.Success
				summary.BaiduRemain = bResp.Remain
				cfg.BaiduRemainQuota = bResp.Remain
				rawResponses = append(rawResponses, fmt.Sprintf("[Baidu Success] %s", rawBaidu))
			}
		}
	}

	// 是否需要推必应 IndexNow
	needBing := (engine == "bing" || engine == "all") && cfg.BingActive
	if needBing {
		if cfg.BingApiKey == "" {
			summary.BingError = "未配置必应 IndexNow Key"
		} else {
			rawBing, bingErr := s.PushUrlsToIndexNow(sitePrefix, cfg.BingApiKey, targetURLs)
			if bingErr != nil {
				summary.BingError = bingErr.Error()
				rawResponses = append(rawResponses, fmt.Sprintf("[Bing Error] %s", bingErr.Error()))
			} else {
				bingOK = true
				summary.BingSuccess = true
				rawResponses = append(rawResponses, fmt.Sprintf("[Bing Success] %s", rawBing))
			}
		}
	}

	// 状态判定
	if (needBaidu && baiduOK) || (needBing && bingOK) {
		if (needBaidu && !baiduOK) || (needBing && !bingOK) {
			summary.Status = "partial"
		} else {
			summary.Status = "success"
		}
	} else {
		summary.Status = "failed"
	}

	// 组装自然语言提示语
	var msgParts []string
	if needBaidu {
		if baiduOK {
			msgParts = append(msgParts, fmt.Sprintf("百度成功收录 %d 条 (今日剩余配额: %d)", summary.BaiduSuccess, summary.BaiduRemain))
		} else {
			msgParts = append(msgParts, fmt.Sprintf("百度推送失败: %s", summary.BaiduError))
		}
	}
	if needBing {
		if bingOK {
			msgParts = append(msgParts, "必应 IndexNow 极速索引接收成功")
		} else {
			msgParts = append(msgParts, fmt.Sprintf("必应推送失败: %s", summary.BingError))
		}
	}
	summary.SummaryMessage = strings.Join(msgParts, "； ")

	// 更新统计数据
	now := time.Now()
	cfg.LastPushAt = &now
	if summary.Status == "success" || summary.Status == "partial" {
		cfg.TodayPushedCount += len(targetURLs)
		cfg.TotalPushedCount += len(targetURLs)
	}
	s.db.Save(cfg)

	// 记录持久化日志
	urlsJSON, _ := json.Marshal(targetURLs)
	pushLog := model.SeoPushLog{
		Engine:        engine,
		URLCount:      len(targetURLs),
		URLs:          datatypes.JSON(urlsJSON),
		Status:        summary.Status,
		ResultSummary: summary.SummaryMessage,
		ResponseBody:  strings.Join(rawResponses, "\n---\n"),
		CreatedAt:     now,
	}
	if summary.Status == "failed" {
		pushLog.ErrorMessage = summary.SummaryMessage
	}
	s.db.Create(&pushLog)

	log.Printf("[SeoService] BatchPush finished. Engine: %s, URLs: %d, Status: %s, Summary: %s", engine, len(targetURLs), summary.Status, summary.SummaryMessage)
	return summary, nil
}

// PushAllPublished 一键推送全站所有已发布资料
func (s *SeoService) PushAllPublished(engine string, limit int) (*SeoBatchPushSummary, error) {
	if limit <= 0 || limit > 2000 {
		limit = 1000
	}

	var resources []model.Resource
	err := s.db.Where("is_published = ?", true).Order("updated_at DESC").Limit(limit).Find(&resources).Error
	if err != nil {
		return nil, fmt.Errorf("查询已发布资源失败: %w", err)
	}

	if len(resources) == 0 {
		return nil, errors.New("当前暂无已上架发布的资料")
	}

	var ids []uuid.UUID
	for _, r := range resources {
		ids = append(ids, r.ID)
	}

	return s.BatchPush(engine, ids, nil)
}

// GetLogs 分页获取推送历史流水
func (s *SeoService) GetLogs(page, pageSize int) ([]model.SeoPushLog, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var total int64
	s.db.Model(&model.SeoPushLog{}).Count(&total)

	var logs []model.SeoPushLog
	err := s.db.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&logs).Error
	return logs, total, err
}

// GetStats 获取 SEO 综合看板核心统计
func (s *SeoService) GetStats() (map[string]interface{}, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, err
	}

	var totalResources int64
	var publishedResources int64
	s.db.Model(&model.Resource{}).Count(&totalResources)
	s.db.Model(&model.Resource{}).Where("is_published = ?", true).Count(&publishedResources)

	var totalLogs int64
	var successLogs int64
	s.db.Model(&model.SeoPushLog{}).Count(&totalLogs)
	s.db.Model(&model.SeoPushLog{}).Where("status = ?", "success").Count(&successLogs)

	var latestLogs []model.SeoPushLog
	s.db.Order("created_at DESC").Limit(8).Find(&latestLogs)

	return map[string]interface{}{
		"site_domain":         cfg.SiteDomain,
		"baidu_active":        cfg.BaiduActive,
		"baidu_token_set":     cfg.BaiduToken != "",
		"baidu_remain_quota":  cfg.BaiduRemainQuota,
		"bing_active":         cfg.BingActive,
		"bing_key_set":        cfg.BingApiKey != "",
		"auto_push":           cfg.AutoPushOnPublish,
		"today_pushed_count":  cfg.TodayPushedCount,
		"total_pushed_count":  cfg.TotalPushedCount,
		"last_push_at":        cfg.LastPushAt,
		"total_resources":     totalResources,
		"published_resources": publishedResources,
		"total_logs":          totalLogs,
		"success_logs":        successLogs,
		"latest_logs":         latestLogs,
	}, nil
}

// GenerateSitemapXML 动态生成标准 XML 格式站点地图 (Sitemap 协议)
func (s *SeoService) GenerateSitemapXML() (string, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return "", err
	}
	sitePrefix := strings.TrimRight(cfg.SiteDomain, "/")
	if sitePrefix == "" {
		sitePrefix = "https://xuebaw.com"
	}

	var resources []model.Resource
	s.db.Where("is_published = ?", true).Order("updated_at DESC").Find(&resources)

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")

	// 首页与固定路由
	sb.WriteString(fmt.Sprintf("  <url>\n    <loc>%s/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n", sitePrefix))
	sb.WriteString(fmt.Sprintf("  <url>\n    <loc>%s/requests</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n", sitePrefix))

	// 资料详情页
	for _, r := range resources {
		lastmod := r.UpdatedAt.Format("2006-01-02")
		sb.WriteString("  <url>\n")
		sb.WriteString(fmt.Sprintf("    <loc>%s/resource/%s</loc>\n", sitePrefix, r.Slug))
		sb.WriteString(fmt.Sprintf("    <lastmod>%s</lastmod>\n", lastmod))
		sb.WriteString("    <changefreq>weekly</changefreq>\n")
		sb.WriteString("    <priority>0.9</priority>\n")
		sb.WriteString("  </url>\n")
	}

	sb.WriteString(`</urlset>`)
	return sb.String(), nil
}
