package handler

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type ChannelHandler struct{}

func NewChannelHandler() *ChannelHandler {
	return &ChannelHandler{}
}

// ChannelWithCount 包含资源统计的频道响应
type ChannelWithCount struct {
	model.Channel
	ResourceCount int64 `json:"resource_count"`
}

// ListPublicChannels 前台获取所有已上线的频道（仅 is_active = true）
func (h *ChannelHandler) ListPublicChannels(c fiber.Ctx) error {
	var channels []model.Channel
	if err := database.DB.Where("is_active = ?", true).
		Order("sort_order ASC, created_at ASC").
		Find(&channels).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取频道失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": channels,
	})
}

// ListAdminChannels 后台获取全量频道（包含隐藏频道与资源数量统计）
func (h *ChannelHandler) ListAdminChannels(c fiber.Ctx) error {
	var channels []model.Channel
	if err := database.DB.Order("sort_order ASC, created_at ASC").Find(&channels).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取频道列表失败: " + err.Error(),
		})
	}

	// 统计每个频道下的资源数
	type CountResult struct {
		ChannelSlug string `gorm:"column:channel_slug"`
		Total       int64  `gorm:"column:total"`
	}
	var counts []CountResult
	database.DB.Model(&model.Resource{}).
		Select("channel_slug, count(*) as total").
		Group("channel_slug").
		Scan(&counts)

	countMap := make(map[string]int64)
	for _, cr := range counts {
		countMap[cr.ChannelSlug] = cr.Total
	}

	res := make([]ChannelWithCount, len(channels))
	for i, ch := range channels {
		res[i] = ChannelWithCount{
			Channel:       ch,
			ResourceCount: countMap[ch.Slug],
		}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": res,
	})
}

// CreateChannel 后台创建频道
func (h *ChannelHandler) CreateChannel(c fiber.Ctx) error {
	var ch model.Channel
	if err := c.Bind().JSON(&ch); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误",
		})
	}

	ch.Slug = strings.TrimSpace(strings.ToLower(ch.Slug))
	ch.Name = strings.TrimSpace(ch.Name)

	if ch.Slug == "" || ch.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "频道标识 (Slug) 与频道名称不能为空",
		})
	}

	if ch.Icon == "" {
		ch.Icon = "📦"
	}

	var exists int64
	database.DB.Model(&model.Channel{}).Where("slug = ?", ch.Slug).Count(&exists)
	if exists > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "频道标识 '" + ch.Slug + "' 已存在，请更换",
		})
	}

	if err := database.DB.Create(&ch).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "创建频道失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "频道创建成功",
		"data":    ch,
	})
}

// UpdateChannel 后台更新频道
func (h *ChannelHandler) UpdateChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	chUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效频道ID"})
	}

	var existing model.Channel
	if err := database.DB.First(&existing, "id = ?", chUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "频道不存在"})
	}

	var req model.Channel
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if req.Name != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	if req.Icon != "" {
		existing.Icon = strings.TrimSpace(req.Icon)
	}
	existing.Description = req.Description
	existing.SortOrder = req.SortOrder
	existing.IsActive = req.IsActive

	if err := database.DB.Save(&existing).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "频道更新成功",
		"data":    existing,
	})
}

// ToggleChannelActive 一键上线/隐藏频道
func (h *ChannelHandler) ToggleChannelActive(c fiber.Ctx) error {
	idStr := c.Params("id")
	chUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效频道ID"})
	}

	var ch model.Channel
	if err := database.DB.First(&ch, "id = ?", chUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "频道不存在"})
	}

	ch.IsActive = !ch.IsActive
	if err := database.DB.Model(&ch).Update("is_active", ch.IsActive).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "切换上线状态失败: " + err.Error()})
	}

	statusText := "已上线（前台可见）"
	if !ch.IsActive {
		statusText = "已隐藏（前台不可见）"
	}

	return c.JSON(fiber.Map{
		"code":      200,
		"message":   "频道【" + ch.Name + "】" + statusText,
		"is_active": ch.IsActive,
	})
}

// DeleteChannel 删除频道
func (h *ChannelHandler) DeleteChannel(c fiber.Ctx) error {
	idStr := c.Params("id")
	chUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效频道ID"})
	}

	var ch model.Channel
	if err := database.DB.First(&ch, "id = ?", chUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "频道不存在"})
	}

	// 安全校验：该频道下是否有资源
	var resCount int64
	database.DB.Model(&model.Resource{}).Where("channel_slug = ?", ch.Slug).Count(&resCount)
	if resCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": fmt.Sprintf("该频道下尚有 %d 条资源，请先将对应资源迁移或删除后再删除频道", resCount),
		})
	}

	if err := database.DB.Delete(&ch).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "删除失败: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "频道已成功删除",
	})
}
