package handler

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/mozillazg/go-pinyin"

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

var slugMultiDashRe = regexp.MustCompile(`-+`)

func toPinyinSlug(input string) string {
	args := pinyin.NewArgs()
	var b strings.Builder
	prevASCII := false

	for _, r := range strings.TrimSpace(input) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'):
			b.WriteRune(unicode.ToLower(r))
			prevASCII = true
		case unicode.Is(unicode.Han, r):
			if prevASCII {
				b.WriteByte('-')
				prevASCII = false
			}
			py := pinyin.SinglePinyin(r, args)
			if len(py) > 0 && py[0] != "" {
				b.WriteString(strings.ToLower(py[0]))
				b.WriteByte('-')
			}
		default:
			b.WriteByte('-')
			prevASCII = false
		}
	}

	s := slugMultiDashRe.ReplaceAllString(b.String(), "-")
	s = strings.Trim(s, "-")
	if len(s) > 80 {
		s = strings.Trim(s[:80], "-")
	}
	return s
}

func buildCollectionSlug(rawSlug, title string) string {
	src := strings.TrimSpace(rawSlug)
	if src == "" {
		src = strings.TrimSpace(title)
	}
	s := toPinyinSlug(src)
	if s == "" {
		s = fmt.Sprintf("col-%d", time.Now().Unix())
	}
	return s
}

// PreviewCollectionSlug 后台根据专辑名称自动生成拼音/英文短链接预览
func (h *CollectionHandler) PreviewCollectionSlug(c fiber.Ctx) error {
	title := strings.TrimSpace(c.Query("title"))
	slug := ""
	if title != "" {
		slug = toPinyinSlug(title)
	}
	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"slug": slug,
		},
	})
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
		if strings.TrimSpace(col.CoverImage) == "" && cnt > 0 {
			var firstWithCover model.Resource
			if err := database.DB.Select("cover_image").
				Where("collection_id = ? AND is_published = ? AND cover_image <> ''", col.ID, true).
				Order("created_at ASC").
				First(&firstWithCover).Error; err == nil {
				col.CoverImage = firstWithCover.CoverImage
			}
		}
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

	orderExpr := "created_at ASC, title ASC"
	switch col.SortMode {
	case "manual":
		orderExpr = "collection_order ASC, created_at ASC"
	case "title_asc":
		orderExpr = "title ASC, created_at ASC"
	case "created_desc":
		orderExpr = "created_at DESC, title ASC"
	case "save_desc":
		orderExpr = "save_count DESC, created_at DESC"
	}

	var items []model.Resource
	database.DB.Preload("Links").
		Where("collection_id = ? AND is_published = ?", col.ID, true).
		Order(orderExpr).
		Find(&items)

	if strings.TrimSpace(col.CoverImage) == "" {
		for _, it := range items {
			if strings.TrimSpace(it.CoverImage) != "" {
				col.CoverImage = it.CoverImage
				break
			}
		}
	}

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
		SortMode    string `json:"sort_mode"`
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

	sortMode := strings.TrimSpace(req.SortMode)
	if sortMode == "" {
		sortMode = "created_asc"
	}

	col := model.Collection{
		Slug:        slug,
		Title:       req.Title,
		Description: strings.TrimSpace(req.Description),
		CoverImage:  strings.TrimSpace(req.CoverImage),
		SortOrder:   req.SortOrder,
		SortMode:    sortMode,
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
		SortMode    string `json:"sort_mode"`
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
	if strings.TrimSpace(req.SortMode) != "" {
		col.SortMode = strings.TrimSpace(req.SortMode)
	}
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

// BatchAssignCollection 后台批量将资源加入/移出专辑
func (h *CollectionHandler) BatchAssignCollection(c fiber.Ctx) error {
	var req struct {
		IDs          []string `json:"ids"`
		CollectionID string   `json:"collection_id"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}
	if len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请至少选择一条资料"})
	}

	var resUUIDs []uuid.UUID
	for _, idStr := range req.IDs {
		if uid, err := uuid.Parse(strings.TrimSpace(idStr)); err == nil {
			resUUIDs = append(resUUIDs, uid)
		}
	}
	if len(resUUIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效的资源ID列表"})
	}

	var targetColID interface{} = nil
	colIDStr := strings.TrimSpace(req.CollectionID)
	if colIDStr != "" && colIDStr != "none" {
		colUUID, err := uuid.Parse(colIDStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效专辑ID"})
		}
		var cnt int64
		database.DB.Model(&model.Collection{}).Where("id = ?", colUUID).Count(&cnt)
		if cnt == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "目标专辑不存在"})
		}
		targetColID = colUUID
	}

	res := database.DB.Model(&model.Resource{}).Where("id IN ?", resUUIDs).Update("collection_id", targetColID)
	if res.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "批量设置专辑失败"})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"affected": res.RowsAffected,
		},
	})
}

// GetAdminCollectionItems 后台获取指定专辑下的成员列表（按 collection_order 排序）
func (h *CollectionHandler) GetAdminCollectionItems(c fiber.Ctx) error {
	colUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效专辑ID"})
	}

	var col model.Collection
	if err := database.DB.First(&col, "id = ?", colUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "专辑不存在"})
	}

	var items []model.Resource
	database.DB.Select("id, slug, title, channel_slug, subject, grade, file_size, is_published, collection_order, created_at").
		Where("collection_id = ?", colUUID).
		Order("collection_order ASC, created_at ASC").
		Find(&items)

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"collection": col,
			"items":      items,
		},
	})
}

// ReorderAdminCollectionItems 后台保存专辑成员自定义排序，并自动切换专辑为 manual 排序模式
func (h *CollectionHandler) ReorderAdminCollectionItems(c fiber.Ctx) error {
	colUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效专辑ID"})
	}

	var req struct {
		ItemIDs []string `json:"item_ids"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	tx := database.DB.Begin()
	for idx, idStr := range req.ItemIDs {
		resUUID, err := uuid.Parse(strings.TrimSpace(idStr))
		if err != nil {
			continue
		}
		if err := tx.Model(&model.Resource{}).
			Where("id = ? AND collection_id = ?", resUUID, colUUID).
			Update("collection_order", idx).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "保存排序失败"})
		}
	}
	if err := tx.Model(&model.Collection{}).Where("id = ?", colUUID).Update("sort_mode", "manual").Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新排序模式失败"})
	}
	tx.Commit()

	return c.JSON(fiber.Map{"code": 200, "message": "排序已保存"})
}
