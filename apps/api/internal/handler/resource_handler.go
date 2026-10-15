package handler

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
	"encoding/base64"
	"log"
	"os"
	"strings"
)

type ResourceHandler struct {
	parser   *service.NetdiskParserService
	checker  *service.NetdiskCheckerService
	coverGen *service.CoverGeneratorService
	r2       *service.R2Service
	crawler  *service.TelegramCrawlerService
	seo      *service.SeoService
}

func NewResourceHandler(parser *service.NetdiskParserService, checker *service.NetdiskCheckerService, coverGen *service.CoverGeneratorService, r2 *service.R2Service, crawler *service.TelegramCrawlerService, seo *service.SeoService) *ResourceHandler {
	return &ResourceHandler{
		parser:   parser,
		checker:  checker,
		coverGen: coverGen,
		r2:       r2,
		crawler:  crawler,
		seo:      seo,
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
	if pageSize < 1 || pageSize > 50 {
		pageSize = 12
	}

	channel := c.Query("channel")

	query := database.DB.Model(&model.Resource{}).
		Where("is_published = ?", true).
		Where("channel_slug IN (SELECT slug FROM channels WHERE is_active = true)").
		Preload("Links")

	if channel != "" && channel != "all" {
		query = query.Where("channel_slug = ?", channel)
	}
	if stage != "" && stage != "all" {
		stdStage := NormalizeStage(stage)
		query = query.Where("stage = ?", stdStage)
	}
	if grade != "" {
		query = query.Where("grade = ?", grade)
	}
	if subject != "" {
		query = query.Where("subject = ?", subject)
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
	if err := query.Order("is_recommended DESC, created_at DESC").
		Offset(offset).Limit(pageSize).Find(&items).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取资源失败",
		})
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
	err := database.DB.Preload("Links").
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
	linkIDStr := c.Query("link_id")

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

// GetPublicRelatedResources 获取同名校/同科目/同学段精选关联真题 (最多 6 条)
func (h *ResourceHandler) GetPublicRelatedResources(c fiber.Ctx) error {
	identifier := c.Params("id_or_slug")

	var currentRes model.Resource
	err := database.DB.Select("id, slug, stage, subject, grade, school, region").
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

	// 1. 若有名校字段，优先匹配同一名校的其他资料 (排除自身)
	if strings.TrimSpace(currentRes.School) != "" {
		var schoolItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND school = ? AND id != ?", true, currentRes.School, currentRes.ID).
			Order("created_at DESC").
			Limit(6).
			Find(&schoolItems)

		for _, item := range schoolItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 2. 若数量不足 6 条，同科目 + 同学段补充 (排除已收集)
	if len(related) < 6 && currentRes.Subject != "" && currentRes.Stage != "" {
		needed := 6 - len(related)
		var subjectItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND stage = ? AND subject = ? AND id NOT IN ?", true, currentRes.Stage, currentRes.Subject, collectedIDs).
			Order("is_recommended DESC, view_count DESC, created_at DESC").
			Limit(needed).
			Find(&subjectItems)

		for _, item := range subjectItems {
			related = append(related, item)
			collectedIDs = append(collectedIDs, item.ID)
		}
	}

	// 3. 若仍不足 6 条，同学段最新推荐资料补充 (排除已收集)
	if len(related) < 6 && currentRes.Stage != "" {
		needed := 6 - len(related)
		var stageItems []model.Resource
		database.DB.Model(&model.Resource{}).
			Preload("Links").
			Where("is_published = ? AND stage = ? AND id NOT IN ?", true, currentRes.Stage, collectedIDs).
			Order("is_recommended DESC, view_count DESC, created_at DESC").
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
				r2Key := fmt.Sprintf("covers/%s.png", slug)
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

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "创建成功",
		"data":    res,
	})
}

// AdminListResources 后台所有资源列表（支持按频道和学段过滤）
func (h *ResourceHandler) AdminListResources(c fiber.Ctx) error {
	channel := c.Query("channel")
	stage := c.Query("stage")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("limit", "100"))

	query := database.DB.Model(&model.Resource{})
	if channel != "" && channel != "all" {
		query = query.Where("channel_slug = ?", channel)
	}
	if stage != "" && stage != "all" {
		query = query.Where("stage = ?", NormalizeStage(stage))
	}

	var total int64
	query.Count(&total)

	var list []model.Resource
	offset := (page - 1) * pageSize
	query.Preload("Links").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&list)

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items": list,
			"total": total,
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
	existing.Subject = req.Subject
	existing.Edition = req.Edition
	existing.Region = req.Region
	existing.School = req.School
	existing.FileType = req.FileType
	existing.FileSize = req.FileSize
	existing.PageCount = req.PageCount
	if req.CoverImage != "" {
		existing.CoverImage = h.processCoverImage(existing.Slug, req.CoverImage)
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

		database.DB.Where("resource_id = ?", existing.ID).Delete(&model.ResourceLink{})
		for i := range req.Links {
			req.Links[i].ResourceID = existing.ID
			req.Links[i].ID = uuid.New()
			if req.Links[i].ClickCount == 0 {
				if prev, ok := oldClickCounts[req.Links[i].DriveType]; ok {
					req.Links[i].ClickCount = prev
				}
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

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "更新成功",
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

	r2URL := h.processCoverImage(req.Slug, req.ImageData)
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

