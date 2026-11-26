package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type ResourceHandler struct {
	parser      *service.NetdiskParserService
	checker     *service.NetdiskCheckerService
	coverGen    *service.CoverGeneratorService
	r2          *service.R2Service
	crawler     *service.TelegramCrawlerService
	seo         *service.SeoService
	transferSvc *service.QuarkTransferService
	smartMeta   *service.SmartMetaService
}

func NewResourceHandler(parser *service.NetdiskParserService, checker *service.NetdiskCheckerService, coverGen *service.CoverGeneratorService, r2 *service.R2Service, crawler *service.TelegramCrawlerService, seo *service.SeoService, transferSvc *service.QuarkTransferService, smartMeta *service.SmartMetaService) *ResourceHandler {
	return &ResourceHandler{
		parser:      parser,
		checker:     checker,
		coverGen:    coverGen,
		r2:          r2,
		crawler:     crawler,
		seo:         seo,
		transferSvc: transferSvc,
		smartMeta:   smartMeta,
	}
}

// NormalizeStage 将可能存在的历史中文名称标准化为唯一的标准英文枚举 (primary, junior, senior, cert, exam)
func NormalizeStage(stage string) string {
	s := strings.TrimSpace(stage)
	switch s {
	case "小学", "小学阶段", "小学专区":
		return "primary"
	case "初中", "初中冲刺", "初中专区":
		return "junior"
	case "高中", "高中专区", "高中高考专项":
		return "senior"
	case "成人考证", "考证", "教师资格证", "教资":
		return "cert"
	case "考公考研", "考公", "考研":
		return "exam"
	default:
		return strings.ToLower(s)
	}
}

// IsKnownStage 判断是否属于标准学段或常见中文学段
func IsKnownStage(val string) bool {
	switch strings.ToLower(strings.TrimSpace(val)) {
	case "primary", "junior", "senior", "cert", "exam", "kindergarten", "classic",
		"小学", "小学阶段", "小学专区",
		"初中", "初中冲刺", "初中专区",
		"高中", "高中专区", "高中高考专项",
		"成人考证", "考证", "教师资格证", "教资",
		"考公考研", "考公", "考研", "幼小衔接",
		"学科经典", "学科经典与拓展", "经典名著", "竞赛名著", "学科经典/竞赛名著":
		return true
	default:
		return false
	}
}

// ExpandGradeAliases 将年级拓展为其等价别名，实现初中（初一/七年级、初二/八年级、初三/九年级）的无缝双向智能兼容
func ExpandGradeAliases(grade string) []string {
	g := strings.TrimSpace(grade)
	if g == "" || g == "all" {
		return nil
	}
	switch {
	case strings.Contains(g, "七年级") || strings.Contains(g, "初一") || g == "grade-7":
		return []string{"七年级", "初一", "初一/七年级"}
	case strings.Contains(g, "八年级") || strings.Contains(g, "初二") || g == "grade-8":
		return []string{"八年级", "初二", "初二/八年级"}
	case strings.Contains(g, "九年级") || strings.Contains(g, "初三") || g == "grade-9":
		return []string{"九年级", "初三", "初三/九年级", "中考"}
	default:
		return []string{g}
	}
}

// CleanEditionName 清理版本字符串中的括号、英文字母及补充说明（如 "人教版 (教育部统编)" -> "人教版"）
func CleanEditionName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "all" {
		return ""
	}
	re := regexp.MustCompile(`[\(（\[【].*?[\)）\]】]`)
	cleaned := re.ReplaceAllString(raw, "")
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		cleaned = raw
	}
	return cleaned
}

// ExpandEditionAliases 针对主流教材版本构建语义互通的别名列表并实现自适应双向兼容
func ExpandEditionAliases(raw string) (string, []string) {
	clean := CleanEditionName(raw)
	if clean == "" {
		return "", nil
	}

	aliasMap := map[string][]string{
		"人教版":   {"人教版", "统编版", "人教", "教育部统编", "人音版", "人美版", "配套人教版"},
		"统编版":   {"统编版", "人教版", "人教", "教育部统编"},
		"北师大版": {"北师大版", "北师大", "北京师范大学版"},
		"苏教版":   {"苏教版", "苏教", "江苏凤凰", "苏少版", "苏科版"},
		"外研版":   {"外研版", "外研社版", "外研社", "外研"},
		"外研社版": {"外研社版", "外研版", "外研社", "外研"},
		"沪教版":   {"沪教版", "沪科版", "上海教育", "沪科技版", "沪音版", "沪书画版", "沪科教版"},
		"鲁教版":   {"鲁教版", "鲁科版", "鲁美版", "山东教育", "配套鲁教版"},
		"冀教版":   {"冀教版", "冀美版", "冀少版", "冀人版", "河北教育"},
		"教科版":   {"教科版", "教育科学", "教科"},
		"粤教版":   {"粤教版", "粤教花城版", "粤教科技版", "广东教育"},
		"湘教版":   {"湘教版", "湘科版", "湘美版", "湘文艺版", "湘少版", "湖南教育"},
		"青岛版":   {"青岛版", "青岛"},
		"译林版":   {"译林版", "译林"},
		"浙教版":   {"浙教版", "浙科版", "浙人美版", "浙江教育"},
	}

	var aliases []string
	for mainName, list := range aliasMap {
		if strings.Contains(clean, mainName) || strings.Contains(mainName, clean) {
			aliases = list
			break
		}
	}

	if len(aliases) == 0 {
		aliases = []string{clean}
	}

	return clean, aliases
}

// ListPublicResources 前台公开资源列表，支持多维条件筛选
func (h *ResourceHandler) ListPublicResources(c fiber.Ctx) error {
	stage := c.Query("stage")       // primary, junior, senior, cert, exam
	grade := c.Query("grade")       // 一年级, 二年级 ...
	subject := c.Query("subject")   // 语文, 数学, 英语
	keyword := c.Query("q")         // 搜索词
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("limit", "12"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 24
	}

	channel := c.Query("channel")

	query := database.DB.Model(&model.Resource{}).
		Where("is_published = ?", true).
		Where("channel_slug IN (SELECT slug FROM channels WHERE is_active = true)").
		Preload("Links").
		Preload("Collection")

	// 频道隔离与全局搜索联动逻辑：
	// 1. 若显式指定了频道 (如 channel=book 或 channel=edu)，严格按指定频道精准筛选
	// 2. 若传入的是学段标识（primary, junior, senior, cert, exam 等），归属于学习资料频道 (channel_slug = 'edu')
	// 3. 若处于全局搜索模式 (keyword != "") 且未指定特定 channel，打通全站活跃频道联合搜索 (同时覆盖学习资料与电子教材)
	// 4. 若为常规浏览模式 (keyword == "" 且未指定 channel)，默认锁定主频道 'edu'，确保首页与学段专区纯粹展示教辅题库与微课，电子教材完全隔离至 /book
	if channel != "" && channel != "all" {
		if IsKnownStage(channel) {
			if stage == "" {
				stage = channel
			}
			query = query.Where("channel_slug = ?", "edu")
		} else {
			query = query.Where("channel_slug = ?", channel)
		}
	} else if keyword == "" {
		// 常规浏览模式：默认锁定学习资料频道 (edu)
		query = query.Where("channel_slug = ?", "edu")
	}
	if stage != "" && stage != "all" {
		stdStage := NormalizeStage(stage)
		query = query.Where("stage = ?", stdStage)
	}
	if grade != "" && grade != "all" {
		aliases := ExpandGradeAliases(grade)
		if len(aliases) == 1 {
			query = query.Where("(grade = ? OR grade ILIKE ?)", aliases[0], "%"+aliases[0]+"%")
		} else {
			query = query.Where("grade IN (?)", aliases)
		}
	}
	if subject != "" && subject != "all" {
		query = query.Where("(subject = ? OR subject ILIKE ?)", subject, "%"+subject+"%")
	}
	edition := c.Query("edition")
	if edition != "" && edition != "all" {
		cleanEd, aliases := ExpandEditionAliases(edition)
		if len(aliases) > 0 {
			var orConds []string
			var orVals []interface{}
			for _, a := range aliases {
				orConds = append(orConds, "edition = ?", "edition ILIKE ?", "title ILIKE ?")
				orVals = append(orVals, a, "%"+a+"%", "%"+a+"%")
			}
			query = query.Where("("+strings.Join(orConds, " OR ")+")", orVals...)
		} else if cleanEd != "" {
			query = query.Where("(edition = ? OR edition ILIKE ? OR title ILIKE ?)", cleanEd, "%"+cleanEd+"%", "%"+cleanEd+"%")
		}
	}
	term := c.Query("term")
	if term != "" && term != "all" {
		query = query.Where("(term = ? OR term ILIKE ?)", term, "%"+term+"%")
	}
	school := c.Query("school")
	if school != "" {
		query = query.Where("school ILIKE ?", "%"+school+"%")
	}
	region := c.Query("region")
	if region != "" {
		query = query.Where("region ILIKE ?", "%"+region+"%")
	}
	if keyword != "" {
		query = query.Where("title ILIKE ? OR subtitle ILIKE ? OR school ILIKE ? OR region ILIKE ?", "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}

	var total int64
	query.Count(&total)

	var items []model.Resource
	offset := (page - 1) * pageSize

	var orderClause string
	sortParam := c.Query("sort")
	switch sortParam {
	case "popular":
		orderClause = "save_count DESC, view_count DESC, created_at DESC"
	case "views":
		orderClause = "view_count DESC, created_at DESC"
	case "latest":
		orderClause = "created_at DESC"
	default:
		orderClause = "is_recommended DESC, created_at DESC"
	}

	if err := query.Order(orderClause).
		Offset(offset).Limit(pageSize).Find(&items).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取资源失败",
		})
	}

	// 记录实际搜索关键词与命中数（排除实时联想 limit=6 的按键中间态）
	if q := strings.TrimSpace(c.Query("q")); q != "" && page == 1 && pageSize >= 10 {
		go func(kw, ip string, count int) {
			database.DB.Create(&model.SearchLog{
				Keyword:     kw,
				ClientIP:    ip,
				ResultCount: count,
			})
		}(q, c.IP(), int(total))
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items":       items,
			"total":       total,
			"page":        page,
			"limit":       pageSize,
			"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
		},
	})
}

// GetPublicResourceDetail 资源详情页（根据 slug 或 id）
func (h *ResourceHandler) GetPublicResourceDetail(c fiber.Ctx) error {
	identifier := c.Params("id_or_slug")

	var res model.Resource
	err := database.DB.Preload("Links").Preload("Collection").
		Where("(slug = ? OR id::text = ?) AND is_published = ?", identifier, identifier, true).
		First(&res).Error

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "资料不存在或已下架",
		})
	}

	// 浏览量自增 +1
	database.DB.Model(&res).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1))

	return c.JSON(fiber.Map{
		"code": 200,
		"data": res,
	})
}

// HandleSmartRedirect 智能专属网盘短链直跳 (防失效·后台换源·302极速直达网盘)
func (h *ResourceHandler) HandleSmartRedirect(c fiber.Ctx) error {
	identifier := strings.TrimSpace(c.Params("id_or_slug"))

	// 动态检测站点基准 URL (支持本地开发 localhost / 局域网 IP / 线上域名，以及环境变量 SITE_BASE_URL)
	siteBase := os.Getenv("SITE_BASE_URL")
	if siteBase == "" {
		if origin := c.Get("Origin"); origin != "" {
			siteBase = origin
		} else if referer := c.Get("Referer"); referer != "" {
			if u, err := url.Parse(referer); err == nil && u.Host != "" {
				siteBase = fmt.Sprintf("%s://%s", u.Scheme, u.Host)
			}
		}
		if siteBase == "" {
			host := c.Hostname()
			if strings.Contains(host, "localhost") || strings.Contains(host, "127.0.0.1") {
				siteBase = fmt.Sprintf("%s://%s", c.Protocol(), host)
			} else {
				siteBase = "https://www.xuebaw.com"
			}
		}
	}
	siteBase = strings.TrimRight(siteBase, "/")

	if identifier == "" {
		return c.Redirect().Status(fiber.StatusFound).To(siteBase)
	}

	var res model.Resource
	err := database.DB.Preload("Links").Preload("Collection").
		Where("(slug = ? OR id::text = ?) AND is_published = ?", identifier, identifier, true).
		First(&res).Error

	if err != nil {
		// 找不到资源时，降级重定向到主页
		return c.Redirect().Status(fiber.StatusFound).To(siteBase)
	}

	// 浏览量自增 +1
	database.DB.Model(&res).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1))

	// 查找优先级最高的主网盘链接，排除已标记失效的链接
	var targetLink *model.ResourceLink
	for i := range res.Links {
		l := &res.Links[i]
		if l.Status != "invalid" && l.ShareURL != "" {
			if l.IsPrimary {
				targetLink = l
				break
			}
			if targetLink == nil {
				targetLink = l
			}
		}
	}

	// 若存在可用网盘链接，转存量自增并 302 重定向到网盘真实地址
	if targetLink != nil && targetLink.ShareURL != "" {
		database.DB.Model(&res).UpdateColumn("save_count", gorm.Expr("save_count + ?", 1))
		database.DB.Model(targetLink).UpdateColumn("save_count", gorm.Expr("save_count + ?", 1))
		return c.Redirect().Status(fiber.StatusFound).To(targetLink.ShareURL)
	}

	// 若暂无可用网盘链接，优雅降级重定向到站内落地页
	return c.Redirect().Status(fiber.StatusFound).To(fmt.Sprintf("%s/resource/%s", siteBase, res.Slug))
}

// GetPublicResourceCover 获取资源动态封面缩略图（优先 302 重定向至 Cloudflare R2，次选本地缓存直出，避免依赖服务器底层 node/chrome）
func (h *ResourceHandler) GetPublicResourceCover(c fiber.Ctx) error {
	identifier := c.Params("id_or_slug")
	identifier = strings.TrimSuffix(identifier, ".png")

	r2Base := os.Getenv("R2_PUBLIC_URL")
	if r2Base == "" {
		r2Base = "https://image.xuebaw.com"
	}
	r2Base = strings.TrimRight(r2Base, "/")

	var res model.Resource
	err := database.DB.Where("(slug = ? OR id::text = ?) AND is_published = ?", identifier, identifier, true).
		First(&res).Error

	if err != nil {
		// 找不到资源时，302 重定向到 R2 上的默认兜底封面
		return c.Redirect().Status(fiber.StatusFound).To(fmt.Sprintf("%s/covers/default.png", r2Base))
	}

	// 1. 若本地磁盘已有生成好的缓存文件，直接返回
	if filePath, err := h.coverGen.GetCachedCoverFilePath(&res); err == nil && filePath != "" {
		c.Set("Content-Type", "image/png")
		c.Set("Cache-Control", "public, max-age=2592000, s-maxage=31536000, immutable")
		return c.SendFile(filePath)
	}

	// 2. 默认重定向到 Cloudflare R2 全球 CDN 节点，极速直出且不占 VPS 算力与带宽
	targetR2URL := fmt.Sprintf("%s/covers/%s.png", r2Base, res.Slug)
	c.Set("Cache-Control", "public, max-age=86400")
	return c.Redirect().Status(fiber.StatusFound).To(targetR2URL)
}

// TrackSaveClick 统计网盘链接转存点击量并返回直达跳转地址
func (h *ResourceHandler) TrackSaveClick(c fiber.Ctx) error {
	linkIDStr := c.Params("link_id")
	linkUUID, err := uuid.Parse(linkIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效链接ID"})
	}

	var link model.ResourceLink
	if err := database.DB.First(&link, "id = ?", linkUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "网盘链接不存在"})
	}

	// 原子累加该网盘独立转存点击数
	database.DB.Model(&link).UpdateColumn("click_count", gorm.Expr("click_count + ?", 1))
	database.DB.Model(&model.Resource{}).Where("id = ?", link.ResourceID).
		UpdateColumn("save_count", gorm.Expr("save_count + ?", 1))

	var updatedLink model.ResourceLink
	database.DB.First(&updatedLink, "id = ?", linkUUID)

	var res model.Resource
	database.DB.Select("id, slug, save_count, view_count").First(&res, "id = ?", link.ResourceID)

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"link_id":       link.ID,
			"click_count":   updatedLink.ClickCount,
			"resource_save": res.SaveCount,
			"share_url":     link.ShareURL,
			"extract_code":  link.ExtractCode,
			"password_hint": link.PasswordHint,
			"drive_type":    link.DriveType,
			"file_size":     link.FileSize,
			"file_type":     link.FileType,
			"resource_desc": link.ResourceDesc,
		},
	})
}

// TrackResourceSave 统计资料或指定网盘链接被转存的点击并原子累加
func (h *ResourceHandler) TrackResourceSave(c fiber.Ctx) error {
	identifier := c.Params("id_or_slug")
	linkIDStr := strings.TrimSpace(c.Query("link_id"))
	if linkIDStr == "" {
		var body struct {
			LinkID string `json:"link_id"`
		}
		if err := c.Bind().Body(&body); err == nil {
			linkIDStr = strings.TrimSpace(body.LinkID)
		}
	}

	var res model.Resource
	if err := database.DB.First(&res, "slug = ? OR id::text = ?", identifier, identifier).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "资源未找到"})
	}

	// 全局总转存 +1
	database.DB.Model(&res).UpdateColumn("save_count", gorm.Expr("save_count + ?", 1))

	var linkCount int = 0
	// 如果指定了具体网盘 link_id，该网盘单独 +1
	if linkIDStr != "" {
		if linkUUID, err := uuid.Parse(linkIDStr); err == nil {
			database.DB.Model(&model.ResourceLink{}).Where("id = ?", linkUUID).
				UpdateColumn("click_count", gorm.Expr("click_count + ?", 1))
			var link model.ResourceLink
			database.DB.First(&link, "id = ?", linkUUID)
			linkCount = link.ClickCount
		}
	}

	database.DB.Select("id, slug, save_count, view_count").First(&res, "id = ?", res.ID)

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"save_count": res.SaveCount,
			"view_count": res.ViewCount,
			"link_click": linkCount,
		},
	})
}

// GetPublicRelatedResources 获取同名校/同科目/同学段精选关联真题与教材 (最多 8 条，支持「以书带卷、以卷带书」双向互补)
func (h *ResourceHandler) GetPublicRelatedResources(c fiber.Ctx) error {
	identifier := c.Params("id_or_slug")

	var currentRes model.Resource
	err := database.DB.Select("id, slug, stage, subject, grade, term, edition, school, region, channel_slug").
		Where("(slug = ? OR id::text = ?) AND is_published = ?", identifier, identifier, true).
		First(&currentRes).Error

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "资源不存在",
		})
	}

	var related []model.Resource
	collectedIDs := []uuid.UUID{currentRes.ID}
	targetCount := 8

	// 1. 课本专属深度推荐：同年级同分册全科配套教材 (看一本带全套)
	if currentRes.ChannelSlug == "book" && currentRes.Grade != "" {
		var sameGradeBooks []model.Resource
		termCond := ""
		var termVals []interface{}
		if currentRes.Term != "" {
			termCond = " AND (term = ? OR term ILIKE ? OR term = '')"
			termVals = append(termVals, currentRes.Term, "%"+currentRes.Term+"%")
		}
		dbQuery := database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND channel_slug = ? AND grade = ? AND id NOT IN ?"+termCond,
				append([]interface{}{true, "book", currentRes.Grade, collectedIDs}, termVals...)...)

		if currentRes.Term != "" {
			dbQuery = dbQuery.Order("CASE WHEN term = '" + currentRes.Term + "' THEN 0 ELSE 1 END, is_recommended DESC, save_count DESC, created_at DESC")
		} else {
			dbQuery = dbQuery.Order("is_recommended DESC, save_count DESC, created_at DESC")
		}

		dbQuery.Limit(4).Find(&sameGradeBooks)
		for _, item := range sameGradeBooks {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 2. 核心推荐：以书带卷、以卷带书（跨频道互补）
	complementChannel := "edu"
	if currentRes.ChannelSlug == "edu" {
		complementChannel = "book"
	}
	if currentRes.Grade != "" && currentRes.Subject != "" && len(related) < targetCount {
		var complementItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND channel_slug = ? AND grade = ? AND (subject = ? OR subject ILIKE ?) AND id NOT IN ?",
				true, complementChannel, currentRes.Grade, currentRes.Subject, "%"+currentRes.Subject+"%", collectedIDs).
			Order("is_recommended DESC, save_count DESC, created_at DESC").
			Limit(3).
			Find(&complementItems)

		for _, item := range complementItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 2. 同年级 + 同科目 + 同学段的同类精品推荐 (排除已收集)
	if len(related) < targetCount && currentRes.Grade != "" && currentRes.Subject != "" && currentRes.Stage != "" {
		needed := targetCount - len(related)
		var sameGradeItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND stage = ? AND grade = ? AND subject = ? AND id NOT IN ?",
				true, currentRes.Stage, currentRes.Grade, currentRes.Subject, collectedIDs).
			Order("is_recommended DESC, save_count DESC, view_count DESC, created_at DESC").
			Limit(needed).
			Find(&sameGradeItems)

		for _, item := range sameGradeItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 3. 若有名校字段且仍未填满，补充同一名校资料 (排除自身及已收集)
	if len(related) < targetCount && strings.TrimSpace(currentRes.School) != "" {
		needed := targetCount - len(related)
		var schoolItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND school = ? AND id NOT IN ?", true, currentRes.School, collectedIDs).
			Order("save_count DESC, created_at DESC").
			Limit(needed).
			Find(&schoolItems)

		for _, item := range schoolItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 4. 若数量不足 8 条，同科目 + 同学段补充 (排除已收集)
	if len(related) < targetCount && currentRes.Subject != "" && currentRes.Stage != "" {
		needed := targetCount - len(related)
		var subjectItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND stage = ? AND subject = ? AND id NOT IN ?", true, currentRes.Stage, currentRes.Subject, collectedIDs).
			Order("is_recommended DESC, save_count DESC, view_count DESC, created_at DESC").
			Limit(needed).
			Find(&subjectItems)

		for _, item := range subjectItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 5. 若仍不足 8 条，同学段最新推荐资料兜底补充 (排除已收集)
	if len(related) < targetCount && currentRes.Stage != "" {
		needed := targetCount - len(related)
		var stageItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND stage = ? AND id NOT IN ?", true, currentRes.Stage, collectedIDs).
			Order("is_recommended DESC, save_count DESC, created_at DESC").
			Limit(needed).
			Find(&stageItems)

		for _, item := range stageItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": related,
	})
}

// fetchAndUploadRemoteImage 从外部网络抓取图片并转存上传至 Cloudflare R2
func (h *ResourceHandler) fetchAndUploadRemoteImage(slug string, remoteURL string) string {
	if h.r2 == nil || !h.r2.IsConfigured() || remoteURL == "" {
		return remoteURL
	}
	// 避免对已经是 R2 域名的链接重复转存
	if strings.Contains(remoteURL, h.r2.GetPublicURL("")) {
		return remoteURL
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", remoteURL, nil)
	if err != nil {
		log.Printf("[CoverTransfer] NewRequest failed for %s: %v", remoteURL, err)
		return remoteURL
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", remoteURL)

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		log.Printf("[CoverTransfer] HTTP fetch failed for %s: %v", remoteURL, err)
		return remoteURL
	}
	defer resp.Body.Close()

	// 限制下载最大 10MB
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil || len(data) == 0 {
		log.Printf("[CoverTransfer] Read body empty or error for %s: %v", remoteURL, err)
		return remoteURL
	}

	contentType := resp.Header.Get("Content-Type")
	ext := ".png"
	if strings.Contains(contentType, "jpeg") || strings.Contains(contentType, "jpg") {
		contentType = "image/jpeg"
		ext = ".jpg"
	} else if strings.Contains(contentType, "webp") {
		contentType = "image/webp"
		ext = ".webp"
	} else {
		contentType = "image/png"
	}

	r2Key := fmt.Sprintf("covers/%s-%d%s", slug, time.Now().Unix(), ext)
	r2URL, err := h.r2.UploadObject(r2Key, data, contentType)
	if err != nil {
		log.Printf("[CoverTransfer] R2 UploadObject error for %s: %v", slug, err)
		return remoteURL
	}
	log.Printf("[CoverTransfer] Successfully transferred remote cover to R2: %s -> %s", remoteURL, r2URL)
	return r2URL
}

func (h *ResourceHandler) processCoverImage(slug string, coverImage string) string {
	if coverImage == "" {
		return ""
	}
	// 如果是 base64 格式图片，自动解码并直传至 Cloudflare R2
	if strings.HasPrefix(coverImage, "data:image/") {
		parts := strings.SplitN(coverImage, ",", 2)
		if len(parts) == 2 {
			decoded, err := base64.StdEncoding.DecodeString(parts[1])
			if err != nil {
				log.Printf("[CoverUpload] Base64 decode failed for %s: %v", slug, err)
				return ""
			}
			if len(decoded) > 0 && h.r2 != nil && h.r2.IsConfigured() {
				r2Key := fmt.Sprintf("covers/%s-%d.png", slug, time.Now().Unix())
				r2URL, err := h.r2.UploadObject(r2Key, decoded, "image/png")
				if err != nil {
					log.Printf("[CoverUpload] R2 upload error for %s: %v", slug, err)
					return ""
				}
				log.Printf("[CoverUpload] Successfully uploaded cover for %s to R2: %s", slug, r2URL)
				return r2URL
			}
		}
		// base64 绝对不可直接存入数据库 varchar(500)
		return ""
	}
	if len(coverImage) > 500 {
		log.Printf("[CoverUpload] Cover image URL too long (%d chars), skipping", len(coverImage))
		return ""
	}
	return coverImage
}

func (h *ResourceHandler) processPosterImage(slug string, posterImage string) string {
	if posterImage == "" {
		return ""
	}
	// 如果是 base64 格式宣传海报，自动解码并直传至 Cloudflare R2
	if strings.HasPrefix(posterImage, "data:image/") {
		parts := strings.SplitN(posterImage, ",", 2)
		if len(parts) == 2 {
			decoded, err := base64.StdEncoding.DecodeString(parts[1])
			if err != nil {
				log.Printf("[PosterUpload] Base64 decode failed for %s: %v", slug, err)
				return ""
			}
			if len(decoded) > 0 && h.r2 != nil && h.r2.IsConfigured() {
				r2Key := fmt.Sprintf("posters/%s-%d.png", slug, time.Now().Unix())
				r2URL, err := h.r2.UploadObject(r2Key, decoded, "image/png")
				if err != nil {
					log.Printf("[PosterUpload] R2 upload error for %s: %v", slug, err)
					return ""
				}
				log.Printf("[PosterUpload] Successfully uploaded poster for %s to R2: %s", slug, r2URL)
				return r2URL
			}
		}
		return ""
	}
	if len(posterImage) > 500 {
		log.Printf("[PosterUpload] Poster image URL too long (%d chars), skipping", len(posterImage))
		return ""
	}
	return posterImage
}

// AdminCreateResource 后台创建资源
func (h *ResourceHandler) AdminCreateResource(c fiber.Ctx) error {
	var res model.Resource
	if err := c.Bind().JSON(&res); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if res.Slug == "" {
		res.Slug = fmt.Sprintf("res-%d", time.Now().UnixNano())
	}
	if res.ChannelSlug == "" {
		res.ChannelSlug = "edu"
	}
	if res.Stage != "" {
		res.Stage = NormalizeStage(res.Stage)
	}

	// 自动将 base64 封面直传至 Cloudflare R2 并替换为公网 CDN URL
	if res.CoverImage != "" {
		res.CoverImage = h.processCoverImage(res.Slug, res.CoverImage)
	}
	if res.PosterImage != "" {
		res.PosterImage = h.processPosterImage(res.Slug, res.PosterImage)
	}

	// 自动关联/补齐网盘账号归属信息 (若未显式指定，默认自动归属为默认网盘账号)
	var defaultAcc model.NetdiskAccount
	database.DB.Where("is_default = true AND status = 'valid'").First(&defaultAcc)
	for i := range res.Links {
		if res.Links[i].AccountID != nil && *res.Links[i].AccountID != uuid.Nil {
			var acc model.NetdiskAccount
			if err := database.DB.Select("account_name").First(&acc, "id = ?", *res.Links[i].AccountID).Error; err == nil {
				res.Links[i].AccountName = acc.AccountName
			}
		} else if defaultAcc.ID != uuid.Nil && res.Links[i].DriveType == defaultAcc.DriveType {
			res.Links[i].AccountID = &defaultAcc.ID
			res.Links[i].AccountName = defaultAcc.AccountName
		}
	}

	if err := database.DB.Create(&res).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "创建失败: " + err.Error()})
	}

	if res.Region != "" && res.School != "" {
		go EnsureRegionAndSchool(database.DB, res.Region, res.School, res.Stage)
	}

	if res.IsPublished && h.crawler != nil {
		go func(createdRes model.Resource) {
			var cfg model.TelegramConfig
			if err := database.DB.First(&cfg).Error; err == nil && cfg.AutoBroadcast {
				database.DB.Preload("Links").First(&createdRes, "id = ?", createdRes.ID)
				if err := h.crawler.BroadcastResource(&createdRes, ""); err != nil {
					log.Printf("[AutoBroadcast] Telegram 自动广播失败: %v", err)
				} else {
					log.Printf("[AutoBroadcast] 资源「%s」已自动广播至 Telegram", createdRes.Title)
				}
			}
		}(res)
	}

	// 百度 / 必应 搜索引擎自动化秒级收录推送
	if res.IsPublished && h.seo != nil {
		go func(createdRes model.Resource) {
			var seoCfg model.SeoConfig
			if err := database.DB.Where("id = ?", "global").First(&seoCfg).Error; err == nil && seoCfg.AutoPushOnPublish {
				if summary, pushErr := h.seo.BatchPush("all", []uuid.UUID{createdRes.ID}, nil); pushErr != nil {
					log.Printf("[AutoSeoPush] 百度/必应自动收录推送异常: %v", pushErr)
				} else {
					log.Printf("[AutoSeoPush] 资源「%s」已全自动向百度/必应推送收录: %s", createdRes.Title, summary.SummaryMessage)
				}
			}
		}(res)
	}

	// Cloudflare 边缘节点缓存自动化主动刷新 (Purge Cache)
	if h.seo != nil {
		h.seo.PurgeForResource(&res)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "创建成功",
		"data":    res,
	})
}

// AdminListResources 后台所有资源列表（支持按频道、学段、年级、分册学期、学科、教材版本、名校、搜索词和状态过滤，并实现完整服务端真分页）
func (h *ResourceHandler) AdminListResources(c fiber.Ctx) error {
	channel := c.Query("channel")
	stage := c.Query("stage")
	grade := strings.TrimSpace(c.Query("grade"))
	term := strings.TrimSpace(c.Query("term"))
	subject := strings.TrimSpace(c.Query("subject"))
	edition := strings.TrimSpace(c.Query("edition"))
	school := strings.TrimSpace(c.Query("school"))
	keyword := strings.TrimSpace(c.Query("q"))
	statusFilter := c.Query("filter") // all | invalid | reported
	accountID := strings.TrimSpace(c.Query("account_id"))

	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 10000 {
		pageSize = 10000
	}

	query := database.DB.Model(&model.Resource{})
	if channel != "" && channel != "all" {
		query = query.Where("channel_slug = ?", channel)
	}
	if stage != "" && stage != "all" {
		query = query.Where("stage = ?", NormalizeStage(stage))
	}
	if grade != "" && grade != "all" {
		aliases := ExpandGradeAliases(grade)
		if len(aliases) == 1 {
			query = query.Where("(grade = ? OR grade ILIKE ?)", aliases[0], "%"+aliases[0]+"%")
		} else {
			query = query.Where("grade IN (?)", aliases)
		}
	}
	if term != "" && term != "all" {
		query = query.Where("(term = ? OR term ILIKE ?)", term, "%"+term+"%")
	}
	if subject != "" && subject != "all" {
		query = query.Where("(subject = ? OR subject ILIKE ?)", subject, "%"+subject+"%")
	}
	if edition != "" && edition != "all" {
		cleanEd, aliases := ExpandEditionAliases(edition)
		if len(aliases) > 0 {
			var orConds []string
			var orVals []interface{}
			for _, a := range aliases {
				orConds = append(orConds, "edition = ?", "edition ILIKE ?", "title ILIKE ?")
				orVals = append(orVals, a, "%"+a+"%", "%"+a+"%")
			}
			query = query.Where("("+strings.Join(orConds, " OR ")+")", orVals...)
		} else if cleanEd != "" {
			query = query.Where("(edition = ? OR edition ILIKE ? OR title ILIKE ?)", cleanEd, "%"+cleanEd+"%", "%"+cleanEd+"%")
		}
	}
	if school != "" && school != "all" {
		query = query.Where("(school = ? OR school ILIKE ?)", school, "%"+school+"%")
	}
	if keyword != "" {
		likePattern := "%" + keyword + "%"
		query = query.Where("(title ILIKE ? OR subject ILIKE ? OR grade ILIKE ? OR school ILIKE ? OR region ILIKE ?)",
			likePattern, likePattern, likePattern, likePattern, likePattern)
	}
	if statusFilter == "invalid" {
		query = query.Where("EXISTS (SELECT 1 FROM resource_links WHERE resource_links.resource_id = resources.id AND resource_links.status = 'invalid')")
	} else if statusFilter == "reported" {
		query = query.Where("EXISTS (SELECT 1 FROM resource_links WHERE resource_links.resource_id = resources.id AND resource_links.status = 'reported')")
	} else if statusFilter == "dead_or_reported" {
		query = query.Where("EXISTS (SELECT 1 FROM resource_links WHERE resource_links.resource_id = resources.id AND (resource_links.status = 'invalid' OR resource_links.status = 'reported'))")
	}
	if accountID != "" && accountID != "all" {
		query = query.Where("EXISTS (SELECT 1 FROM resource_links WHERE resource_links.resource_id = resources.id AND resource_links.account_id::text = ?)", accountID)
	}

	var total int64
	query.Count(&total)

	var list []model.Resource
	offset := (page - 1) * pageSize
	query.Preload("Links").Preload("Collection").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&list)

	// 统计各频道的总数（Single Source of Truth，供后台顶部频道 Tab 展示真实数量）
	var channelStats []struct {
		ChannelSlug string `json:"channel_slug"`
		Count       int64  `json:"count"`
	}
	database.DB.Model(&model.Resource{}).
		Select("COALESCE(NULLIF(channel_slug, ''), 'edu') as channel_slug, count(*) as count").
		Group("COALESCE(NULLIF(channel_slug, ''), 'edu')").
		Scan(&channelStats)

	channelCounts := fiber.Map{
		"all":  int64(0),
		"edu":  int64(0),
		"book": int64(0),
	}
	var totalAll int64 = 0
	for _, stat := range channelStats {
		channelCounts[stat.ChannelSlug] = stat.Count
		totalAll += stat.Count
	}
	channelCounts["all"] = totalAll

	// 统计各学段总数（基于当前选中的频道，若全部则基于全局）
	stageCountQuery := database.DB.Model(&model.Resource{})
	if channel != "" && channel != "all" {
		stageCountQuery = stageCountQuery.Where("channel_slug = ?", channel)
	}
	var stageStats []struct {
		Stage string `json:"stage"`
		Count int64  `json:"count"`
	}
	stageCountQuery.Select("stage, count(*) as count").Group("stage").Scan(&stageStats)
	stageCounts := fiber.Map{
		"all":     int64(0),
		"primary": int64(0),
		"junior":  int64(0),
		"senior":  int64(0),
		"cert":    int64(0),
		"exam":    int64(0),
	}
	var stageChannelTotal int64 = 0
	for _, s := range stageStats {
		stageCounts[s.Stage] = s.Count
		stageChannelTotal += s.Count
	}
	stageCounts["all"] = stageChannelTotal

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))
	if totalPages < 1 {
		totalPages = 1
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items":          list,
			"total":          total,
			"page":           page,
			"limit":          pageSize,
			"total_pages":    totalPages,
			"channel_counts": channelCounts,
			"stage_counts":   stageCounts,
		},
	})
}

// AdminUpdateResource 后台更新资源
func (h *ResourceHandler) AdminUpdateResource(c fiber.Ctx) error {
	idStr := c.Params("id")
	resUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效资源ID"})
	}

	var existing model.Resource
	if err := database.DB.Preload("Links").First(&existing, "id = ?", resUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "资源不存在"})
	}

	var req model.Resource
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	// 更新主要基础字段
	if req.ChannelSlug != "" {
		existing.ChannelSlug = req.ChannelSlug
	}
	existing.Title = req.Title
	existing.Subtitle = req.Subtitle
	existing.Description = req.Description
	existing.Stage = NormalizeStage(req.Stage)
	existing.Grade = req.Grade
	existing.Term = req.Term
	existing.Subject = req.Subject
	existing.Edition = req.Edition
	existing.Region = req.Region
	existing.School = req.School
	existing.CollectionID = req.CollectionID
	existing.FileType = req.FileType
	existing.FileSize = req.FileSize
	existing.PageCount = req.PageCount
	if req.CoverImage != "" {
		existing.CoverImage = h.processCoverImage(existing.Slug, req.CoverImage)
	} else {
		existing.CoverImage = ""
	}
	if req.PosterImage != "" {
		existing.PosterImage = h.processPosterImage(existing.Slug, req.PosterImage)
	}
	existing.IsRecommended = req.IsRecommended
	existing.IsPublished = req.IsPublished
	if req.FileTree != nil {
		existing.FileTree = req.FileTree
	}

	// 如果包含链接更新，保留原有网盘累计转存数
	if len(req.Links) > 0 {
		oldClickCounts := make(map[string]int)
		for _, oldL := range existing.Links {
			oldClickCounts[oldL.DriveType] = oldL.ClickCount
		}

		// 如果包含链接更新，保留原有网盘累计转存数并智能关联网盘账号
		var defaultAcc model.NetdiskAccount
		database.DB.Where("is_default = true AND status = 'valid'").First(&defaultAcc)

		database.DB.Where("resource_id = ?", existing.ID).Delete(&model.ResourceLink{})
		for i := range req.Links {
			req.Links[i].ResourceID = existing.ID
			req.Links[i].ID = uuid.New()
			if req.Links[i].ClickCount == 0 {
				if prev, ok := oldClickCounts[req.Links[i].DriveType]; ok {
					req.Links[i].ClickCount = prev
				}
			}
			if req.Links[i].AccountID != nil && *req.Links[i].AccountID != uuid.Nil {
				var acc model.NetdiskAccount
				if err := database.DB.Select("account_name").First(&acc, "id = ?", *req.Links[i].AccountID).Error; err == nil {
					req.Links[i].AccountName = acc.AccountName
				}
			} else if defaultAcc.ID != uuid.Nil && req.Links[i].DriveType == defaultAcc.DriveType {
				req.Links[i].AccountID = &defaultAcc.ID
				req.Links[i].AccountName = defaultAcc.AccountName
			}
			if req.Links[i].FileSize == "" {
				req.Links[i].FileSize = "15.0 MB"
			}
			if req.Links[i].FileType == "" {
				req.Links[i].FileType = "PDF"
			}
		}
		existing.Links = req.Links
	}

	if req.ViewCount >= 0 {
		existing.ViewCount = req.ViewCount
	}
	if req.SaveCount >= 0 {
		existing.SaveCount = req.SaveCount
	}

	if err := database.DB.Save(&existing).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新失败: " + err.Error()})
	}

	if existing.Region != "" && existing.School != "" {
		go EnsureRegionAndSchool(database.DB, existing.Region, existing.School, existing.Stage)
	}

	// Cloudflare 边缘节点缓存自动化主动刷新
	if h.seo != nil {
		h.seo.PurgeForResource(&existing)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "更新成功",
		"data":    existing,
	})
}

// QuickUpdateLinksRequest 快速补链请求体
type QuickUpdateLinksRequest struct {
	Links []model.ResourceLink `json:"links"`
}

// AdminQuickUpdateLinks 后台快速补链/换链微服务（原子级只替换链接、恢复健康状态并清除报错投诉）
func (h *ResourceHandler) AdminQuickUpdateLinks(c fiber.Ctx) error {
	idStr := c.Params("id")
	resUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效资源ID"})
	}

	var existing model.Resource
	if err := database.DB.Preload("Links").First(&existing, "id = ?", resUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "资源不存在"})
	}

	var req QuickUpdateLinksRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if len(req.Links) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "至少需要保留一个有效的网盘分享链接"})
	}

	// 保留旧链接的原有点击转存数
	oldClickCounts := make(map[string]int)
	for _, oldL := range existing.Links {
		oldClickCounts[oldL.DriveType] = oldL.ClickCount
	}

	var defaultAcc model.NetdiskAccount
	database.DB.Where("is_default = true AND status = 'valid'").First(&defaultAcc)

	// 删除旧链接并插入新链接
	database.DB.Where("resource_id = ?", existing.ID).Delete(&model.ResourceLink{})

	hasPrimary := false
	for i := range req.Links {
		req.Links[i].ResourceID = existing.ID
		req.Links[i].ID = uuid.New()
		// 补链后默认自动恢复为 active 健康状态，清空报错原因
		if req.Links[i].Status == "" || req.Links[i].Status == "reported" || req.Links[i].Status == "invalid" {
			req.Links[i].Status = "active"
		}
		req.Links[i].InvalidReason = ""

		if req.Links[i].ClickCount == 0 {
			if prev, ok := oldClickCounts[req.Links[i].DriveType]; ok {
				req.Links[i].ClickCount = prev
			}
		}
		if req.Links[i].AccountID != nil && *req.Links[i].AccountID != uuid.Nil {
			var acc model.NetdiskAccount
			if err := database.DB.Select("account_name").First(&acc, "id = ?", *req.Links[i].AccountID).Error; err == nil {
				req.Links[i].AccountName = acc.AccountName
			}
		} else if defaultAcc.ID != uuid.Nil && req.Links[i].DriveType == defaultAcc.DriveType {
			req.Links[i].AccountID = &defaultAcc.ID
			req.Links[i].AccountName = defaultAcc.AccountName
		}
		if req.Links[i].FileSize == "" {
			req.Links[i].FileSize = "15.0 MB"
		}
		if req.Links[i].FileType == "" {
			req.Links[i].FileType = "PDF"
		}
		if req.Links[i].IsPrimary {
			hasPrimary = true
		}
	}
	if !hasPrimary && len(req.Links) > 0 {
		req.Links[0].IsPrimary = true
	}

	if err := database.DB.Create(&req.Links).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "保存新网盘链接失败: " + err.Error()})
	}

	// 重新拉取完整资源以供返回
	database.DB.Preload("Links").First(&existing, "id = ?", resUUID)

	// Cloudflare 边缘缓存刷新
	if h.seo != nil {
		h.seo.PurgeForResource(&existing)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "网盘链接已成功补齐/替换，已恢复为正常健康状态！",
		"data":    existing,
	})
}

// AdminUpdateResourceStats 快速更新资源的浏览量和转存量（支持列表行内直接修改）
func (h *ResourceHandler) AdminUpdateResourceStats(c fiber.Ctx) error {
	idStr := c.Params("id")
	resUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效资源ID"})
	}

	var req struct {
		ViewCount *int `json:"view_count"`
		SaveCount *int `json:"save_count"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	updates := map[string]interface{}{}
	if req.ViewCount != nil {
		updates["view_count"] = *req.ViewCount
	}
	if req.SaveCount != nil {
		updates["save_count"] = *req.SaveCount
	}
	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "未提供更新字段"})
	}

	if err := database.DB.Model(&model.Resource{}).Where("id = ?", resUUID).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "更新成功",
		"data":    updates,
	})
}

// AdminUploadCover 后台直接上传或转存封面至 Cloudflare R2
func (h *ResourceHandler) AdminUploadCover(c fiber.Ctx) error {
	type UploadReq struct {
		Slug      string `json:"slug"`
		ImageData string `json:"image_data"`
	}

	var req UploadReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请求格式错误"})
	}

	if req.ImageData == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "图片数据为空"})
	}

	if req.Slug == "" {
		req.Slug = fmt.Sprintf("cover-%d", time.Now().UnixNano())
	}

	var r2URL string
	if strings.HasPrefix(req.ImageData, "http://") || strings.HasPrefix(req.ImageData, "https://") {
		r2URL = h.fetchAndUploadRemoteImage(req.Slug, req.ImageData)
	} else {
		r2URL = h.processCoverImage(req.Slug, req.ImageData)
	}

	if r2URL == "" || ((strings.HasPrefix(req.ImageData, "http://") || strings.HasPrefix(req.ImageData, "https://")) && r2URL == req.ImageData && !strings.Contains(r2URL, h.r2.GetPublicURL(""))) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "封面转存失败，请确认外部图片链接有效且可公开访问",
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"url":  r2URL,
			"slug": req.Slug,
		},
	})
}

// AdminUploadPoster 后台直接上传或保存宣传海报至 Cloudflare R2
func (h *ResourceHandler) AdminUploadPoster(c fiber.Ctx) error {
	type UploadReq struct {
		ResourceID string `json:"resource_id"`
		Slug       string `json:"slug"`
		ImageData  string `json:"image_data"`
	}

	var req UploadReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请求格式错误"})
	}

	if req.ImageData == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "图片数据为空"})
	}

	if req.Slug == "" {
		req.Slug = fmt.Sprintf("poster-%d", time.Now().UnixNano())
	}

	r2URL := h.processPosterImage(req.Slug, req.ImageData)
	if r2URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "宣传海报转存至 Cloudflare R2 失败",
		})
	}

	// 若提供了 resource_id，直接同步持久化到数据库对应资源的 poster_image 字段
	if req.ResourceID != "" {
		if resUUID, err := uuid.Parse(req.ResourceID); err == nil {
			database.DB.Model(&model.Resource{}).Where("id = ?", resUUID).Update("poster_image", r2URL)
		}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"url":  r2URL,
			"slug": req.Slug,
		},
	})
}

// AdminDeleteResource 后台删除资源
func (h *ResourceHandler) AdminDeleteResource(c fiber.Ctx) error {
	idStr := c.Params("id")
	resUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效资源ID"})
	}

	// 记录待删除资源信息以通知 Cloudflare 刷新缓存
	var delRes model.Resource
	if err := database.DB.First(&delRes, "id = ?", resUUID).Error; err == nil && h.seo != nil {
		h.seo.PurgeForResource(&delRes)
	}

	// 级联删除关联的链接
	database.DB.Where("resource_id = ?", resUUID).Delete(&model.ResourceLink{})
	if err := database.DB.Delete(&model.Resource{}, "id = ?", resUUID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "删除失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "删除成功",
	})
}

// AdminTogglePublish 快速切换上下架状态
func (h *ResourceHandler) AdminTogglePublish(c fiber.Ctx) error {
	idStr := c.Params("id")
	resUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效资源ID"})
	}

	var res model.Resource
	if err := database.DB.First(&res, "id = ?", resUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "资源不存在"})
	}

	res.IsPublished = !res.IsPublished
	database.DB.Save(&res)

	// 如果切换为上架状态，自动向百度与必应推送索引
	if res.IsPublished && h.seo != nil {
		go func(pushedRes model.Resource) {
			var seoCfg model.SeoConfig
			if err := database.DB.Where("id = ?", "global").First(&seoCfg).Error; err == nil && seoCfg.AutoPushOnPublish {
				h.seo.BatchPush("all", []uuid.UUID{pushedRes.ID}, nil)
			}
		}(res)
	}

	// Cloudflare 边缘节点缓存自动化主动刷新
	if h.seo != nil {
		h.seo.PurgeForResource(&res)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "状态已更新",
		"data": fiber.Map{
			"id":           res.ID,
			"is_published": res.IsPublished,
		},
	})
}

// AdminBatchTogglePublish 后台批量上架/下架资料
func (h *ResourceHandler) AdminBatchTogglePublish(c fiber.Ctx) error {
	type Request struct {
		IDs         []string `json:"ids"`
		IsPublished bool     `json:"is_published"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供有效的资料ID列表",
		})
	}

	var parsedIDs []uuid.UUID
	for _, idStr := range req.IDs {
		if id, err := uuid.Parse(idStr); err == nil {
			parsedIDs = append(parsedIDs, id)
		}
	}

	if len(parsedIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "未找到有效的资料ID",
		})
	}

	if err := database.DB.Model(&model.Resource{}).Where("id IN (?)", parsedIDs).Update("is_published", req.IsPublished).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "批量切换状态失败: " + err.Error(),
		})
	}

	// 如果批量上架，自动异步向搜索引擎批量推送
	if req.IsPublished && h.seo != nil && len(parsedIDs) > 0 {
		go func(ids []uuid.UUID) {
			var seoCfg model.SeoConfig
			if err := database.DB.Where("id = ?", "global").First(&seoCfg).Error; err == nil && seoCfg.AutoPushOnPublish {
				h.seo.BatchPush("all", ids, nil)
			}
		}(parsedIDs)
	}

	// Cloudflare 边缘节点缓存自动化主动批量刷新
	if h.seo != nil && len(parsedIDs) > 0 {
		var affectedResources []model.Resource
		database.DB.Where("id IN (?)", parsedIDs).Find(&affectedResources)
		h.seo.PurgeForResources(affectedResources)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "批量切换状态成功",
		"data": fiber.Map{
			"affected": len(parsedIDs),
		},
	})
}

// AdminBatchDeleteResources 后台批量删除资料
func (h *ResourceHandler) AdminBatchDeleteResources(c fiber.Ctx) error {
	type Request struct {
		IDs []string `json:"ids"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供需要删除的资料ID列表",
		})
	}

	var parsedIDs []uuid.UUID
	for _, idStr := range req.IDs {
		if id, err := uuid.Parse(idStr); err == nil {
			parsedIDs = append(parsedIDs, id)
		}
	}

	if len(parsedIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "未找到有效的资料ID",
		})
	}

	if h.seo != nil && len(parsedIDs) > 0 {
		var toDelete []model.Resource
		database.DB.Where("id IN (?)", parsedIDs).Find(&toDelete)
		h.seo.PurgeForResources(toDelete)
	}

	// 1. 级联删除关联的链接
	database.DB.Where("resource_id IN (?)", parsedIDs).Delete(&model.ResourceLink{})
	// 2. 批量物理删除资料
	if err := database.DB.Where("id IN (?)", parsedIDs).Delete(&model.Resource{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "批量删除失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "批量删除成功",
		"data": fiber.Map{
			"deleted_count": len(parsedIDs),
		},
	})
}

// AdminBatchAssignAccount 批量设置资料的网盘归属账号
func (h *ResourceHandler) AdminBatchAssignAccount(c fiber.Ctx) error {
	type Request struct {
		IDs       []string `json:"ids"`
		AccountID string   `json:"account_id"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供有效的资料ID列表",
		})
	}

	var parsedIDs []uuid.UUID
	for _, idStr := range req.IDs {
		if id, err := uuid.Parse(idStr); err == nil {
			parsedIDs = append(parsedIDs, id)
		}
	}
	if len(parsedIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "未找到有效资料ID"})
	}

	var targetAccount model.NetdiskAccount
	var targetAccID *uuid.UUID
	var targetAccName string

	if req.AccountID != "" && req.AccountID != "none" {
		accUUID, err := uuid.Parse(req.AccountID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效网盘账号ID"})
		}
		if err := database.DB.First(&targetAccount, "id = ?", accUUID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "未找到指定网盘账号"})
		}
		targetAccID = &targetAccount.ID
		targetAccName = targetAccount.AccountName
	}

	updates := map[string]interface{}{
		"account_name": targetAccName,
	}
	if targetAccID != nil {
		updates["account_id"] = targetAccID
	} else {
		updates["account_id"] = nil
	}

	if err := database.DB.Model(&model.ResourceLink{}).
		Where("resource_id IN (?)", parsedIDs).
		Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "批量更新归属失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("成功为 %d 条资料更新网盘归属账号", len(parsedIDs)),
		"data": fiber.Map{
			"affected": len(parsedIDs),
		},
	})
}

// AdminBatchAssignChannel 批量设置资料所属频道
func (h *ResourceHandler) AdminBatchAssignChannel(c fiber.Ctx) error {
	type Request struct {
		IDs     []string `json:"ids"`
		Channel string   `json:"channel"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供有效的资料ID列表",
		})
	}

	var parsedIDs []uuid.UUID
	for _, idStr := range req.IDs {
		if id, err := uuid.Parse(idStr); err == nil {
			parsedIDs = append(parsedIDs, id)
		}
	}
	if len(parsedIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "未找到有效资料ID"})
	}

	if err := database.DB.Model(&model.Resource{}).
		Where("id IN (?)", parsedIDs).
		Update("channel", req.Channel).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "批量更新频道失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("成功为 %d 条资料更新所属频道为 [%s]", len(parsedIDs), req.Channel),
		"data": fiber.Map{
			"affected": len(parsedIDs),
		},
	})
}

// AdminBatchImportResources 跨站资料包批量导入并直接上架
func (h *ResourceHandler) AdminBatchImportResources(c fiber.Ctx) error {
	type ImportPayload struct {
		AutoPublish *bool            `json:"auto_publish"`
		Resources   []model.Resource `json:"resources"`
	}

	var req ImportPayload
	if err := c.Bind().JSON(&req); err != nil || len(req.Resources) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供有效的资料数据包",
		})
	}

	autoPublish := true
	if req.AutoPublish != nil {
		autoPublish = *req.AutoPublish
	}

	importedCount := 0
	var importedIDs []uuid.UUID

	for _, item := range req.Resources {
		cleanTitle := strings.TrimSpace(item.Title)
		if cleanTitle == "" {
			continue
		}
		item.Title = cleanTitle

		// 重新生成主键与防止冲突的唯一 Slug
		item.ID = uuid.New()
		item.CreatedAt = time.Now()
		item.UpdatedAt = time.Now()
		item.Slug = fmt.Sprintf("res-%d-%s", time.Now().UnixNano(), uuid.New().String()[:8])
		if item.ChannelSlug == "" {
			item.ChannelSlug = "edu"
		}
		if item.Stage != "" {
			item.Stage = NormalizeStage(item.Stage)
		}
		item.IsPublished = autoPublish

		// 保证网盘目录树 FileTree 完整保留并合法存储
		if len(item.FileTree) == 0 || string(item.FileTree) == "null" {
			item.FileTree = datatypes.JSON([]byte("[]"))
		}

		// 封面与宣传海报转存或保持
		if item.CoverImage != "" {
			item.CoverImage = h.processCoverImage(item.Slug, item.CoverImage)
		}
		if item.PosterImage != "" {
			item.PosterImage = h.processPosterImage(item.Slug, item.PosterImage)
		}

		// 级联处理 links
		newLinks := make([]model.ResourceLink, 0, len(item.Links))
		for _, l := range item.Links {
			if strings.TrimSpace(l.ShareURL) == "" {
				continue
			}
			l.ID = uuid.New()
			l.ResourceID = item.ID
			l.CreatedAt = time.Now()
			l.UpdatedAt = time.Now()
			if l.Status == "" {
				l.Status = "active"
			}
			newLinks = append(newLinks, l)
		}
		item.Links = newLinks

		// 写入数据库
		if err := database.DB.Create(&item).Error; err != nil {
			log.Printf("[BatchImport] Failed to create resource %s: %v", item.Title, err)
			continue
		}

		importedCount++
		importedIDs = append(importedIDs, item.ID)

		if item.Region != "" && item.School != "" {
			go EnsureRegionAndSchool(database.DB, item.Region, item.School, item.Stage)
		}
	}

	// 百度/必应主动收录
	if autoPublish && h.seo != nil && len(importedIDs) > 0 {
		go func(ids []uuid.UUID) {
			var seoCfg model.SeoConfig
			if err := database.DB.Where("id = ?", "global").First(&seoCfg).Error; err == nil && seoCfg.AutoPushOnPublish {
				h.seo.BatchPush("all", ids, nil)
			}
		}(importedIDs)
	}

	// Cloudflare 边缘节点缓存自动化主动批量刷新
	if autoPublish && h.seo != nil && len(importedIDs) > 0 {
		var importedResources []model.Resource
		database.DB.Where("id IN (?)", importedIDs).Find(&importedResources)
		h.seo.PurgeForResources(importedResources)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "批量导入完成",
		"data": fiber.Map{
			"total":    len(req.Resources),
			"imported": importedCount,
		},
	})
}

// SimpleImportPayload 极简多行文本批量导入参数
type SimpleImportPayload struct {
	Text         string `json:"text"`          // 批量文本，支持管道符 `|` 或制表符或逗号分隔
	AutoTransfer bool   `json:"auto_transfer"` // 是否自动转存换链
	AutoPublish  *bool  `json:"auto_publish"`  // 是否直接上架
	ChannelSlug  string `json:"channel_slug"`  // 所属频道 (默认 edu)
}

// AdminBatchImportSimple 极简文本/表格行批量导入资料
func (h *ResourceHandler) AdminBatchImportSimple(c fiber.Ctx) error {
	var req SimpleImportPayload
	if err := c.Bind().JSON(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供要批量导入的文本内容（如每行格式：资料标题 | 分享链接 | 提取码）",
		})
	}

	autoPublish := true
	if req.AutoPublish != nil {
		autoPublish = *req.AutoPublish
	}
	channelSlug := req.ChannelSlug
	if channelSlug == "" {
		channelSlug = "edu"
	}

	// 查找可用夸克账号 (若启用自动转存)
	var defaultAcc model.NetdiskAccount
	if req.AutoTransfer && h.transferSvc != nil {
		if err := database.DB.Where("is_default = true AND cookie != ''").First(&defaultAcc).Error; err != nil {
			database.DB.Where("cookie != ''").Order("is_default desc, updated_at desc").First(&defaultAcc)
		}
	}

	lines := strings.Split(req.Text, "\n")
	importedCount := 0
	transferredCount := 0
	failedCount := 0
	var importedIDs []uuid.UUID

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// 分隔符探测: 支持 `|`, `\t`, `,`
		var parts []string
		if strings.Contains(line, "|") {
			parts = strings.Split(line, "|")
		} else if strings.Contains(line, "\t") {
			parts = strings.Split(line, "\t")
		} else if strings.Contains(line, ",") {
			parts = strings.Split(line, ",")
		} else {
			parts = strings.Fields(line)
		}

		if len(parts) == 0 {
			continue
		}

		title := strings.TrimSpace(parts[0])
		shareURL := ""
		extractCode := ""

		if len(parts) >= 2 {
			shareURL = strings.TrimSpace(parts[1])
		}
		if len(parts) >= 3 {
			extractCode = strings.TrimSpace(parts[2])
		}

		// 若标题中混入了 URL，自动分离
		if shareURL == "" {
			urlPattern := regexp.MustCompile(`https?://[^\s]+`)
			if m := urlPattern.FindString(title); m != "" {
				shareURL = m
				title = strings.Replace(title, m, "", 1)
			}
		}

		if title == "" || shareURL == "" {
			failedCount++
			continue
		}

		driveType := "quark"
		if strings.Contains(shareURL, "pan.baidu.com") {
			driveType = "baidu"
		} else if strings.Contains(shareURL, "alipan.com") || strings.Contains(shareURL, "aliyundrive.com") {
			driveType = "aliyun"
		}

		// 提取链接内置提取码
		if extractCode == "" {
			if u, err := url.Parse(shareURL); err == nil {
				extractCode = u.Query().Get("pwd")
				if extractCode == "" {
					extractCode = u.Query().Get("passcode")
				}
			}
		}

		// 智能推断学科、学段、年级、版本与副标题
		meta := h.smartMeta.InferMeta(title)

		finalShareURL := shareURL
		finalExtractCode := extractCode
		finalFileSize := "完整高清版"

		// 自动转存换链
		if req.AutoTransfer && driveType == "quark" && defaultAcc.Cookie != "" && h.transferSvc != nil {
			targetFID := defaultAcc.TargetFolderFID
			if targetFID == "" {
				targetFID = "0"
			}
			tRes, tErr := h.transferSvc.TransferAndShare(defaultAcc.Cookie, targetFID, shareURL, extractCode)
			if tErr == nil && tRes != nil && tRes.NewShareURL != "" {
				finalShareURL = tRes.NewShareURL
				if tRes.ExtractCode != "" {
					finalExtractCode = tRes.ExtractCode
				}
				if tRes.FileSize != "" && tRes.FileSize != "完整资源包" {
					finalFileSize = tRes.FileSize
				}
				transferredCount++
			}
		}

		resID := uuid.New()
		slug := fmt.Sprintf("res-%d-%s", time.Now().UnixNano(), uuid.New().String()[:8])
		chSlug := channelSlug
		if meta.ChannelSlug == "book" {
			chSlug = "book"
		}

		item := model.Resource{
			ID:          resID,
			Slug:        slug,
			ChannelSlug: chSlug,
			Title:       meta.PolishedTitle,
			Subtitle:    meta.Subtitle,
			Description: meta.Description,
			Stage:       meta.Stage,
			Grade:       meta.Grade,
			Term:        meta.Term,
			Subject:     meta.Subject,
			Edition:     meta.Edition,
			FileType:    "PDF",
			FileSize:    finalFileSize,
			IsPublished: autoPublish,
			FileTree:    datatypes.JSON([]byte("[]")),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		newLink := model.ResourceLink{
			ID:           uuid.New(),
			ResourceID:   resID,
			DriveType:    driveType,
			ShareURL:     finalShareURL,
			ExtractCode:  finalExtractCode,
			IsPrimary:    true,
			Status:       "active",
			FileSize:     finalFileSize,
			FileType:     "PDF",
			ResourceDesc: "夸克官方高速免密通道",
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if defaultAcc.ID != uuid.Nil {
			newLink.AccountID = &defaultAcc.ID
			newLink.AccountName = defaultAcc.AccountName
		}
		item.Links = []model.ResourceLink{newLink}

		if err := database.DB.Create(&item).Error; err != nil {
			log.Printf("[BatchImportSimple] Failed to create %s: %v", title, err)
			failedCount++
			continue
		}
		importedCount++
		importedIDs = append(importedIDs, resID)
	}

	// 百度/必应主动收录
	if autoPublish && h.seo != nil && len(importedIDs) > 0 {
		go func(ids []uuid.UUID) {
			var seoCfg model.SeoConfig
			if err := database.DB.Where("id = ?", "global").First(&seoCfg).Error; err == nil && seoCfg.AutoPushOnPublish {
				h.seo.BatchPush("all", ids, nil)
			}
		}(importedIDs)
	}

	msg := fmt.Sprintf("导入完成！成功录入 %d 条资料", importedCount)
	if transferredCount > 0 {
		msg += fmt.Sprintf("，其中 %d 条已全自动转存换链", transferredCount)
	}
	if failedCount > 0 {
		msg += fmt.Sprintf("，忽略 %d 条异常行", failedCount)
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": msg,
		"data": fiber.Map{
			"imported_count":    importedCount,
			"transferred_count": transferredCount,
			"failed_count":      failedCount,
		},
	})
}

// AdminExportResources 全站资料与网盘链接一键导出冷备 (支持 CSV / JSON)
func (h *ResourceHandler) AdminExportResources(c fiber.Ctx) error {
	format := strings.ToLower(c.Query("format", "csv"))

	var resources []model.Resource
	if err := database.DB.Preload("Links").Order("created_at desc").Find(&resources).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "读取资料库失败: " + err.Error(),
		})
	}

	if format == "json" {
		c.Set("Content-Type", "application/json; charset=utf-8")
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=xuebaw_resources_%s.json", time.Now().Format("20060102_150405")))
		return c.JSON(resources)
	}

	// 默认导出 CSV 格式 (添加 UTF-8 BOM 确保 Microsoft Excel / WPS 打开中文不乱码)
	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM

	writer := csv.NewWriter(&buf)
	header := []string{
		"ID", "标题", "副标题", "所属频道", "学段", "年级", "学期/分册", "学科", "教材版本", "文件大小",
		"转存量", "浏览量", "是否上架", "夸克分享链接", "百度分享链接", "创建时间",
	}
	writer.Write(header)

	for _, r := range resources {
		quarkURL := ""
		baiduURL := ""
		for _, l := range r.Links {
			if l.DriveType == "quark" {
				quarkURL = l.ShareURL
			} else if l.DriveType == "baidu" {
				baiduURL = l.ShareURL
				if l.ExtractCode != "" {
					baiduURL += fmt.Sprintf(" (提取码:%s)", l.ExtractCode)
				}
			}
		}

		isPublishedStr := "是"
		if !r.IsPublished {
			isPublishedStr = "否"
		}

		row := []string{
			r.ID.String(),
			r.Title,
			r.Subtitle,
			r.ChannelSlug,
			r.Stage,
			r.Grade,
			r.Term,
			r.Subject,
			r.Edition,
			r.FileSize,
			strconv.Itoa(r.SaveCount),
			strconv.Itoa(r.ViewCount),
			isPublishedStr,
			quarkURL,
			baiduURL,
			r.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		writer.Write(row)
	}
	writer.Flush()

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=xuebaw_resources_%s.csv", time.Now().Format("20060102_150405")))
	return c.Send(buf.Bytes())
}

type ParseNetdiskRequest struct {
	ShareURL  string `json:"share_url"`
	DriveType string `json:"drive_type"`
	Passcode  string `json:"passcode"`
}

// AdminParseNetdisk 自动提取网盘真实文件名、大小与格式及时间
func (h *ResourceHandler) AdminParseNetdisk(c fiber.Ctx) error {
	var req ParseNetdiskRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误",
		})
	}

	result := h.parser.ParseShareURL(req.ShareURL, req.DriveType, req.Passcode)
	return c.JSON(fiber.Map{
		"code": 200,
		"data": result,
	})
}

// ReportLink 前台用户提交网盘失效报错
func (h *ResourceHandler) ReportLink(c fiber.Ctx) error {
	linkIDStr := c.Params("id")
	linkUUID, err := uuid.Parse(linkIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效链接ID"})
	}

	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.Bind().JSON(&req)

	clientIP := c.IP()
	updated, err := h.checker.UserReportLink(linkUUID, clientIP, req.Reason)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "网盘链接不存在"})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "已收到您的反馈，管理员将尽快复核并更新！",
		"data": fiber.Map{
			"link_id":      updated.ID,
			"status":       updated.Status,
			"report_count": updated.ReportCount,
		},
	})
}

// AdminCheckSingleLink 后台手动立即检测单个链接存活状态
func (h *ResourceHandler) AdminCheckSingleLink(c fiber.Ctx) error {
	linkIDStr := c.Params("id")
	linkUUID, err := uuid.Parse(linkIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效链接ID"})
	}

	var link model.ResourceLink
	if err := database.DB.First(&link, "id = ?", linkUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "网盘链接不存在"})
	}

	status, reason := h.checker.CheckSingleLink(&link)
	now := time.Now()
	link.LastCheckedAt = &now

	if status == "active" {
		link.Status = "active"
		link.InvalidReason = ""
		link.ReportCount = 0
	} else {
		link.Status = "invalid"
		if link.ReportCount > 0 && link.InvalidReason != "" && !strings.Contains(link.InvalidReason, "巡检结果") {
			link.InvalidReason = fmt.Sprintf("【用户报错】%s；【巡检结果】%s", link.InvalidReason, reason)
		} else {
			link.InvalidReason = reason
		}
	}
	database.DB.Save(&link)

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "检测完成",
		"data": fiber.Map{
			"id":              link.ID,
			"status":          link.Status,
			"invalid_reason":  link.InvalidReason,
			"last_checked_at": link.LastCheckedAt,
		},
	})
}

// AdminBatchCheckLinks 后台批量巡检网盘（受冷却机制保护，避免短时间内重复检测）
func (h *ResourceHandler) AdminBatchCheckLinks(c fiber.Ctx) error {
	var opts service.BatchCheckOptions
	if err := c.Bind().JSON(&opts); err != nil {
		// 允许使用默认配置
		opts = service.BatchCheckOptions{
			MinIntervalHours: 24,
			Force:            false,
		}
	}

	summary, err := h.checker.RunBatchCheck(opts)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "批量检测执行失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("批量巡检完成：检测 %d 个，正常 %d 个，失效 %d 个，因冷却跳过 %d 个", summary.CheckedCount, summary.ActiveCount, summary.InvalidCount, summary.SkippedCount),
		"data":    summary,
	})
}

// AdminUpdateLinkStatus 后台管理员手动修改链接状态与原因
func (h *ResourceHandler) AdminUpdateLinkStatus(c fiber.Ctx) error {
	linkIDStr := c.Params("id")
	linkUUID, err := uuid.Parse(linkIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效链接ID"})
	}

	var req struct {
		Status        string `json:"status"` // active, invalid, reported
		InvalidReason string `json:"invalid_reason"`
		ShareURL      string `json:"share_url"`
		ExtractCode   string `json:"extract_code"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	var link model.ResourceLink
	if err := database.DB.First(&link, "id = ?", linkUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "网盘链接不存在"})
	}

	if req.Status != "" {
		link.Status = req.Status
		if req.Status == "active" {
			link.ReportCount = 0
		}
	}
	if req.InvalidReason != "" {
		link.InvalidReason = req.InvalidReason
	}
	if req.ShareURL != "" {
		link.ShareURL = req.ShareURL
	}
	if req.ExtractCode != "" {
		link.ExtractCode = req.ExtractCode
	}

	now := time.Now()
	link.LastCheckedAt = &now
	database.DB.Save(&link)

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "链接状态更新成功",
		"data":    link,
	})
}

