package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type SettingsHandler struct{}

func NewSettingsHandler() *SettingsHandler {
	return &SettingsHandler{}
}

// GetPublicSettings 前台公开获取系统全局配置
func (h *SettingsHandler) GetPublicSettings(c fiber.Ctx) error {
	var setting model.SiteSetting
	if err := database.DB.Where("id = ?", "global").First(&setting).Error; err != nil {
		// 返回兜底默认配置
		setting = model.SiteSetting{
			ID:                 "global",
			SiteName:           "学霸网",
			SiteTitle:          "学霸网 - 中小学同步教辅、网盘学习资源与考试真题平台",
			SiteSubtitle:       "中小学名校期末冲刺卷、人教版同步教辅、实用工具素材与精品网盘学习资料，支持A4高清打印与极速网盘转存。",
			Keywords:           "学霸网,xuebaw.com,网盘资源,中小学试卷下载,期末冲刺卷,人教版同步教辅,夸克网盘学习资料,百度网盘资源,考试真题",
			QQGroup:            "625248438",
			QQGroupURL:         "https://qm.qq.com/cgi-bin/qm/qr?k=&jump_from=webapi&authKey=&uin=625248438",
			ContactEmail:       "support@xuebaw.com",
			CopyrightText:      "© 2026 学霸网 (xuebaw.com). All rights reserved.",
			DisclaimerText:     "免责声明：本站所有资源均来自互联网公开平台与公开考试题型归纳整理，仅供个人学习研究交流使用，版权归原作者所有。",
			AnnouncementActive: false,
			AnnouncementText:   "📢 欢迎来到学霸网！2026 最新各省中考高三一模二模卷及人教版教辅资料正在每日批量更新中，建议收藏本站防走失。",
			AnnouncementBadge:  "HOT",
			AnnouncementType:   "blue",
		}
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": setting,
	})
}

// GetAdminSettings 管理后台获取系统全局配置
func (h *SettingsHandler) GetAdminSettings(c fiber.Ctx) error {
	var setting model.SiteSetting
	if err := database.DB.Where("id = ?", "global").First(&setting).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"code":    404,
			"message": "系统配置未初始化",
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": setting,
	})
}

// UpdateSettings 管理后台更新系统全局配置
func (h *SettingsHandler) UpdateSettings(c fiber.Ctx) error {
	var input model.SiteSetting
	if err := c.Bind().Body(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "无效的配置参数: " + err.Error(),
		})
	}

	var setting model.SiteSetting
	res := database.DB.Where("id = ?", "global").First(&setting)
	if res.Error != nil {
		// 不存在则创建
		input.ID = "global"
		input.UpdatedAt = time.Now()
		if err := database.DB.Create(&input).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"code":    500,
				"message": "创建系统配置失败: " + err.Error(),
			})
		}
		return c.JSON(fiber.Map{
			"code":    200,
			"message": "系统配置已保存",
			"data":    input,
		})
	}

	// 存在则更新所有字段
	setting.SiteName = input.SiteName
	setting.SiteTitle = input.SiteTitle
	setting.SiteSubtitle = input.SiteSubtitle
	setting.Keywords = input.Keywords
	setting.QQGroup = input.QQGroup
	setting.QQGroupURL = input.QQGroupURL
	setting.ContactEmail = input.ContactEmail
	setting.ContactWechat = input.ContactWechat
	setting.ICPBeian = input.ICPBeian
	setting.GongAnBeian = input.GongAnBeian
	setting.CopyrightText = input.CopyrightText
	setting.DisclaimerText = input.DisclaimerText
	setting.AnnouncementActive = input.AnnouncementActive
	setting.AnnouncementText = input.AnnouncementText
	setting.AnnouncementURL = input.AnnouncementURL
	setting.AnnouncementBadge = input.AnnouncementBadge
	setting.AnnouncementType = input.AnnouncementType
	setting.UpdatedAt = time.Now()

	if err := database.DB.Save(&setting).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "更新系统配置失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "系统配置更新成功",
		"data":    setting,
	})
}
