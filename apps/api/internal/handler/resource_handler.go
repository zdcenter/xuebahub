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
)

type ResourceHandler struct {
	parser *service.NetdiskParserService
}

func NewResourceHandler(parser *service.NetdiskParserService) *ResourceHandler {
	return &ResourceHandler{
		parser: parser,
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

	query := database.DB.Model(&model.Resource{}).
		Where("is_published = ?", true).
		Preload("Links")

	if stage != "" {
		query = query.Where("stage = ?", stage)
	}
	if grade != "" {
		query = query.Where("grade = ?", grade)
	}
	if subject != "" {
		query = query.Where("subject = ?", subject)
	}
	if keyword != "" {
		query = query.Where("title ILIKE ? OR subtitle ILIKE ?", "%"+keyword+"%", "%"+keyword+"%")
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

// AdminCreateResource 后台创建资源
func (h *ResourceHandler) AdminCreateResource(c fiber.Ctx) error {
	var res model.Resource
	if err := c.Bind().JSON(&res); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if res.Slug == "" {
		res.Slug = fmt.Sprintf("res-%d", time.Now().UnixNano())
	}

	if err := database.DB.Create(&res).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "创建失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "创建成功",
		"data":    res,
	})
}

// AdminListResources 后台所有资源列表
func (h *ResourceHandler) AdminListResources(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("limit", "50"))

	var total int64
	database.DB.Model(&model.Resource{}).Count(&total)

	var list []model.Resource
	offset := (page - 1) * pageSize
	database.DB.Preload("Links").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&list)

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
	existing.Title = req.Title
	existing.Subtitle = req.Subtitle
	existing.Description = req.Description
	existing.Stage = req.Stage
	existing.Grade = req.Grade
	existing.Subject = req.Subject
	existing.Edition = req.Edition
	existing.FileType = req.FileType
	existing.FileSize = req.FileSize
	existing.PageCount = req.PageCount
	existing.CoverImage = req.CoverImage
	existing.IsRecommended = req.IsRecommended
	existing.IsPublished = req.IsPublished

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

	if err := database.DB.Save(&existing).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "更新成功",
		"data":    existing,
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

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "状态已更新",
		"data": fiber.Map{
			"id":           res.ID,
			"is_published": res.IsPublished,
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
