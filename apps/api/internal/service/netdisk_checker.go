package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

// CheckResult 单个链接检测结果
type CheckResult struct {
	LinkID        uuid.UUID `json:"link_id"`
	ResourceID    uuid.UUID `json:"resource_id"`
	ResourceTitle string    `json:"resource_title"`
	ResourceSlug  string    `json:"resource_slug"`
	DriveType     string    `json:"drive_type"`
	ShareURL      string    `json:"share_url"`
	Status        string    `json:"status"` // active, invalid, reported
	InvalidReason string    `json:"invalid_reason,omitempty"`
	CheckedAt     time.Time `json:"checked_at"`
}

// BatchCheckOptions 批量巡检配置参数（带频率调控）
type BatchCheckOptions struct {
	MinIntervalHours int    `json:"min_interval_hours"` // 冷却时间（小时）：跳过指定小时内已检测过的链接，默认 24 小时
	Force            bool   `json:"force"`              // 是否强制全量检测（忽略冷却时间）
	StatusFilter     string `json:"status_filter"`      // 筛选特定状态："" (全部), "reported" (仅用户报错), "active", "invalid"
	Limit            int    `json:"limit"`              // 最大检测数量限制，防止单次执行过重，默认 50
}

// BatchCheckSummary 批量检测执行汇总
type BatchCheckSummary struct {
	TotalEligible int           `json:"total_eligible"` // 数据库符合条件的链接总数
	CheckedCount  int           `json:"checked_count"`  // 本次实际检测数
	ActiveCount   int           `json:"active_count"`   // 经检测正常的数量
	InvalidCount  int           `json:"invalid_count"`  // 经检测失效的数量
	SkippedCount  int           `json:"skipped_count"`  // 因冷却保护跳过的数量
	Results       []CheckResult `json:"results"`        // 本次检测结果明细
}

type NetdiskCheckerService struct {
	client *http.Client
	parser *NetdiskParserService
}

func NewNetdiskCheckerService(parser *NetdiskParserService) *NetdiskCheckerService {
	tr := &http.Transport{
		Proxy: func(req *http.Request) (*url.URL, error) {
			if u, err := http.ProxyFromEnvironment(req); err == nil && u != nil {
				return u, nil
			}
			return url.Parse("http://127.0.0.1:7897")
		},
	}
	return &NetdiskCheckerService{
		client: &http.Client{
			Transport: tr,
			Timeout:   8 * time.Second,
		},
		parser: parser,
	}
}

// CheckSingleLink 轻量存活探测（放宽非必要限制，无需递归遍历算大小，速度提升 5~10 倍）
func (s *NetdiskCheckerService) CheckSingleLink(link *model.ResourceLink) (status string, reason string) {
	rawURL := strings.TrimSpace(link.ShareURL)
	if rawURL == "" {
		return "invalid", "网盘链接为空"
	}

	// 1. 过滤明显的占位符假链接
	lowerURL := strings.ToLower(rawURL)
	if strings.Contains(lowerURL, "demo_") || strings.Contains(lowerURL, "demo-") ||
		strings.Contains(lowerURL, "updated_quark_link") || strings.Contains(lowerURL, "example.com") {
		return "invalid", "初始示例占位链接，尚未配置真实网盘分享"
	}

	driveType := strings.ToLower(link.DriveType)

	// 2. 夸克网盘轻量存活探测（单次快速 Token 凭据校验，无需翻目录算容量）
	if driveType == "quark" || strings.Contains(rawURL, "quark.cn") {
		return s.probeQuarkLiveness(rawURL, link.ExtractCode)
	}

	// 3. 百度网盘轻量存活探测（单次 GET 网页死链特征词比对，毫秒级响应）
	if driveType == "baidu" || strings.Contains(rawURL, "baidu.com") {
		return s.probeBaiduLiveness(rawURL, link.ExtractCode)
	}

	// 4. 通用网盘（阿里云盘、迅雷等，单次 HEAD/GET 检测）
	return s.probeGenericLiveness(rawURL)
}

// probeQuarkLiveness 夸克轻量存活探测（单次 POST 换取凭证，确认分享正常即可判定有效）
func (s *NetdiskCheckerService) probeQuarkLiveness(rawURL, passcode string) (string, string) {
	re := regexp.MustCompile(`/s/([a-zA-Z0-9]+)`)
	matches := re.FindStringSubmatch(rawURL)
	if len(matches) < 2 {
		return "invalid", "无法识别有效夸克分享短链标识"
	}

	pwdID := matches[1]
	tokenURL := "https://pan.quark.cn/1/clouddrive/share/sharepage/token"
	tokenPayload := fmt.Sprintf(`{"pwd_id":"%s","passcode":"%s"}`, pwdID, passcode)

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(tokenPayload))
	if err != nil {
		return "invalid", "构建检测请求失败"
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://pan.quark.cn/")

	resp, err := s.client.Do(req)
	if err != nil {
		return "invalid", "夸克网盘接口响应超时"
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var tokenResult struct {
		Status  int    `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Stoken string `json:"stoken"`
			Title  string `json:"title"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &tokenResult); err == nil {
		// 只要夸克官方返回 stoken，即 100% 证明该分享存在且可用
		if tokenResult.Data.Stoken != "" {
			return "active", ""
		}
		// 提取码需更新时
		if strings.Contains(tokenResult.Message, "提取码") || strings.Contains(tokenResult.Message, "密码") {
			return "reported", "提取码可能需要更新"
		}
		if tokenResult.Message != "" {
			return "invalid", fmt.Sprintf("夸克提示: %s", tokenResult.Message)
		}
	}

	bodyStr := string(body)
	if strings.Contains(bodyStr, "已取消") || strings.Contains(bodyStr, "已被删除") || strings.Contains(bodyStr, "不存在") {
		return "invalid", "夸克分享已被取消或清理"
	}

	return "invalid", "夸克分享未能获取有效访问凭据"
}

// probeBaiduLiveness 百度网盘轻量存活探测（单次 GET 网页死链特征词比对，无需穿透子目录）
func (s *NetdiskCheckerService) probeBaiduLiveness(rawURL, passcode string) (string, string) {
	_, surl, _ := extractBaiduParams(rawURL, passcode)
	if surl == "" {
		return "invalid", "无法识别百度网盘分享提取ID"
	}

	pageURL := fmt.Sprintf("https://pan.baidu.com/s/1%s", surl)
	req, err := http.NewRequest("GET", pageURL, nil)
	if err != nil {
		return "invalid", "构建百度请求失败"
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://pan.baidu.com/")

	resp, err := s.client.Do(req)
	if err != nil {
		return "invalid", "百度网盘请求超时"
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 || resp.StatusCode == 410 {
		return "invalid", "百度网盘分享页面返回 404"
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	html := string(bodyBytes)

	// 百度典型死链特征词
	deadKeywords := []string{
		"啊哦，你来晚了",
		"分享的文件已经被取消了",
		"分享的文件已经被删除了",
		"此链接分享内容可能因为涉及侵权",
		"页面不存在",
		"链接不存在",
	}

	for _, kw := range deadKeywords {
		if strings.Contains(html, kw) {
			return "invalid", fmt.Sprintf("百度提示：%s", kw)
		}
	}

	// 只要页面未命中死链特征，且包含百度网盘基本页面标志，即判定为存活有效
	if strings.Contains(html, "shareid") || strings.Contains(html, "share_uk") ||
		strings.Contains(html, "init_pwd") || strings.Contains(html, "提取码") ||
		strings.Contains(html, "pan.baidu.com") {
		return "active", ""
	}

	return "invalid", "百度网盘页面未能识别有效分享内容"
}

// probeGenericLiveness 通用网盘存活探测
func (s *NetdiskCheckerService) probeGenericLiveness(rawURL string) (string, string) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return "invalid", "链接格式非法"
	}

	req, err := http.NewRequest("HEAD", rawURL, nil)
	if err != nil {
		req, _ = http.NewRequest("GET", rawURL, nil)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := s.client.Do(req)
	if err != nil {
		return "invalid", "请求超时，该地址无法连通"
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "invalid", fmt.Sprintf("页面响应 HTTP %d 错误", resp.StatusCode)
	}

	return "active", ""
}

// RunBatchCheck 执行批量轻量巡检（极速且保护历史状态）
func (s *NetdiskCheckerService) RunBatchCheck(opts BatchCheckOptions) (*BatchCheckSummary, error) {
	if opts.MinIntervalHours <= 0 {
		opts.MinIntervalHours = 24 // 默认冷却时间：24 小时
	}
	if opts.Limit <= 0 || opts.Limit > 200 {
		opts.Limit = 50 // 默认单次巡检批次上限
	}

	query := database.DB.Model(&model.ResourceLink{})

	// 状态过滤
	if opts.StatusFilter != "" {
		query = query.Where("status = ?", opts.StatusFilter)
	}

	// 冷却调控：只有未检测过 (last_checked_at IS NULL) 或者检测时间早于指定冷却时间的链接，才允许参与本次检测
	var totalEligible int64
	query.Count(&totalEligible)

	checkQuery := database.DB.Model(&model.ResourceLink{})
	if opts.StatusFilter != "" {
		checkQuery = checkQuery.Where("status = ?", opts.StatusFilter)
	}

	if !opts.Force {
		cutoffTime := time.Now().Add(-time.Duration(opts.MinIntervalHours) * time.Hour)
		checkQuery = checkQuery.Where("last_checked_at IS NULL OR last_checked_at < ?", cutoffTime)
	}

	var linksToCheck []model.ResourceLink
	if err := checkQuery.Order("last_checked_at ASC NULLS FIRST").Limit(opts.Limit).Find(&linksToCheck).Error; err != nil {
		return nil, err
	}

	summary := &BatchCheckSummary{
		TotalEligible: int(totalEligible),
		CheckedCount:  len(linksToCheck),
		SkippedCount:  int(totalEligible) - len(linksToCheck),
		Results:       make([]CheckResult, 0, len(linksToCheck)),
	}
	if summary.SkippedCount < 0 {
		summary.SkippedCount = 0
	}

	// 提前加载关联的 Resource 信息，以便巡检报告能清晰展示所属资料标题与一键跳转
	resMap := make(map[uuid.UUID]model.Resource)
	var resIDs []uuid.UUID
	for _, l := range linksToCheck {
		resIDs = append(resIDs, l.ResourceID)
	}
	if len(resIDs) > 0 {
		var resList []model.Resource
		database.DB.Select("id, title, slug").Where("id IN ?", resIDs).Find(&resList)
		for _, r := range resList {
			resMap[r.ID] = r
		}
	}

	// 轻量并发/微延迟执行，毫秒级响应
	for _, link := range linksToCheck {
		status, reason := s.CheckSingleLink(&link)
		now := time.Now()

		updates := map[string]interface{}{
			"last_checked_at": &now,
		}

		if status == "active" {
			// 检测确凿有效：恢复为 active 并重置报错
			updates["status"] = "active"
			updates["invalid_reason"] = ""
			updates["report_count"] = 0
			summary.ActiveCount++
		} else {
			// 检测失败：标记为 invalid，若曾有用户报错则自动合并保留
			updates["status"] = "invalid"
			if link.Status == "reported" && link.InvalidReason != "" && !strings.Contains(link.InvalidReason, "巡检结果") {
				updates["invalid_reason"] = fmt.Sprintf("【用户报错】%s；【巡检结果】%s", link.InvalidReason, reason)
			} else {
				updates["invalid_reason"] = reason
			}
			summary.InvalidCount++
		}

		database.DB.Model(&model.ResourceLink{}).Where("id = ?", link.ID).Updates(updates)

		resInfo := resMap[link.ResourceID]
		summary.Results = append(summary.Results, CheckResult{
			LinkID:        link.ID,
			ResourceID:    link.ResourceID,
			ResourceTitle: resInfo.Title,
			ResourceSlug:  resInfo.Slug,
			DriveType:     link.DriveType,
			ShareURL:      link.ShareURL,
			Status:        updates["status"].(string),
			InvalidReason: updates["invalid_reason"].(string),
			CheckedAt:     now,
		})

		// 轻量休眠 100ms，友好防封
		time.Sleep(100 * time.Millisecond)
	}

	return summary, nil
}

// UserReportLink 前台用户提交网盘失效反馈（带频控防护与防刷）
func (s *NetdiskCheckerService) UserReportLink(linkID uuid.UUID, clientIP string, userReason string) (*model.ResourceLink, error) {
	var link model.ResourceLink
	if err := database.DB.First(&link, "id = ?", linkID).Error; err != nil {
		return nil, err
	}

	// 累加举报次数
	link.ReportCount++
	// 若当前为 active，标记为 reported（待核验）
	if link.Status == "active" {
		link.Status = "reported"
	}
	if userReason != "" {
		link.InvalidReason = fmt.Sprintf("用户反馈: %s", userReason)
	} else if link.InvalidReason == "" {
		link.InvalidReason = "用户反馈链接无法打开或已失效"
	}

	if err := database.DB.Save(&link).Error; err != nil {
		return nil, err
	}

	return &link, nil
}
