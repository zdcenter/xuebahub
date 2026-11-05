package handler

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v3"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type CategoryHandler struct{}

func NewCategoryHandler() *CategoryHandler {
	return &CategoryHandler{}
}

// ListPublicCategories 前台获取分类字典，支持 ?type=xxx 过滤，或 ?grouped=true 分组返回
func (h *CategoryHandler) ListPublicCategories(c fiber.Ctx) error {
	catType := strings.TrimSpace(c.Query("type"))
	grouped := c.Query("grouped") == "true" || c.Query("grouped") == "1"

	query := database.DB.Model(&model.Category{})
	if catType != "" {
		query = query.Where("type = ?", catType)
	}

	var categories []model.Category
	if err := query.Order("sort_order ASC, id ASC").Find(&categories).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取分类失败: " + err.Error(),
		})
	}

	if grouped {
		groupMap := map[string][]model.Category{
			"stage":   {},
			"grade":   {},
			"term":    {},
			"subject": {},
			"edition": {},
			"tag":     {},
		}
		for _, cat := range categories {
			groupMap[cat.Type] = append(groupMap[cat.Type], cat)
		}
		return c.JSON(fiber.Map{
			"code": 200,
			"data": groupMap,
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": categories,
	})
}

// ListAdminCategories 后台获取分类列表，支持关键字搜索与类型过滤
func (h *CategoryHandler) ListAdminCategories(c fiber.Ctx) error {
	catType := strings.TrimSpace(c.Query("type"))
	keyword := strings.TrimSpace(c.Query("keyword"))

	query := database.DB.Model(&model.Category{})
	if catType != "" && catType != "all" {
		query = query.Where("type = ?", catType)
	}
	if keyword != "" {
		query = query.Where("name ILIKE ? OR slug ILIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	var categories []model.Category
	if err := query.Order("sort_order ASC, id ASC").Find(&categories).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取分类列表失败: " + err.Error(),
		})
	}

	// 统计各类目下的实际在库资源数量
	type CountResult struct {
		CategoryID uint  `gorm:"column:category_id"`
		Total      int64 `gorm:"column:total"`
	}
	var counts []CountResult
	database.DB.Model(&model.Resource{}).
		Where("category_id IS NOT NULL").
		Select("category_id, count(*) as total").
		Group("category_id").
		Scan(&counts)

	countMap := make(map[uint]int64)
	for _, cr := range counts {
		countMap[cr.CategoryID] = cr.Total
	}

	type CategoryWithCount struct {
		model.Category
		ResourceCount int64 `json:"resource_count"`
	}

	res := make([]CategoryWithCount, len(categories))
	for i, cat := range categories {
		res[i] = CategoryWithCount{
			Category:      cat,
			ResourceCount: countMap[cat.ID],
		}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": res,
	})
}

// CreateCategory 后台创建新分类字典项
func (h *CategoryHandler) CreateCategory(c fiber.Ctx) error {
	var cat model.Category
	if err := c.Bind().JSON(&cat); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误",
		})
	}

	cat.Name = strings.TrimSpace(cat.Name)
	cat.Slug = strings.TrimSpace(strings.ToLower(cat.Slug))
	cat.Type = strings.TrimSpace(strings.ToLower(cat.Type))

	if cat.Name == "" || cat.Slug == "" || cat.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "分类名称、分类Slug与类别类型不能为空",
		})
	}

	var exists int64
	database.DB.Model(&model.Category{}).Where("slug = ?", cat.Slug).Count(&exists)
	if exists > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": fmt.Sprintf("分类标识 '%s' 已存在，请更换", cat.Slug),
		})
	}

	if cat.Icon == "" {
		switch cat.Type {
		case "stage":
			cat.Icon = "🎓"
		case "grade":
			cat.Icon = "🎒"
		case "term":
			cat.Icon = "📅"
		case "subject":
			cat.Icon = "📖"
		case "edition":
			cat.Icon = "📚"
		default:
			cat.Icon = "🏷️"
		}
	}

	if err := database.DB.Create(&cat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "创建分类失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "分类创建成功",
		"data":    cat,
	})
}

// UpdateCategory 后台更新分类
func (h *CategoryHandler) UpdateCategory(c fiber.Ctx) error {
	id := c.Params("id")
	var existing model.Category
	if err := database.DB.First(&existing, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "分类不存在",
		})
	}

	var req model.Category
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误",
		})
	}

	if req.Name != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	if req.Slug != "" {
		existing.Slug = strings.TrimSpace(strings.ToLower(req.Slug))
	}
	if req.Type != "" {
		existing.Type = strings.TrimSpace(strings.ToLower(req.Type))
	}
	if req.Icon != "" {
		existing.Icon = strings.TrimSpace(req.Icon)
	}
	existing.SortOrder = req.SortOrder
	existing.IsHot = req.IsHot
	existing.ParentID = req.ParentID

	if err := database.DB.Save(&existing).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "更新分类失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "分类更新成功",
		"data":    existing,
	})
}

// ToggleCategoryHot 切换分类热门/常用推荐状态
func (h *CategoryHandler) ToggleCategoryHot(c fiber.Ctx) error {
	id := c.Params("id")
	var cat model.Category
	if err := database.DB.First(&cat, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "分类不存在",
		})
	}

	cat.IsHot = !cat.IsHot
	if err := database.DB.Model(&cat).Update("is_hot", cat.IsHot).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "更新推荐状态失败: " + err.Error(),
		})
	}

	stateText := "已标记为热门/常用"
	if !cat.IsHot {
		stateText = "已取消热门/常用"
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("分类【%s】%s", cat.Name, stateText),
		"is_hot":  cat.IsHot,
	})
}

// DeleteCategory 后台删除分类
func (h *CategoryHandler) DeleteCategory(c fiber.Ctx) error {
	id := c.Params("id")
	var cat model.Category
	if err := database.DB.First(&cat, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "分类不存在",
		})
	}

	// 检查关联资源
	var resCount int64
	database.DB.Model(&model.Resource{}).Where("category_id = ?", cat.ID).Count(&resCount)
	if resCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": fmt.Sprintf("该分类下关联了 %d 份资源，请先将对应资源转移至其他分类再删除", resCount),
		})
	}

	if err := database.DB.Delete(&cat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "删除失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "分类已成功删除",
	})
}

// ResetDefaultCategories 一键恢复并同步全套 K12 电子教材标准化分类字典
func (h *CategoryHandler) ResetDefaultCategories(c fiber.Ctx) error {
	if err := database.SeedStandardCategories(database.DB); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "恢复默认分类字典失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "🎉 全套全国中小学及高中标准化分类字典已成功初始化/同步！",
	})
}
