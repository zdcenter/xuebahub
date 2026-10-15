package handler

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type ResourceRequestHandler struct{}

func NewResourceRequestHandler() *ResourceRequestHandler {
	return &ResourceRequestHandler{}
}

// CreatePublicRequest C端用户前台提交找试卷/求资料需求
func (h *ResourceRequestHandler) CreatePublicRequest(c fiber.Ctx) error {
	type RequestInput struct {
		Title       string `json:"title"`
		Stage       string `json:"stage"`
		Subject     string `json:"subject"`
		Note        string `json:"note"`
		Description string `json:"description"`
		Contact     string `json:"contact"`
		ContactInfo string `json:"contact_info"`
	}

	var input RequestInput
	if err := c.Bind().Body(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请求参数格式错误: " + err.Error(),
		})
	}

	title := strings.TrimSpace(input.Title)
	if len(title) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请填写具体的资料或试卷名称 (至少2个字)",
		})
	}

	stage := strings.TrimSpace(input.Stage)
	if stage == "" {
		stage = "all"
	}

	note := strings.TrimSpace(input.Note)
	if note == "" {
		note = strings.TrimSpace(input.Description)
	}

	contact := strings.TrimSpace(input.Contact)
	if contact == "" {
		contact = strings.TrimSpace(input.ContactInfo)
	}

	req := model.ResourceRequest{
		Title:     title,
		Stage:     stage,
		Subject:   strings.TrimSpace(input.Subject),
		Note:      note,
		Contact:   contact,
		Status:    "pending",
		VoteCount: 1,
		ClientIP:  c.IP(),
	}

	if err := database.DB.Create(&req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "提交求资料失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "求资料需求已成功提交，站长将尽快寻找并优先排期上架！",
		"data":    req,
	})
}

// ListPublicRequests 前台展示最新热门需求或已满足动态 (隐去隐私联系方式)
func (h *ResourceRequestHandler) ListPublicRequests(c fiber.Ctx) error {
	var list []model.ResourceRequest
	query := database.DB.Model(&model.ResourceRequest{}).
		Where("status IN (?)", []string{"pending", "fulfilled"}).
		Order("created_at DESC").
		Limit(20)

	if err := query.Find(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取需求列表失败",
		})
	}

	// 隐私脱敏联系方式
	for i := range list {
		if list[i].Contact != "" {
			parts := strings.Split(list[i].Contact, "@")
			if len(parts) == 2 && len(parts[0]) > 2 {
				list[i].Contact = parts[0][:2] + "****@" + parts[1]
			} else if len(list[i].Contact) > 4 {
				list[i].Contact = list[i].Contact[:2] + "****" + list[i].Contact[len(list[i].Contact)-2:]
			} else {
				list[i].Contact = "***"
			}
		}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": list,
	})
}

// VotePublicRequest 前台为已有需求“+1 同求”
func (h *ResourceRequestHandler) VotePublicRequest(c fiber.Ctx) error {
	idParam := c.Params("id")
	reqUUID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的需求 ID",
		})
	}

	if err := database.DB.Model(&model.ResourceRequest{}).
		Where("id = ?", reqUUID).
		Update("vote_count", database.DB.Raw("vote_count + 1")).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "同求失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "已为您 +1 同求成功！",
	})
}

// ListAdminRequests 后台管理员需求池全量查询
func (h *ResourceRequestHandler) ListAdminRequests(c fiber.Ctx) error {
	status := c.Query("status", "all")
	stage := c.Query("stage", "all")
	q := strings.TrimSpace(c.Query("q", ""))

	query := database.DB.Model(&model.ResourceRequest{})
	if status != "all" && status != "" {
		query = query.Where("status = ?", status)
	}
	if stage != "all" && stage != "" {
		query = query.Where("stage = ?", stage)
	}
	if q != "" {
		query = query.Where("title ILIKE ? OR note ILIKE ? OR contact ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}

	var list []model.ResourceRequest
	if err := query.Order("created_at DESC").Find(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "查询求资料列表失败: " + err.Error(),
		})
	}

	// 统计各类状态数量
	type StatusCount struct {
		Status string `gorm:"column:status"`
		Count  int64  `gorm:"column:count"`
	}
	var counts []StatusCount
	database.DB.Model(&model.ResourceRequest{}).Select("status, count(*) as count").Group("status").Scan(&counts)

	countMap := map[string]int64{
		"all":       0,
		"pending":   0,
		"fulfilled": 0,
		"rejected":  0,
	}
	var total int64
	for _, sc := range counts {
		countMap[sc.Status] = sc.Count
		total += sc.Count
	}
	countMap["all"] = total

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"items":  list,
			"counts": countMap,
		},
	})
}

// UpdateAdminRequest 管理员处置求资料需求 (标记已满足/已上架、忽略、填写回复备注)
func (h *ResourceRequestHandler) UpdateAdminRequest(c fiber.Ctx) error {
	idParam := c.Params("id")
	reqUUID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的需求 ID",
		})
	}

	type UpdateInput struct {
		Status              string     `json:"status"`
		FulfilledNote       string     `json:"fulfilled_note"`
		FulfilledResourceID *uuid.UUID `json:"fulfilled_resource_id"`
	}

	var input UpdateInput
	if err := c.Bind().Body(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的参数格式",
		})
	}

	var req model.ResourceRequest
	if err := database.DB.Where("id = ?", reqUUID).First(&req).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "需求记录未找到",
		})
	}

	if input.Status != "" {
		req.Status = input.Status
	}
	req.FulfilledNote = input.FulfilledNote
	req.FulfilledResourceID = input.FulfilledResourceID
	req.UpdatedAt = time.Now()

	if err := database.DB.Save(&req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "更新需求状态失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "需求处置状态已保存",
		"data":    req,
	})
}

// DeleteAdminRequest 管理员删除求资料记录
func (h *ResourceRequestHandler) DeleteAdminRequest(c fiber.Ctx) error {
	idParam := c.Params("id")
	reqUUID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的需求 ID",
		})
	}

	if err := database.DB.Where("id = ?", reqUUID).Delete(&model.ResourceRequest{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "删除需求失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "需求已删除",
	})
}
