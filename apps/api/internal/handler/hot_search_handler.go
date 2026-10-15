package handler

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type HotSearchHandler struct{}

func NewHotSearchHandler() *HotSearchHandler {
	return &HotSearchHandler{}
}

// ListPublicHotSearches 前台获取当前学段已启用的高频热搜标签
func (h *HotSearchHandler) ListPublicHotSearches(c fiber.Ctx) error {
	stage := strings.TrimSpace(c.Query("stage", "all"))

	var hots []model.HotSearch
	query := database.DB.Where("is_active = ?", true)

	if stage != "" && stage != "all" {
		query = query.Where("stage = ? OR stage = 'all'", stage)
	}

	if err := query.Order("sort_order ASC, created_at ASC").Find(&hots).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取高频热搜失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": hots,
	})
}

// ListAdminHotSearches 后台获取全量高频热搜标签列表
func (h *HotSearchHandler) ListAdminHotSearches(c fiber.Ctx) error {
	stage := strings.TrimSpace(c.Query("stage"))
	keyword := strings.TrimSpace(c.Query("keyword"))

	query := database.DB.Model(&model.HotSearch{})

	if stage != "" && stage != "all" {
		query = query.Where("stage = ?", stage)
	}

	if keyword != "" {
		query = query.Where("title ILIKE ? OR keyword ILIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	var list []model.HotSearch
	if err := query.Order("sort_order ASC, created_at ASC").Find(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取高频热搜列表失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": list,
	})
}

// CreateAdminHotSearch 后台新增高频热搜
func (h *HotSearchHandler) CreateAdminHotSearch(c fiber.Ctx) error {
	type Request struct {
		Title     string `json:"title"`
		Keyword   string `json:"keyword"`
		Stage     string `json:"stage"`
		StyleType string `json:"style_type"`
		SortOrder int    `json:"sort_order"`
		IsActive  *bool  `json:"is_active"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误: " + err.Error(),
		})
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Keyword = strings.TrimSpace(req.Keyword)
	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "热搜展示标题不能为空",
		})
	}
	if req.Keyword == "" {
		req.Keyword = req.Title
	}

	stage := strings.TrimSpace(req.Stage)
	if stage == "" {
		stage = "all"
	}
	styleType := strings.TrimSpace(req.StyleType)
	if styleType == "" {
		styleType = "default"
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	hot := model.HotSearch{
		Title:     req.Title,
		Keyword:   req.Keyword,
		Stage:     stage,
		StyleType: styleType,
		SortOrder: req.SortOrder,
		IsActive:  isActive,
	}

	if err := database.DB.Create(&hot).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "创建热搜失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "创建成功",
		"data":    hot,
	})
}

// UpdateAdminHotSearch 后台更新高频热搜
func (h *HotSearchHandler) UpdateAdminHotSearch(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的热搜ID",
		})
	}

	var hot model.HotSearch
	if err := database.DB.First(&hot, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "未找到该热搜词条",
		})
	}

	type Request struct {
		Title     *string `json:"title"`
		Keyword   *string `json:"keyword"`
		Stage     *string `json:"stage"`
		StyleType *string `json:"style_type"`
		SortOrder *int    `json:"sort_order"`
		IsActive  *bool   `json:"is_active"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误: " + err.Error(),
		})
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"code":    400,
				"message": "热搜展示标题不能为空",
			})
		}
		updates["title"] = t
	}
	if req.Keyword != nil {
		updates["keyword"] = strings.TrimSpace(*req.Keyword)
	}
	if req.Stage != nil {
		updates["stage"] = strings.TrimSpace(*req.Stage)
	}
	if req.StyleType != nil {
		updates["style_type"] = strings.TrimSpace(*req.StyleType)
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	if len(updates) > 0 {
		if err := database.DB.Model(&hot).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"code":    500,
				"message": "更新热搜失败: " + err.Error(),
			})
		}
	}

	database.DB.First(&hot, "id = ?", id)
	return c.JSON(fiber.Map{
		"code":    200,
		"message": "更新成功",
		"data":    hot,
	})
}

// DeleteAdminHotSearch 后台删除高频热搜
func (h *HotSearchHandler) DeleteAdminHotSearch(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的热搜ID",
		})
	}

	result := database.DB.Delete(&model.HotSearch{}, "id = ?", id)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "删除失败: " + result.Error.Error(),
		})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "热搜词条不存在或已被删除",
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "删除成功",
	})
}

// ToggleAdminHotSearchStatus 后台快速切换高频热搜启用/禁用状态
func (h *HotSearchHandler) ToggleAdminHotSearchStatus(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的热搜ID",
		})
	}

	var hot model.HotSearch
	if err := database.DB.First(&hot, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "热搜词条不存在",
		})
	}

	newStatus := !hot.IsActive
	if err := database.DB.Model(&hot).Update("is_active", newStatus).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "切换状态失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "状态切换成功",
		"data": fiber.Map{
			"id":        hot.ID,
			"is_active": newStatus,
		},
	})
}

// BatchToggleAdminHotSearches 后台批量启用/停用高频热搜
func (h *HotSearchHandler) BatchToggleAdminHotSearches(c fiber.Ctx) error {
	type Request struct {
		IDs      []string `json:"ids"`
		IsActive bool     `json:"is_active"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供有效的热搜ID列表",
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
			"message": "未找到有效的热搜ID",
		})
	}

	if err := database.DB.Model(&model.HotSearch{}).Where("id IN (?)", parsedIDs).Update("is_active", req.IsActive).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "批量切换状态失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "批量切换状态成功",
		"data": fiber.Map{
			"affected": len(parsedIDs),
		},
	})
}

// BatchDeleteAdminHotSearches 后台批量删除高频热搜
func (h *HotSearchHandler) BatchDeleteAdminHotSearches(c fiber.Ctx) error {
	type Request struct {
		IDs []string `json:"ids"`
	}

	var req Request
	if err := c.Bind().Body(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请提供有效的热搜ID列表",
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
			"message": "未找到有效的热搜ID",
		})
	}

	result := database.DB.Where("id IN (?)", parsedIDs).Delete(&model.HotSearch{})
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "批量删除失败: " + result.Error.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "批量删除成功",
		"data": fiber.Map{
			"affected": result.RowsAffected,
		},
	})
}

