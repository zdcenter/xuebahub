package handler

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type CollectionHandler struct{}

func NewCollectionHandler() *CollectionHandler {
	return &CollectionHandler{}
}

type CollectionWithCount struct {
	model.Collection
	ResourceCount int64 `json:"resource_count"`
}

var slugSanitizeRe = regexp.MustCompile(`[^a-z0-9-]+`)

func buildCollectionSlug(rawSlug, title string) string {
	s := strings.ToLower(strings.TrimSpace(rawSlug))
	if s == "" {
		s = strings.ToLower(strings.TrimSpace(title))
	}
	s = strings.ReplaceAll(s, " ", "-")
	s = slugSanitizeRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = fmt.Sprintf("col-%d", time.Now().Unix())
	}
	return s
}

// ListPublicCollections 前台获取启用中的专辑列表
func (h *CollectionHandler) ListPublicCollections(c fiber.Ctx) error {
	var cols []model.Collection
	database.DB.Where("is_active = ?", true).
		Order("sort_order ASC, created_at DESC").
		Find(&cols)

	result := make([]CollectionWithCount, 0, len(cols))
	for _, col := range cols {
		var cnt int64
		database.DB.Model(&model.Resource{}).
			Where("collection_id = ? AND is_published = ?", col.ID, true).
			Count(&cnt)
		result = append(result, CollectionWithCount{
			Collection:    col,
			ResourceCount: cnt,
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": result,
	})
}

// GetPublicCollectionDetail 前台获取单个专辑详情及其下属所有资源
func (h *CollectionHandler) GetPublicCollectionDetail(c fiber.Ctx) error {
	idOrSlug := strings.TrimSpace(c.Params("id_or_slug"))
	if idOrSlug == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "缺少专辑标识"})
	}

	var col model.Collection
	err := database.DB.Where("(slug = ? OR id::text = ?) AND is_active = ?", idOrSlug, idOrSlug, true).
		First(&col).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "专辑不存在或已下线"})
	}

	var items []model.Resource
	database.DB.Preload("Links").
		Where("collection_id = ? AND is_published = ?", col.ID, true).
		Order("created_at ASC, title ASC").
		Find(&items)

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"collection": col,
			"items":      items,
			"total":      len(items),
		},
	})
}

// ListAdminCollections 后台获取全部专辑及包含资源数
func (h *CollectionHandler) ListAdminCollections(c fiber.Ctx) error {
	var cols []model.Collection
	database.DB.Order("sort_order ASC, created_at DESC").Find(&cols)

	result := make([]CollectionWithCount, 0, len(cols))
	for _, col := range cols {
		var cnt int64
		database.DB.Model(&model.Resource{}).Where("collection_id = ?", col.ID).Count(&cnt)
		result = append(result, CollectionWithCount{
			Collection:    col,
			ResourceCount: cnt,
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": result,
	})
}

// CreateAdminCollection 后台创建专辑
func (h *CollectionHandler) CreateAdminCollection(c fiber.Ctx) error {
	var req struct {
		Title       string `json:"title"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		CoverImage  string `json:"cover_image"`
		SortOrder   int    `json:"sort_order"`
		IsActive    *bool  `json:"is_active"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "专辑名称不能为空"})
	}

	slug := buildCollectionSlug(req.Slug, req.Title)
	var exists int64
	database.DB.Model(&model.Collection{}).Where("slug = ?", slug).Count(&exists)
	if exists > 0 {
		slug = fmt.Sprintf("%s-%d", slug, time.Now().Unix()%10000)
	}

	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}

	col := model.Collection{
		Slug:        slug,
		Title:       req.Title,
		Description: strings.TrimSpace(req.Description),
		CoverImage:  strings.TrimSpace(req.CoverImage),
		SortOrder:   req.SortOrder,
		IsActive:    active,
	}
	if err := database.DB.Create(&col).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "创建专辑失败"})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": CollectionWithCount{Collection: col, ResourceCount: 0},
	})
}

// UpdateAdminCollection 后台更新专辑
func (h *CollectionHandler) UpdateAdminCollection(c fiber.Ctx) error {
	idStr := c.Params("id")
	colUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效专辑ID"})
	}

	var col model.Collection
	if err := database.DB.First(&col, "id = ?", colUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "专辑不存在"})
	}

	var req struct {
		Title       string `json:"title"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		CoverImage  string `json:"cover_image"`
		SortOrder   int    `json:"sort_order"`
		IsActive    *bool  `json:"is_active"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if strings.TrimSpace(req.Title) != "" {
		col.Title = strings.TrimSpace(req.Title)
	}
	if strings.TrimSpace(req.Slug) != "" {
		col.Slug = buildCollectionSlug(req.Slug, col.Title)
	}
	col.Description = strings.TrimSpace(req.Description)
	col.CoverImage = strings.TrimSpace(req.CoverImage)
	col.SortOrder = req.SortOrder
	if req.IsActive != nil {
		col.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&col).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新专辑失败"})
	}

	return c.JSON(fiber.Map{"code": 200, "data": col})
}

// DeleteAdminCollection 后台删除专辑（自动解除资源关联，不删除资源本身）
func (h *CollectionHandler) DeleteAdminCollection(c fiber.Ctx) error {
	idStr := c.Params("id")
	colUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效专辑ID"})
	}

	database.DB.Model(&model.Resource{}).Where("collection_id = ?", colUUID).Update("collection_id", nil)
	if err := database.DB.Delete(&model.Collection{}, "id = ?", colUUID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "删除专辑失败"})
	}

	return c.JSON(fiber.Map{"code": 200, "message": "已删除专辑"})
}
