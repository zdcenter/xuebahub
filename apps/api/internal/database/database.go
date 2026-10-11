package database

import (
	"log"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"netdisk/api/internal/model"
)

var DB *gorm.DB

func Init(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	// 自动同步表结构
	if err := db.AutoMigrate(
		&model.AdminUser{},
		&model.Category{},
		&model.Channel{},
		&model.Resource{},
		&model.ResourceLink{},
		&model.SearchLog{},
		&model.CrawledResource{},
		&model.NetdiskAccount{},
	); err != nil {
		log.Printf("AutoMigrate error: %v", err)
	}

	DB = db
	seedInitialData(db)
	return db, nil
}

func seedInitialData(db *gorm.DB) {
	// 0. 初始化默认管理员账号 (admin / admin123456)
	var userCount int64
	db.Model(&model.AdminUser{}).Count(&userCount)
	if userCount == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin123456"), bcrypt.DefaultCost)
		if err == nil {
			defaultAdmin := model.AdminUser{
				Username:     "admin",
				PasswordHash: string(hash),
				Nickname:     "超级管理员",
				Role:         "superadmin",
				IsActive:     true,
			}
			if err := db.Create(&defaultAdmin).Error; err == nil {
				log.Println("Seeded default admin user: admin / admin123456")
			}
		}
	}

	// 1. 初始化核心频道 (教辅 / 工具素材 / 怀旧单机游戏)
	var chanCount int64
	db.Model(&model.Channel{}).Count(&chanCount)
	if chanCount == 0 {
		channels := []model.Channel{
			{
				Slug:        "edu",
				Name:        "📚 刚需教辅与学习资料",
				Icon:        "📚",
				Description: "中小学同步教辅（人教版/期末冲刺/名校密卷）、奥数思维拓展、教师资格证、考公考研等刚需备考资源",
				SortOrder:   1,
				IsActive:    true,
			},
			{
				Slug:        "tools",
				Name:        "🎨 实用生产力工具与素材",
				Icon:        "🎨",
				Description: "精选职场PPT模版、平面设计免抠PNG素材、自媒体剪辑音效/BGM包、Python/办公自动化实用代码包",
				SortOrder:   2,
				IsActive:    true,
			},
			{
				Slug:        "games",
				Name:        "🎮 复古经典小游戏与整合包",
				Icon:        "🎮",
				Description: "经典街机FC模拟器合集、PS2单机经典整合、精选MOD模组免安装绿色整合包",
				SortOrder:   3,
				IsActive:    true,
			},
		}
		for _, ch := range channels {
			db.Where("slug = ?", ch.Slug).FirstOrCreate(&ch)
		}
		log.Println("Seeded initial channels: edu, tools, games")
	}

	// 补齐存量资源的 channel_slug (默认为 edu)
	db.Model(&model.Resource{}).Where("channel_slug IS NULL OR channel_slug = ''").Update("channel_slug", "edu")

	// 2. 初始化核心示范资源（如果为空）
	var resCount int64
	db.Model(&model.Resource{}).Count(&resCount)
	if resCount == 0 {
		res1 := model.Resource{
			Slug:          "2026-spring-grade3-math-final-exam",
			Title:         "2026春季人教版三年级下册数学期末冲刺夺冠押题卷（含高清解析与手写步骤）",
			Subtitle:      "名校名师联合精选必考压轴题，覆盖乘除法、面积计算、小数初步",
			Description:   "本套试卷专为三年级下册期末复习研发，包含3套名校期末全真模拟密卷及1套名师压轴重点突破卷。配有标准答题卡、手写解析与解题思路大纲，支持 A4 打印即练。",
			Stage:         "primary",
			Grade:         "三年级",
			Subject:       "数学",
			Edition:       "人教版",
			CoverImage:    "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&auto=format&fit=crop&q=80",
			PreviewImages: datatypes.JSON([]byte(`["https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&auto=format&fit=crop&q=80","https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80"]`)),
			FileType:      "PDF",
			FileSize:      "12.4 MB",
			PageCount:     28,
			ViewCount:     1520,
			SaveCount:     468,
			IsRecommended: true,
			IsPublished:   true,
			ExtraMetadata: datatypes.JSON([]byte(`{"year":"2026","term":"下学期","region":"全国统编","difficulty":"培优冲刺"}`)),
			Links: []model.ResourceLink{
				{
					DriveType:    "quark",
					ShareURL:     "https://pan.quark.cn/s/demo_quark_share",
					ExtractCode:  "",
					PasswordHint: "手机转存立享原画质",
					IsPrimary:    true,
				},
				{
					DriveType:    "baidu",
					ShareURL:     "https://pan.baidu.com/s/demo_baidu_share",
					ExtractCode:  "8888",
					PasswordHint: "提取码：8888",
					IsPrimary:    false,
				},
			},
		}

		db.Create(&res1)
		log.Println("Seeded initial demo learning resources!")
	}
}
