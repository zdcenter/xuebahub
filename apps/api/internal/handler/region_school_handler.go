package handler

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"netdisk/api/internal/model"
)

type RegionSchoolHandler struct {
	db *gorm.DB
}

func NewRegionSchoolHandler(db *gorm.DB) *RegionSchoolHandler {
	return &RegionSchoolHandler{db: db}
}

// ListRegions 获取所有省市/地区及关联名校树
func (h *RegionSchoolHandler) ListRegions(c fiber.Ctx) error {
	var regions []model.Region
	err := h.db.Preload("Schools", func(db *gorm.DB) *gorm.DB {
		return db.Order("sort_order ASC, id ASC")
	}).Order("sort_order ASC, id ASC").Find(&regions).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "获取地区名校列表失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"data":    regions,
		"message": "success",
	})
}

// ListSchools 查询名校列表（支持按 region_id、region_name 或 stage 过滤）
func (h *RegionSchoolHandler) ListSchools(c fiber.Ctx) error {
	query := h.db.Model(&model.School{}).
		Select("schools.*, regions.name as region_name").
		Joins("LEFT JOIN regions ON regions.id = schools.region_id")

	if regionID := c.Query("region_id"); regionID != "" {
		query = query.Where("schools.region_id = ?", regionID)
	}
	if regionName := c.Query("region_name"); regionName != "" {
		query = query.Where("regions.name = ?", regionName)
	}
	if stage := c.Query("stage"); stage != "" && stage != "all" {
		query = query.Where("schools.stage = ? OR schools.stage = 'all'", stage)
	}

	var schools []model.School
	if err := query.Order("regions.sort_order ASC, schools.sort_order ASC, schools.id ASC").Find(&schools).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "查询名校失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"data":    schools,
		"message": "success",
	})
}

type CreateSchoolRequest struct {
	RegionName string `json:"region_name"`
	SchoolName string `json:"school_name"`
	Stage      string `json:"stage"`
	IsHot      bool   `json:"is_hot"`
}

// CreateSchool 管理员录入新名校（若地区不存在自动创建）
func (h *RegionSchoolHandler) CreateSchool(c fiber.Ctx) error {
	var req CreateSchoolRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误: " + err.Error(),
		})
	}

	req.RegionName = strings.TrimSpace(req.RegionName)
	req.SchoolName = strings.TrimSpace(req.SchoolName)

	if req.RegionName == "" || req.SchoolName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "地区名称与学校名称均不能为空",
		})
	}

	school, err := EnsureRegionAndSchool(h.db, req.RegionName, req.SchoolName, req.Stage)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "保存学校失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"data":    school,
		"message": "名校添加成功",
	})
}

// DeleteSchool 删除名校记录
func (h *RegionSchoolHandler) DeleteSchool(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "缺少学校ID",
		})
	}

	if err := h.db.Delete(&model.School{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "删除失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "名校已删除",
	})
}

// EnsureRegionAndSchool 智能联动入库助手：如果地区或名校不存在则自动补充入库
func EnsureRegionAndSchool(db *gorm.DB, regionName, schoolName, stage string) (*model.School, error) {
	regionName = strings.TrimSpace(regionName)
	schoolName = strings.TrimSpace(schoolName)
	if regionName == "" || schoolName == "" {
		return nil, nil
	}

	// 1. 查找或创建 Region
	var region model.Region
	if err := db.Where("name = ?", regionName).First(&region).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			region = model.Region{
				Name:      regionName,
				SortOrder: 50,
				IsHot:     false,
			}
			if err := db.Create(&region).Error; err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}

	// 2. 查找或创建 School
	var school model.School
	if err := db.Where("region_id = ? AND name = ?", region.ID, schoolName).First(&school).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			if stage == "" || stage == "primary" {
				if strings.Contains(schoolName, "高中") || strings.Contains(schoolName, "高级中学") {
					stage = "senior"
				} else {
					stage = "junior"
				}
			}
			school = model.School{
				RegionID:  region.ID,
				Name:      schoolName,
				Stage:     stage,
				SortOrder: 50,
				IsHot:     false,
			}
			if err := db.Create(&school).Error; err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}

	school.RegionName = region.Name
	return &school, nil
}
