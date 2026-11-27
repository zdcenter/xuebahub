package handler

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/PuerkitoBio/goquery"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type ScoutHandler struct {
	transferSvc *service.QuarkTransferService
	smartMeta   *service.SmartMetaService
}

func NewScoutHandler(transferSvc *service.QuarkTransferService, smartMeta *service.SmartMetaService) *ScoutHandler {
	return &ScoutHandler{
		transferSvc: transferSvc,
		smartMeta:   smartMeta,
	}
}

var (
	scoutSpaceRe  = regexp.MustCompile(`\s+`)
	scoutMdLinkRe = regexp.MustCompile(`^\[([^\]]+)\]\((https?://[^\)]+)\)$`)
)

func cleanScoutTitle(s string) string {
	s = strings.TrimSpace(s)
	s = scoutSpaceRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func isValidScoutTitle(title string) bool {
	l := utf8.RuneCountInString(title)
	if l < 4 || l > 160 {
		return false
	}
	lower := strings.ToLower(title)
	noise := []string{"登录", "注册", "首页", "上一页", "下一页", "联系我们", "关于我们", "免责声明", "隐私政策", "版权声明", "查看更多", "点击下载", "立即开通", "会员中心"}
	for _, n := range noise {
		if lower == n {
			return false
		}
	}
	return true
}

func detectDriveTypeFromURL(rawURL string) string {
	u := strings.ToLower(rawURL)
	switch {
	case strings.Contains(u, "pan.quark.cn"):
		return "quark"
	case strings.Contains(u, "pan.baidu.com"):
		return "baidu"
	case strings.Contains(u, "alipan.com") || strings.Contains(u, "aliyundrive.com"):
		return "alipan"
	case strings.Contains(u, "pan.xunlei.com"):
		return "xunlei"
	default:
		return "quark"
	}
}

type scoutCandidate struct {
	Title string
	URL   string
}

func saveScoutCandidates(sourceName string, candidates []scoutCandidate) (added int, skipped int, created []model.ResourceDraft) {
	seenInBatch := make(map[string]bool)

	for _, cand := range candidates {
		title := cleanScoutTitle(cand.Title)
		if !isValidScoutTitle(title) {
			continue
		}
		key := strings.ToLower(title)
		if seenInBatch[key] {
			skipped++
			continue
		}
		seenInBatch[key] = true

		// 去重：正式资料库或草稿库已存在同名则跳过
		var resCnt int64
		database.DB.Model(&model.Resource{}).Where("LOWER(title) = ?", key).Count(&resCnt)
		if resCnt > 0 {
			skipped++
			continue
		}
		var draftCnt int64
		database.DB.Model(&model.ResourceDraft{}).Where("LOWER(title) = ?", key).Count(&draftCnt)
		if draftCnt > 0 {
			skipped++
			continue
		}

		draft := model.ResourceDraft{
			Title:      title,
			SourceName: sourceName,
			DriveType:  "topic_scout",
			ShareURL:   "",
			RawText:    cand.URL,
			Status:     "need_source",
			IsSafe:     true,
		}
		if err := database.DB.Create(&draft).Error; err == nil {
			created = append(created, draft)
			added++
		}
	}
	return added, skipped, created
}

// FetchTitles 从目标网页抓取公开标题列表并去重存入待寻源选题库
func (h *ScoutHandler) FetchTitles(c fiber.Ctx) error {
	var req struct {
		URL        string `json:"url"`
		SourceName string `json:"source_name"`
		Selector   string `json:"selector"`
		MaxItems   int    `json:"max_items"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	targetURL := strings.TrimSpace(req.URL)
	if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请输入以 http:// 或 https:// 开头的有效网址"})
	}

	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "网址格式无效"})
	}

	sourceName := strings.TrimSpace(req.SourceName)
	if sourceName == "" {
		sourceName = parsedURL.Hostname()
	}

	maxItems := req.MaxItems
	if maxItems <= 0 || maxItems > 200 {
		maxItems = 80
	}

	client := &http.Client{Timeout: 15 * time.Second}
	httpReq, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "构建请求失败"})
	}
	httpReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
	httpReq.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	httpReq.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := client.Do(httpReq)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"code":    502,
			"message": fmt.Sprintf("访问目标网址失败（%v），可改用下方「粘贴标题批量导入」", err),
		})
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": fmt.Sprintf("目标站点返回状态码 %d（可能存在防爬或需登录），建议在浏览器打开页面后复制标题，使用「粘贴标题批量导入」", resp.StatusCode),
		})
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "解析网页 HTML 失败"})
	}

	selectors := []string{}
	if sel := strings.TrimSpace(req.Selector); sel != "" {
		selectors = append(selectors, sel)
	} else {
		selectors = []string{
			"article h2 a, article h3 a, .entry-title a, .post-title a, .item-title a, .card-title a, .title a",
			"h2 a, h3 a, .list-group-item a, .topic-title a",
			"a[title]",
		}
	}

	var candidates []scoutCandidate
	for _, sel := range selectors {
		doc.Find(sel).Each(func(i int, s *goquery.Selection) {
			if len(candidates) >= maxItems {
				return
			}
			title := cleanScoutTitle(s.Text())
			if title == "" {
				if tAttr, ok := s.Attr("title"); ok {
					title = cleanScoutTitle(tAttr)
				}
			}
			href, _ := s.Attr("href")
			itemURL := targetURL
			if href != "" {
				if refURL, err := url.Parse(href); err == nil {
					itemURL = parsedURL.ResolveReference(refURL).String()
				}
			}
			if isValidScoutTitle(title) {
				candidates = append(candidates, scoutCandidate{Title: title, URL: itemURL})
			}
		})
		if len(candidates) >= 3 {
			break
		}
	}

	if len(candidates) == 0 {
		return c.JSON(fiber.Map{
			"code": 200,
			"data": fiber.Map{
				"fetched_count": 0,
				"added_count":   0,
				"skipped_count": 0,
				"message":       "未自动识别到有效资料标题（可能是前端 JS 渲染或选择器不匹配），建议使用「粘贴标题批量导入」或填写自定义 CSS 选择器",
			},
		})
	}

	added, skipped, created := saveScoutCandidates(sourceName, candidates)
	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"fetched_count": len(candidates),
			"added_count":   added,
			"skipped_count": skipped,
			"items":         created,
		},
	})
}

// ImportTextTitles 粘贴多行标题（或 HTML 片段 / Markdown 链接）批量导入待寻源选题库
func (h *ScoutHandler) ImportTextTitles(c fiber.Ctx) error {
	var req struct {
		SourceName string `json:"source_name"`
		Text       string `json:"text"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}
	raw := strings.TrimSpace(req.Text)
	if raw == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请粘贴至少一条标题文本"})
	}
	sourceName := strings.TrimSpace(req.SourceName)
	if sourceName == "" {
		sourceName = "手动导入"
	}

	var candidates []scoutCandidate
	if strings.Contains(raw, "<a") || strings.Contains(raw, "<h") {
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(raw))
		if err == nil {
			doc.Find("a, h1, h2, h3, h4, li").Each(func(i int, s *goquery.Selection) {
				t := cleanScoutTitle(s.Text())
				href, _ := s.Attr("href")
				if isValidScoutTitle(t) {
					candidates = append(candidates, scoutCandidate{Title: t, URL: href})
				}
			})
		}
	}

	if len(candidates) == 0 {
		lines := strings.Split(raw, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if m := scoutMdLinkRe.FindStringSubmatch(line); len(m) == 3 {
				candidates = append(candidates, scoutCandidate{Title: m[1], URL: m[2]})
			} else {
				candidates = append(candidates, scoutCandidate{Title: line, URL: ""})
			}
		}
	}

	added, skipped, created := saveScoutCandidates(sourceName, candidates)
	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"fetched_count": len(candidates),
			"added_count":   added,
			"skipped_count": skipped,
			"items":         created,
		},
	})
}

// ListTopics 查询选题雷达待寻源列表
func (h *ScoutHandler) ListTopics(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	status := strings.TrimSpace(c.Query("status", "need_source"))
	sourceName := strings.TrimSpace(c.Query("source_name"))
	q := strings.TrimSpace(c.Query("q"))

	base := database.DB.Model(&model.ResourceDraft{}).Where("drive_type = ?", "topic_scout")

	var needSourceCnt, approvedCnt, ignoredCnt int64
	database.DB.Model(&model.ResourceDraft{}).Where("drive_type = ? AND status = ?", "topic_scout", "need_source").Count(&needSourceCnt)
	database.DB.Model(&model.ResourceDraft{}).Where("drive_type = ? AND status = ?", "topic_scout", "approved").Count(&approvedCnt)
	database.DB.Model(&model.ResourceDraft{}).Where("drive_type = ? AND status = ?", "topic_scout", "ignored").Count(&ignoredCnt)

	var sources []string
	database.DB.Model(&model.ResourceDraft{}).Where("drive_type = ?", "topic_scout").Distinct().Pluck("source_name", &sources)

	query := base
	if status != "" && status != "all" {
		query = query.Where("status = ?", status)
	}
	if sourceName != "" && sourceName != "all" {
		query = query.Where("source_name = ?", sourceName)
	}
	if q != "" {
		query = query.Where("title ILIKE ? OR source_name ILIKE ?", "%"+q+"%", "%"+q+"%")
	}

	var total int64
	query.Count(&total)

	var items []model.ResourceDraft
	offset := (page - 1) * pageSize
	query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&items)

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items":             items,
			"total":             total,
			"need_source_count": needSourceCnt,
			"approved_count":    approvedCnt,
			"ignored_count":     ignoredCnt,
			"sources":           sources,
		},
	})
}

// PublishTopic 为待寻源选题补齐网盘链接并一键发布到正式资料库
func (h *ScoutHandler) PublishTopic(c fiber.Ctx) error {
	draftUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效选题ID"})
	}

	var draft model.ResourceDraft
	if err := database.DB.First(&draft, "id = ?", draftUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "选题记录不存在"})
	}

	var req struct {
		Title        string `json:"title"`
		ShareURL     string `json:"share_url"`
		ExtractCode  string `json:"extract_code"`
		DriveType    string `json:"drive_type"`
		CollectionID string `json:"collection_id"`
		ChannelSlug  string `json:"channel_slug"`
		AutoTransfer bool   `json:"auto_transfer"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	shareURL := strings.TrimSpace(req.ShareURL)
	if shareURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请粘贴找到的网盘分享链接"})
	}

	title := cleanScoutTitle(req.Title)
	if title == "" {
		title = draft.Title
	}
	driveType := strings.TrimSpace(req.DriveType)
	if driveType == "" {
		driveType = detectDriveTypeFromURL(shareURL)
	}
	extractCode := strings.TrimSpace(req.ExtractCode)
	fileSize := "完整高清版"

	var usedAccID *uuid.UUID
	var usedAccName string

	if req.AutoTransfer && driveType == "quark" && h.transferSvc != nil {
		var accounts []model.NetdiskAccount
		database.DB.Where("drive_type = ? AND status = ?", "quark", "valid").Order("is_default DESC, created_at ASC").Find(&accounts)
		for _, acc := range accounts {
			fid := acc.TargetFolderFID
			if fid == "" {
				fid = "0"
			}
			if tRes, tErr := h.transferSvc.TransferAndShare(acc.Cookie, fid, shareURL, extractCode); tErr == nil && tRes != nil && tRes.NewShareURL != "" {
				shareURL = tRes.NewShareURL
				if tRes.ExtractCode != "" {
					extractCode = tRes.ExtractCode
				}
				if tRes.FileSize != "" && tRes.FileSize != "完整资源包" {
					fileSize = tRes.FileSize
				}
				usedAccID = &acc.ID
				usedAccName = acc.AccountName
				break
			}
		}
	}

	meta := h.smartMeta.InferMeta(title)
	chSlug := strings.TrimSpace(req.ChannelSlug)
	if chSlug == "" {
		chSlug = "edu"
		if meta.ChannelSlug == "book" {
			chSlug = "book"
		}
	}

	var colID *uuid.UUID
	if cid := strings.TrimSpace(req.CollectionID); cid != "" {
		if parsed, err := uuid.Parse(cid); err == nil {
			colID = &parsed
		}
	}

	resID := uuid.New()
	finalTitle := meta.PolishedTitle
	if finalTitle == "" {
		finalTitle = title
	}

	newRes := model.Resource{
		ID:           resID,
		Slug:         fmt.Sprintf("res-%d-%s", time.Now().UnixNano(), uuid.New().String()[:8]),
		ChannelSlug:  chSlug,
		Title:        finalTitle,
		Subtitle:     meta.Subtitle,
		Description:  meta.Description,
		Stage:        meta.Stage,
		Grade:        meta.Grade,
		Term:         meta.Term,
		Subject:      meta.Subject,
		Edition:      meta.Edition,
		CollectionID: colID,
		FileType:     "PDF",
		FileSize:     fileSize,
		IsPublished:  true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := database.DB.Create(&newRes).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "发布到正式库失败"})
	}

	linkDesc := "夸克官方高速免密通道"
	if driveType == "baidu" {
		linkDesc = "百度网盘备用通道"
	}
	newLink := model.ResourceLink{
		ID:           uuid.New(),
		ResourceID:   resID,
		DriveType:    driveType,
		ShareURL:     shareURL,
		ExtractCode:  extractCode,
		IsPrimary:    true,
		Status:       "active",
		FileSize:     fileSize,
		FileType:     "PDF",
		ResourceDesc: linkDesc,
		AccountID:    usedAccID,
		AccountName:  usedAccName,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	database.DB.Create(&newLink)

	database.DB.Model(&draft).Updates(map[string]interface{}{
		"title":                title,
		"drive_type":           "topic_scout",
		"share_url":            shareURL,
		"extract_code":         extractCode,
		"status":               "approved",
		"approved_resource_id": resID,
	})

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "已成功补链并发布到正式资料库",
		"data":    newRes,
	})
}

// UpdateTopicStatus 更新选题状态（need_source / ignored）
func (h *ScoutHandler) UpdateTopicStatus(c fiber.Ctx) error {
	draftUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效选题ID"})
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数错误"})
	}
	if req.Status != "need_source" && req.Status != "ignored" && req.Status != "approved" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效状态"})
	}
	database.DB.Model(&model.ResourceDraft{}).Where("id = ?", draftUUID).Update("status", req.Status)
	return c.JSON(fiber.Map{"code": 200, "message": "状态已更新"})
}

// DeleteTopic 删除选题记录
func (h *ScoutHandler) DeleteTopic(c fiber.Ctx) error {
	draftUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效选题ID"})
	}
	database.DB.Delete(&model.ResourceDraft{}, "id = ?", draftUUID)
	return c.JSON(fiber.Map{"code": 200, "message": "已删除"})
}
