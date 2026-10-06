package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type NavMenuHandler struct{}

func NewNavMenuHandler() *NavMenuHandler {
	return &NavMenuHandler{}
}

// ListPublicNavMenus 获取前台公开在线的完整层级导航树
func (h *NavMenuHandler) ListPublicNavMenus(c fiber.Ctx) error {
	var menus []model.NavMenu
	err := database.DB.Where("parent_id IS NULL AND is_active = true").
		Order("sort_order asc, created_at asc").
		Preload("Children", func(db *gorm.DB) *gorm.DB {
			return db.Where("is_active = true").Order("sort_order asc, created_at asc")
		}).
		Find(&menus).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取导航菜单失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": menus,
	})
}

// ListAdminNavMenus 管理员获取全部导航菜单 (包含已隐藏项及子菜单)
func (h *NavMenuHandler) ListAdminNavMenus(c fiber.Ctx) error {
	var menus []model.NavMenu
	err := database.DB.Where("parent_id IS NULL").
		Order("sort_order asc, created_at asc").
		Preload("Children", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order asc, created_at asc")
		}).
		Find(&menus).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取管理端导航菜单失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": menus,
	})
}

type CreateNavMenuDTO struct {
	ParentID           *string `json:"parent_id"`
	Title              string  `json:"title"`
	Icon               string  `json:"icon"`
	LinkURL            string  `json:"link_url"`
	BadgeText          string  `json:"badge_text"`
	Description        string  `json:"description"`
	SortOrder          int     `json:"sort_order"`
	IsActive           *bool   `json:"is_active"`
	IsSpecialHighlight bool    `json:"is_special_highlight"`
}

// CreateNavMenu 创建导航项 (支持一级或二级)
func (h *NavMenuHandler) CreateNavMenu(c fiber.Ctx) error {
	var dto CreateNavMenuDTO
	if err := c.Bind().Body(&dto); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误: " + err.Error(),
		})
	}

	if dto.Title == "" || dto.LinkURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "菜单标题与跳转链接不能为空",
		})
	}

	menu := model.NavMenu{
		ID:                 uuid.New(),
		Title:              dto.Title,
		Icon:               dto.Icon,
		LinkURL:            dto.LinkURL,
		BadgeText:          dto.BadgeText,
		Description:        dto.Description,
		SortOrder:          dto.SortOrder,
		IsActive:           true,
		IsSpecialHighlight: dto.IsSpecialHighlight,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if dto.Icon == "" {
		menu.Icon = "📚"
	}
	if dto.IsActive != nil {
		menu.IsActive = *dto.IsActive
	}

	if dto.ParentID != nil && *dto.ParentID != "" {
		parentUUID, err := uuid.Parse(*dto.ParentID)
		if err == nil {
			menu.ParentID = &parentUUID
		}
	}

	if err := database.DB.Create(&menu).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "创建导航项失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "导航项创建成功",
		"data":    menu,
	})
}

// UpdateNavMenu 修改导航项
func (h *NavMenuHandler) UpdateNavMenu(c fiber.Ctx) error {
	idStr := c.Params("id")
	menuID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的菜单ID",
		})
	}

	var dto CreateNavMenuDTO
	if err := c.Bind().Body(&dto); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误: " + err.Error(),
		})
	}

	var menu model.NavMenu
	if err := database.DB.First(&menu, "id = ?", menuID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "导航项不存在",
		})
	}

	menu.Title = dto.Title
	if dto.Icon != "" {
		menu.Icon = dto.Icon
	}
	menu.LinkURL = dto.LinkURL
	menu.BadgeText = dto.BadgeText
	menu.Description = dto.Description
	menu.SortOrder = dto.SortOrder
	menu.IsSpecialHighlight = dto.IsSpecialHighlight
	if dto.IsActive != nil {
		menu.IsActive = *dto.IsActive
	}

	if dto.ParentID != nil && *dto.ParentID != "" {
		parentUUID, err := uuid.Parse(*dto.ParentID)
		if err == nil {
			menu.ParentID = &parentUUID
		}
	} else {
		menu.ParentID = nil
	}
	menu.UpdatedAt = time.Now()

	if err := database.DB.Save(&menu).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "更新导航项失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "导航项更新成功",
		"data":    menu,
	})
}

// ToggleNavMenu 一键切换显隐/上线状态
func (h *NavMenuHandler) ToggleNavMenu(c fiber.Ctx) error {
	idStr := c.Params("id")
	menuID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的菜单ID",
		})
	}

	var menu model.NavMenu
	if err := database.DB.First(&menu, "id = ?", menuID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "导航项不存在",
		})
	}

	menu.IsActive = !menu.IsActive
	menu.UpdatedAt = time.Now()
	if err := database.DB.Save(&menu).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "切换显隐失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "状态切换成功",
		"data": fiber.Map{
			"id":        menu.ID,
			"is_active": menu.IsActive,
		},
	})
}

// DeleteNavMenu 删除导航项 (级联删除子项)
func (h *NavMenuHandler) DeleteNavMenu(c fiber.Ctx) error {
	idStr := c.Params("id")
	menuID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的菜单ID",
		})
	}

	if err := database.DB.Delete(&model.NavMenu{}, "id = ? OR parent_id = ?", menuID, menuID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "删除导航项失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "导航项已成功删除",
	})
}
