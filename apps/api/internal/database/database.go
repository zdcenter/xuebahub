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
	models := []interface{}{
		&model.Category{},
		&model.Channel{},
		&model.Collection{},
		&model.Resource{},
		&model.ResourceLink{},
		&model.SearchLog{},
		&model.CrawledResource{},
		&model.NetdiskAccount{},
		&model.NavMenu{},
		&model.Region{},
		&model.School{},
		&model.HotSearch{},
		&model.AdminUser{},
		&model.SiteSetting{},
		&model.ResourceRequest{},
		&model.TelegramConfig{},
		&model.TelegramChannel{},
		&model.TelegramBroadcastChannel{},
		&model.EmailConfig{},
		&model.EmailContact{},
		&model.EmailCampaignLog{},
		&model.SeoConfig{},
		&model.SeoPushLog{},
		&model.MemberLevel{},
		&model.FrontUser{},
		&model.ActivationCode{},
		&model.DailyQuotaLog{},
	}
	for _, m := range models {
		if err := db.AutoMigrate(m); err != nil {
			log.Printf("AutoMigrate model %T error: %v", m, err)
		}
	}

	// 显式保证 netdisk_accounts 关键字段存在（防止旧版数据库表缺失 uid / nickname 列导致更新保存失败）
	if err := db.Exec(`ALTER TABLE netdisk_accounts ADD COLUMN IF NOT EXISTS uid VARCHAR(100);`).Error; err != nil {
		log.Printf("Ensure netdisk_accounts.uid column error: %v", err)
	}
	if err := db.Exec(`ALTER TABLE netdisk_accounts ADD COLUMN IF NOT EXISTS nickname VARCHAR(100);`).Error; err != nil {
		log.Printf("Ensure netdisk_accounts.nickname column error: %v", err)
	}
	if err := db.Exec(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS collection_id UUID;`).Error; err != nil {
		log.Printf("Ensure resources.collection_id column error: %v", err)
	}
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_resources_collection_id ON resources (collection_id);`).Error; err != nil {
		log.Printf("Ensure idx_resources_collection_id index error: %v", err)
	}
	if err := db.Exec(`ALTER TABLE collections ADD COLUMN IF NOT EXISTS sort_mode VARCHAR(30) DEFAULT 'created_asc';`).Error; err != nil {
		log.Printf("Ensure collections.sort_mode column error: %v", err)
	}
	if err := db.Exec(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS collection_order INT DEFAULT 0;`).Error; err != nil {
		log.Printf("Ensure resources.collection_order column error: %v", err)
	}
	if err := db.Exec(`ALTER TABLE resource_drafts ADD COLUMN IF NOT EXISTS is_transferred BOOLEAN DEFAULT FALSE;`).Error; err != nil {
		log.Printf("Ensure resource_drafts.is_transferred column error: %v", err)
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

	// 1. 初始化核心频道 (教辅备考 & 电子教材专区)
	channels := []model.Channel{
		{
			Slug:        "edu",
			Name:        "刚需教辅与学习资料",
			Icon:        "📚",
			Description: "中小学同步教辅（人教版/期末冲刺/名校密卷）、奥数思维拓展、教师资格证、考公考研等刚需备考资源",
			SortOrder:   1,
			IsActive:    true,
		},
		{
			Slug:        "book",
			Name:        "统编电子教材专区",
			Icon:        "📖",
			Description: "全国小学、初中、高中全学科正版高清电子课本PDF，涵盖人教版、北师大版、苏教版等全版本教材",
			SortOrder:   2,
			IsActive:    true,
		},
	}
	for _, ch := range channels {
		db.Where("slug = ?", ch.Slug).FirstOrCreate(&ch)
	}

	// 自动纯化老频道名称，杜绝前端双重展示图标
	db.Exec(`UPDATE channels SET name = '刚需教辅与学习资料' WHERE slug = 'edu'`)
	db.Exec(`UPDATE channels SET name = '统编电子教材专区' WHERE slug = 'book'`)

	// 若旧 textbook 频道在库资料为 0，自动清理多余冗余频道
	var oldTextbookCount int64
	db.Model(&model.Resource{}).Where("channel_slug = ?", "textbook").Count(&oldTextbookCount)
	if oldTextbookCount == 0 {
		db.Where("slug = ?", "textbook").Delete(&model.Channel{})
	} else {
		// 若已有数据，平滑迁移关联资料到 book
		db.Model(&model.Resource{}).Where("channel_slug = ?", "textbook").Update("channel_slug", "book")
		db.Where("slug = ?", "textbook").Delete(&model.Channel{})
	}

	// 清理非学习业务频道 (如 tools, games)
	db.Where("slug IN (?)", []string{"tools", "games"}).Delete(&model.Channel{})
	log.Println("Seeded and normalized initial channels: edu, book")

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

	// 3. 初始化全域高频热搜关键词库（如果为空）
	var hotCount int64
	db.Model(&model.HotSearch{}).Count(&hotCount)
	if hotCount == 0 {
		initialHots := []model.HotSearch{
			{Title: "🎯 小升初择校密卷", Keyword: "小升初", Stage: "all", StyleType: "highlight", SortOrder: 1, IsActive: true},
			{Title: "📐 初中几何压轴", Keyword: "几何压轴", Stage: "all", StyleType: "default", SortOrder: 2, IsActive: true},
			{Title: "📈 2026新高考模考", Keyword: "模拟卷", Stage: "all", StyleType: "hot", SortOrder: 3, IsActive: true},
			{Title: "📝 高考导数大招", Keyword: "导数", Stage: "all", StyleType: "default", SortOrder: 4, IsActive: true},
			{Title: "🧑‍🏫 教师资格证统考", Keyword: "教师资格证", Stage: "all", StyleType: "default", SortOrder: 5, IsActive: true},
			{Title: "🏛️ 国考行测申论", Keyword: "公务员", Stage: "all", StyleType: "default", SortOrder: 6, IsActive: true},
			{Title: "🧮 小学奥数培优", Keyword: "奥数", Stage: "all", StyleType: "default", SortOrder: 7, IsActive: true},
			{Title: "📉 中考二次函数", Keyword: "二次函数", Stage: "all", StyleType: "default", SortOrder: 8, IsActive: true},
			{Title: "⚡ 人教期末冲刺", Keyword: "期末冲刺", Stage: "all", StyleType: "default", SortOrder: 9, IsActive: true},
			{Title: "⚡ 初二物理电学", Keyword: "物理电学", Stage: "all", StyleType: "default", SortOrder: 10, IsActive: true},
			{Title: "📐 圆锥曲线极值", Keyword: "圆锥曲线", Stage: "all", StyleType: "default", SortOrder: 11, IsActive: true},
			{Title: "📚 考研核心笔记", Keyword: "考研", Stage: "all", StyleType: "default", SortOrder: 12, IsActive: true},

			// primary
			{Title: "🎯 小升初择校密卷", Keyword: "小升初", Stage: "primary", StyleType: "highlight", SortOrder: 1, IsActive: true},
			{Title: "🧮 小学奥数培优", Keyword: "奥数", Stage: "primary", StyleType: "hot", SortOrder: 2, IsActive: true},
			{Title: "⚡ 人教期末冲刺", Keyword: "期末冲刺", Stage: "primary", StyleType: "default", SortOrder: 3, IsActive: true},
			{Title: "📖 满分作文公式", Keyword: "作文", Stage: "primary", StyleType: "default", SortOrder: 4, IsActive: true},
			{Title: "🔢 每天100道口算", Keyword: "口算速算", Stage: "primary", StyleType: "default", SortOrder: 5, IsActive: true},
			{Title: "📜 必背古诗75首", Keyword: "古诗文", Stage: "primary", StyleType: "default", SortOrder: 6, IsActive: true},
			{Title: "🏆 新初一分班摸底", Keyword: "分班考", Stage: "primary", StyleType: "default", SortOrder: 7, IsActive: true},

			// junior
			{Title: "📐 初中几何辅助线", Keyword: "几何压轴", Stage: "junior", StyleType: "highlight", SortOrder: 1, IsActive: true},
			{Title: "📉 二次函数压轴综合", Keyword: "二次函数", Stage: "junior", StyleType: "hot", SortOrder: 2, IsActive: true},
			{Title: "📘 中考历年真题分类", Keyword: "中考真题", Stage: "junior", StyleType: "default", SortOrder: 3, IsActive: true},
			{Title: "⚡ 初二物理电学实验", Keyword: "物理电学", Stage: "junior", StyleType: "default", SortOrder: 4, IsActive: true},
			{Title: "📝 中考满分作文范文", Keyword: "中考作文", Stage: "junior", StyleType: "default", SortOrder: 5, IsActive: true},
			{Title: "🧪 初中化学重点推断", Keyword: "化学方程式", Stage: "junior", StyleType: "default", SortOrder: 6, IsActive: true},
			{Title: "🔤 中考核心1600词", Keyword: "英语语法", Stage: "junior", StyleType: "default", SortOrder: 7, IsActive: true},

			// senior
			{Title: "📈 2026新高考一模密卷", Keyword: "模拟卷", Stage: "senior", StyleType: "highlight", SortOrder: 1, IsActive: true},
			{Title: "📝 高考导数切线大招", Keyword: "导数", Stage: "senior", StyleType: "hot", SortOrder: 2, IsActive: true},
			{Title: "📐 圆锥曲线极值速算", Keyword: "圆锥曲线", Stage: "senior", StyleType: "default", SortOrder: 3, IsActive: true},
			{Title: "🏆 九省联考真题手撕", Keyword: "九省联考", Stage: "senior", StyleType: "default", SortOrder: 4, IsActive: true},
			{Title: "⚡ 动量与电磁复合场", Keyword: "物理电磁", Stage: "senior", StyleType: "default", SortOrder: 5, IsActive: true},
			{Title: "🖋️ 新高考下水文精选", Keyword: "高考作文", Stage: "senior", StyleType: "default", SortOrder: 6, IsActive: true},
			{Title: "🧬 生物伴性遗传套路", Keyword: "遗传大题", Stage: "senior", StyleType: "default", SortOrder: 7, IsActive: true},

			// cert
			{Title: "📋 教师资格科目一合集", Keyword: "综合素质", Stage: "cert", StyleType: "highlight", SortOrder: 1, IsActive: true},
			{Title: "🧠 教育知识科二必背口诀", Keyword: "教育知识", Stage: "cert", StyleType: "hot", SortOrder: 2, IsActive: true},
			{Title: "🗣️ 教资面试结构化问答", Keyword: "结构化面试", Stage: "cert", StyleType: "default", SortOrder: 3, IsActive: true},
			{Title: "📝 试讲10分钟万能教案", Keyword: "试讲教案", Stage: "cert", StyleType: "default", SortOrder: 4, IsActive: true},
			{Title: "📚 学科知识与教学能力", Keyword: "科三真题", Stage: "cert", StyleType: "default", SortOrder: 5, IsActive: true},
			{Title: "🎙️ 普通话二甲备考资料", Keyword: "普通话", Stage: "cert", StyleType: "default", SortOrder: 6, IsActive: true},

			// exam
			{Title: "🏛️ 国考申论金句与范文", Keyword: "申论范文", Stage: "exam", StyleType: "highlight", SortOrder: 1, IsActive: true},
			{Title: "⚡ 行测数量与资料速算", Keyword: "行测速算", Stage: "exam", StyleType: "hot", SortOrder: 2, IsActive: true},
			{Title: "📕 考研政治肖秀荣背诵", Keyword: "考研政治", Stage: "exam", StyleType: "default", SortOrder: 3, IsActive: true},
			{Title: "🇬🇧 考研英语真题长难句", Keyword: "考研英语", Stage: "exam", StyleType: "default", SortOrder: 4, IsActive: true},
			{Title: "🔍 图形推理秒杀口诀", Keyword: "行测判断", Stage: "exam", StyleType: "default", SortOrder: 5, IsActive: true},
			{Title: "💡 公考常识必考200条", Keyword: "考公常识", Stage: "exam", StyleType: "default", SortOrder: 6, IsActive: true},
		}
		for _, h := range initialHots {
			db.Create(&h)
		}
		log.Println("Seeded initial hot searches!")
	}

	// 4. 初始化前台多级导航菜单（小学、初中、高中、考证、公考升学及其二级子项）
	var navCount int64
	db.Model(&model.NavMenu{}).Count(&navCount)
	if navCount == 0 {
		type NavSeedSub struct {
			Title       string
			LinkURL     string
			BadgeText   string
			Description string
			SortOrder   int
		}
		type NavSeedItem struct {
			Title              string
			Icon               string
			LinkURL            string
			BadgeText          string
			SortOrder          int
			IsSpecialHighlight bool
			Subs               []NavSeedSub
		}

		navSeeds := []NavSeedItem{
			{
				Title:     "小学专区",
				Icon:      "🎒",
				LinkURL:   "/primary",
				SortOrder: 1,
				Subs: []NavSeedSub{
					{Title: "🎯 小升初择校密卷", LinkURL: "/primary?q=小升初", BadgeText: "HOT", Description: "名校掐尖与分班考试真题", SortOrder: 1},
					{Title: "📖 人教版同步期末", LinkURL: "/primary?q=人教版", Description: "1-6年级语文数学英语单元冲刺卷", SortOrder: 2},
					{Title: "🧮 小学奥数思维培优", LinkURL: "/primary?q=奥数", Description: "奥数思维拓展与压轴思维模型", SortOrder: 3},
					{Title: "📝 满分作文公式精选", LinkURL: "/primary?q=作文", Description: "看图写话与叙事写景万能结构范文", SortOrder: 4},
				},
			},
			{
				Title:     "初中专区",
				Icon:      "📘",
				LinkURL:   "/junior",
				SortOrder: 2,
				Subs: []NavSeedSub{
					{Title: "📐 几何辅助线解题模型", LinkURL: "/junior?q=几何压轴", BadgeText: "必刷", Description: "圆与相似三角形12大压轴辅助线", SortOrder: 1},
					{Title: "📉 二次函数压轴综合", LinkURL: "/junior?q=二次函数", Description: "动点最值与解析几何综合突破", SortOrder: 2},
					{Title: "⚡ 初二物理电学实验", LinkURL: "/junior?q=物理电学", Description: "电路推断与压强浮力实验突破", SortOrder: 3},
					{Title: "📘 中考历年真题分类", LinkURL: "/junior?q=中考真题", BadgeText: "真题", Description: "近5年中考各科分类真题汇编", SortOrder: 4},
				},
			},
			{
				Title:              "高中专区",
				Icon:               "🎓",
				LinkURL:            "/senior",
				BadgeText:          "HOT",
				SortOrder:          3,
				IsSpecialHighlight: true,
				Subs: []NavSeedSub{
					{Title: "📈 2026新高考模考密卷", LinkURL: "/senior?q=模拟卷", BadgeText: "2026", Description: "九省联考与名校一模二模新高考卷", SortOrder: 1},
					{Title: "📝 高考导数切线大招", LinkURL: "/senior?q=导数", Description: "极值点偏移与函数单调性破解指南", SortOrder: 2},
					{Title: "📐 圆锥曲线极值速算", LinkURL: "/senior?q=圆锥曲线", Description: "韦达定理联立与设线设点公式技巧", SortOrder: 3},
					{Title: "🏆 九省联考真题手撕", LinkURL: "/senior?q=九省联考", Description: "全国新课标命题组题型深度解析", SortOrder: 4},
				},
			},
			{
				Title:     "教师资格证",
				Icon:      "📜",
				LinkURL:   "/cert",
				SortOrder: 4,
				Subs: []NavSeedSub{
					{Title: "🧑‍🏫 教师资格科目一合集", LinkURL: "/cert?q=综合素质", Description: "综合素质核心考点与材料分析题模板", SortOrder: 1},
					{Title: "🧠 教育知识必背口诀", LinkURL: "/cert?q=教育知识", BadgeText: "必背", Description: "科二高频人物与核心理论背诵手册", SortOrder: 2},
					{Title: "🗣️ 教资面试结构化问答", LinkURL: "/cert?q=结构化面试", Description: "结构化面试时政与教育突发问答范例", SortOrder: 3},
					{Title: "📝 试讲10分钟万能教案", LinkURL: "/cert?q=试讲教案", Description: "试讲10分钟板书设计与互动通关话术", SortOrder: 4},
				},
			},
			{
				Title:     "考公考研",
				Icon:      "🏛️",
				LinkURL:   "/exam",
				SortOrder: 5,
				Subs: []NavSeedSub{
					{Title: "🏛️ 国考申论金句与范文", LinkURL: "/exam?q=申论范文", BadgeText: "范文", Description: "大作文策论文立意模板与高分金句", SortOrder: 1},
					{Title: "⚡ 行测数量与资料速算", LinkURL: "/exam?q=行测速算", Description: "秒杀口诀与截位直除技巧速查笔记", SortOrder: 2},
					{Title: "📕 考研政治核心背诵", LinkURL: "/exam?q=考研政治", Description: "马原史纲毛中特高频重点提炼", SortOrder: 3},
					{Title: "🇬🇧 考研英语长难句拆解", LinkURL: "/exam?q=考研英语", Description: "历年考研英语真题长难句核心词汇精析", SortOrder: 4},
				},
			},
		}

		for _, item := range navSeeds {
			parent := model.NavMenu{
				Title:              item.Title,
				Icon:               item.Icon,
				LinkURL:            item.LinkURL,
				BadgeText:          item.BadgeText,
				SortOrder:          item.SortOrder,
				IsActive:           true,
				IsSpecialHighlight: item.IsSpecialHighlight,
			}
			if err := db.Create(&parent).Error; err == nil {
				for _, sub := range item.Subs {
					child := model.NavMenu{
						ParentID:    &parent.ID,
						Title:       sub.Title,
						LinkURL:     sub.LinkURL,
						BadgeText:   sub.BadgeText,
						Description: sub.Description,
						SortOrder:   sub.SortOrder,
						IsActive:    true,
					}
					db.Create(&child)
				}
			}
		}
		log.Println("Seeded initial nav menus and sub-menus successfully!")
	} else {
		// 全系统专区命名同步纠偏：将历史老旧专区名称无缝拉齐统一
		db.Model(&model.NavMenu{}).Where("title = ? OR link_url = ?", "考证专区", "/cert").Update("title", "教师资格证")
		db.Model(&model.NavMenu{}).Where("title = ? OR link_url = ?", "公考升学", "/exam").Update("title", "考公考研")
	}

	// 5. 初始化全局系统配置 (SiteSetting)
	var settingCount int64
	db.Model(&model.SiteSetting{}).Where("id = ?", "global").Count(&settingCount)
	if settingCount == 0 {
		defaultSetting := model.SiteSetting{
			ID:                 "global",
			SiteName:           "学霸网",
			SiteTitle:          "学霸网 - 中小学同步教辅、网盘学习资源与考试真题平台",
			SiteSubtitle:       "中小学名校期末冲刺卷、人教版同步教辅、实用工具素材与精品网盘学习资料，支持A4高清打印与极速网盘转存。",
			Keywords:           "学霸网,xuebaw.com,网盘资源,中小学试卷下载,期末冲刺卷,人教版同步教辅,夸克网盘学习资料,百度网盘资源,考试真题",
			QQGroup:            "625248438",
			QQGroupURL:         "https://qm.qq.com/cgi-bin/qm/qr?k=&jump_from=webapi&authKey=&uin=625248438",
			ContactEmail:       "support@xuebaw.com",
			ContactWechat:      "",
			ICPBeian:           "",
			GongAnBeian:        "",
			CopyrightText:      "© 2026 学霸网 (xuebaw.com). All rights reserved.",
			DisclaimerText:     "免责声明：本站所有资源均来自互联网公开平台与公开考试题型归纳整理，仅供个人学习研究交流使用，版权归原作者所有。",
			AnnouncementActive: false,
			AnnouncementText:   "📢 欢迎来到学霸网！2026 最新各省中考高三一模二模卷及人教版教辅资料正在每日批量更新中，建议收藏本站防走失。",
			AnnouncementURL:    "",
			AnnouncementBadge:  "HOT",
			AnnouncementType:   "blue",
		}
		if err := db.Create(&defaultSetting).Error; err == nil {
			log.Println("Seeded initial site settings successfully!")
		}
	}
	// 默认关闭会员与每日额度流控功能 (前台纯净放量，等流量做起来后随时可在管理后台一键开启)
	db.Model(&model.SiteSetting{}).Where("id = ?", "global").Update("member_system_enabled", false)

	// 6. 初始化求资料需求池示例数据 (ResourceRequest)
	var requestCount int64
	db.Model(&model.ResourceRequest{}).Count(&requestCount)
	if requestCount == 0 {
		sampleRequests := []model.ResourceRequest{
			{
				Title:         "2026年广州中考一模数学与物理全套试卷及答案解析",
				Stage:         "junior",
				Subject:       "数学/物理",
				Note:          "急需！下周就要模考了，希望能有带详细评分标准的高清 PDF 版本",
				Contact:       "student2026@qq.com",
				Status:        "pending",
				VoteCount:     15,
				ClientIP:      "127.0.0.1",
			},
			{
				Title:         "人教版八年级下册英语全优名卷单元期中期末密卷",
				Stage:         "junior",
				Subject:       "英语",
				Note:          "带听力音频 mp3 与听力原文最好，打印给孩子做练习",
				Contact:       "parent_gz@163.com",
				Status:        "fulfilled",
				FulfilledNote: "已在初中专区上架《人教版初二英语期末冲刺全优卷(含听力音频)》",
				VoteCount:     8,
				ClientIP:      "127.0.0.1",
			},
			{
				Title:         "2026版国家公务员考试申论高分范文批注精讲",
				Stage:         "exam",
				Subject:       "申论",
				Note:          "求最新国考省考真题配套的晨读背诵小册子",
				Contact:       "gongkao_win@qq.com",
				Status:        "pending",
				VoteCount:     23,
				ClientIP:      "127.0.0.1",
			},
		}
		for _, req := range sampleRequests {
			db.Create(&req)
		}
		log.Println("Seeded initial sample resource requests successfully!")
	}

	// 10. 初始化 Telegram 机器人配置与监听频道字典
	var tgConfigCount int64
	db.Model(&model.TelegramConfig{}).Count(&tgConfigCount)
	if tgConfigCount == 0 {
		defaultTgConfig := model.TelegramConfig{
			BotToken:            "7315955834:AAEr_bxkFhKheGyYzNZ_3Mzwskl8TrTuHYA",
			BotUsername:         "demoMovieFind_bot",
			AutoSync:            true,
			SyncIntervalSeconds: 60,
			LastSyncStatus:      "idle",
			LastSyncMessage:     "初始化就绪，等待拉取消息",
		}
		db.Create(&defaultTgConfig)
		log.Println("Seeded default TelegramConfig successfully!")
	}

	var tgChannelCount int64
	db.Model(&model.TelegramChannel{}).Count(&tgChannelCount)
	if tgChannelCount == 0 {
		channels := []model.TelegramChannel{
			{
				ChannelID: "-1002250092204",
				Name:      "夸克网盘频道",
				DriveType: "quark",
				IsActive:  true,
				Remark:    "夸克学习资料与热播资源聚合频道",
			},
			{
				ChannelID: "-1002272237173",
				Name:      "百度网盘频道",
				DriveType: "baidu",
				IsActive:  true,
				Remark:    "百度网盘教辅真题与名师视频频道",
			},
			{
				ChannelID: "-1002345901411",
				Name:      "阿里网盘频道",
				DriveType: "alipan",
				IsActive:  true,
				Remark:    "阿里云盘原画无损大容量资料共享",
			},
		}
		for _, ch := range channels {
			db.Create(&ch)
		}
		log.Println("Seeded default Telegram channels successfully!")
	}

	// 11. 初始化演示采集草稿数据
	var draftCount int64
	db.Model(&model.ResourceDraft{}).Count(&draftCount)
	if draftCount == 0 {
		sampleDrafts := []model.ResourceDraft{
			{
				Title:       "2026新版初中数理化公式定理概念精练大全(附中考易错题)",
				SourceName:  "夸克网盘频道",
				ChannelID:   "-1002250092204",
				DriveType:   "quark",
				ShareURL:    "https://pan.quark.cn/s/c9876543210a",
				ExtractCode: "",
				FileSize:    "45.8 MB",
				RawText:     "【夸克专享】2026新版初中数理化公式定理概念精练大全(附中考易错题)\n格式：矢量PDF高清版\n链接：https://pan.quark.cn/s/c9876543210a\n先保存到自己网盘，支持A4无损打印！",
				Status:      "pending",
				IsSafe:      true,
			},
			{
				Title:       "2026年秋季小学统编版一至六年级语文期末冲刺全优卷(含详细答案)",
				SourceName:  "百度网盘频道",
				ChannelID:   "-1002272237173",
				DriveType:   "baidu",
				ShareURL:    "https://pan.baidu.com/s/1a2b3c4d5e6f7g8h9j",
				ExtractCode: "xue8",
				FileSize:    "128.0 MB",
				RawText:     "🔥 期末备考福利：2026年秋季小学统编版一至六年级语文期末冲刺全优卷(含详细答案)\n内含：试卷PDF+答题卡+名校评分标准\n链接: https://pan.baidu.com/s/1a2b3c4d5e6f7g8h9j 提取码: xue8\n先转存后下载，防止链接失效！",
				Status:      "pending",
				IsSafe:      true,
			},
			{
				Title:       "2026版国家公务员考试行测高频考点速记图谱与真题微课",
				SourceName:  "阿里网盘频道",
				ChannelID:   "-1002345901411",
				DriveType:   "alipan",
				ShareURL:    "https://www.alipan.com/s/sampleAli9988",
				ExtractCode: "",
				FileSize:    "3.2 GB",
				RawText:     "2026版国家公务员考试行测高频考点速记图谱与真题微课合集\n包含全套高清4K视频微课，原画无卡顿！\nhttps://www.alipan.com/s/sampleAli9988\n抓紧转存！",
				Status:      "pending",
				IsSafe:      true,
			},
		}
		for _, d := range sampleDrafts {
			db.Create(&d)
		}
		log.Println("Seeded initial sample ResourceDrafts successfully!")
	}

	// 10. 初始化默认邮件发信配置
	var emailConfigCount int64
	db.Model(&model.EmailConfig{}).Count(&emailConfigCount)
	if emailConfigCount == 0 {
		defaultEmailConfig := model.EmailConfig{
			ID:              "global",
			SMTPHost:        "smtp.qq.com",
			SMTPPort:        465,
			SenderName:      "学霸网精选真题",
			SenderEmail:     "",
			DailyLimit:      500,
			IntervalSeconds: 1.5,
			IsEnabled:       true,
		}
		db.Create(&defaultEmailConfig)
		log.Println("Seeded default EmailConfig successfully!")
	}

	// 11. 初始化默认搜索引擎主动收录配置 (SeoConfig)
	var seoConfigCount int64
	db.Model(&model.SeoConfig{}).Count(&seoConfigCount)
	if seoConfigCount == 0 {
		defaultSeoConfig := model.SeoConfig{
			ID:                "global",
			SiteDomain:        "https://www.xuebaw.com",
			BaiduToken:        "",
			BaiduActive:       true,
			BingApiKey:        "7f8a9b2c3d4e5f60718293a4b5c6d7e8",
			BingActive:        true,
			AutoPushOnPublish: true,
			DailyPushLimit:    100000,
			BaiduRemainQuota:  100000,
		}
		db.Create(&defaultSeoConfig)
		log.Println("Seeded default SeoConfig successfully!")
	} else {
		db.Model(&model.SeoConfig{}).
			Where("site_domain IN ?", []string{"https://xuebaw.com", "http://xuebaw.com", "http://www.xuebaw.com", ""}).
			Update("site_domain", "https://www.xuebaw.com")
	}

	// 12. 自动检查并同步标准化全国 K12 电子教材全套分类体系
	if err := SeedStandardCategories(db); err != nil {
		log.Printf("SeedStandardCategories error: %v", err)
	}
}

// SeedStandardCategories 初始化并标准化全套 K12 电子教材核心分类字典（学段、年级、学期、学科、教材版本）
func SeedStandardCategories(db *gorm.DB) error {
	// 1. 学段 (stage) - 统一定义标准学段专区
	stages := []model.Category{
		{Name: "小学阶段", Slug: "primary", Type: "stage", SortOrder: 1, Icon: "🎒", IsHot: true},
		{Name: "初中阶段", Slug: "junior", Type: "stage", SortOrder: 2, Icon: "📘", IsHot: true},
		{Name: "高中阶段", Slug: "senior", Type: "stage", SortOrder: 3, Icon: "🎓", IsHot: true},
		{Name: "幼小衔接", Slug: "kindergarten", Type: "stage", SortOrder: 4, Icon: "🧸", IsHot: false},
		{Name: "教师资格证", Slug: "cert", Type: "stage", SortOrder: 5, Icon: "📜", IsHot: true},
		{Name: "考公考研", Slug: "exam", Type: "stage", SortOrder: 6, Icon: "🏛️", IsHot: true},
		{Name: "学科经典与拓展", Slug: "classic", Type: "stage", SortOrder: 7, Icon: "🏛️", IsHot: true},
	}

	stageIdMap := make(map[string]uint)
	for _, item := range stages {
		var existing model.Category
		err := db.Where("slug = ?", item.Slug).First(&existing).Error
		if err != nil {
			if createErr := db.Create(&item).Error; createErr == nil {
				stageIdMap[item.Slug] = item.ID
			}
		} else {
			existing.Name = item.Name
			existing.Type = item.Type
			existing.SortOrder = item.SortOrder
			existing.Icon = item.Icon
			existing.IsHot = item.IsHot
			db.Save(&existing)
			stageIdMap[item.Slug] = existing.ID
		}
	}

	primaryID := stageIdMap["primary"]
	juniorID := stageIdMap["junior"]
	seniorID := stageIdMap["senior"]
	classicID := stageIdMap["classic"]

	// 2. 年级与其余分类
	type CategorySeedWithParent struct {
		model.Category
		ParentStageSlug string
	}

	otherCategories := []CategorySeedWithParent{
		// 2. 年级 (grade) - 精准归属各学段
		{Category: model.Category{Name: "一年级", Slug: "grade-1", Type: "grade", SortOrder: 1, Icon: "🎒", IsHot: true}, ParentStageSlug: "primary"},
		{Category: model.Category{Name: "二年级", Slug: "grade-2", Type: "grade", SortOrder: 2, Icon: "🎒", IsHot: true}, ParentStageSlug: "primary"},
		{Category: model.Category{Name: "三年级", Slug: "grade-3", Type: "grade", SortOrder: 3, Icon: "🎒", IsHot: true}, ParentStageSlug: "primary"},
		{Category: model.Category{Name: "四年级", Slug: "grade-4", Type: "grade", SortOrder: 4, Icon: "🎒", IsHot: true}, ParentStageSlug: "primary"},
		{Category: model.Category{Name: "五年级", Slug: "grade-5", Type: "grade", SortOrder: 5, Icon: "🎒", IsHot: true}, ParentStageSlug: "primary"},
		{Category: model.Category{Name: "六年级", Slug: "grade-6", Type: "grade", SortOrder: 6, Icon: "🎒", IsHot: true}, ParentStageSlug: "primary"},
		{Category: model.Category{Name: "七年级", Slug: "grade-7", Type: "grade", SortOrder: 7, Icon: "📘", IsHot: true}, ParentStageSlug: "junior"},
		{Category: model.Category{Name: "八年级", Slug: "grade-8", Type: "grade", SortOrder: 8, Icon: "📘", IsHot: true}, ParentStageSlug: "junior"},
		{Category: model.Category{Name: "九年级", Slug: "grade-9", Type: "grade", SortOrder: 9, Icon: "📘", IsHot: true}, ParentStageSlug: "junior"},
		{Category: model.Category{Name: "高一", Slug: "grade-10", Type: "grade", SortOrder: 10, Icon: "🎓", IsHot: true}, ParentStageSlug: "senior"},
		{Category: model.Category{Name: "高二", Slug: "grade-11", Type: "grade", SortOrder: 11, Icon: "🎓", IsHot: true}, ParentStageSlug: "senior"},
		{Category: model.Category{Name: "高三", Slug: "grade-12", Type: "grade", SortOrder: 12, Icon: "🎓", IsHot: true}, ParentStageSlug: "senior"},
		{Category: model.Category{Name: "通用/典藏", Slug: "grade-classic-general", Type: "grade", SortOrder: 13, Icon: "🏛️", IsHot: true}, ParentStageSlug: "classic"},
		{Category: model.Category{Name: "文史政典籍", Slug: "grade-classic-history", Type: "grade", SortOrder: 14, Icon: "📜", IsHot: true}, ParentStageSlug: "classic"},
		{Category: model.Category{Name: "大学数理经典", Slug: "grade-classic-mathphys", Type: "grade", SortOrder: 15, Icon: "⚡", IsHot: true}, ParentStageSlug: "classic"},
		{Category: model.Category{Name: "竞赛奥赛培优", Slug: "grade-classic-olympiad", Type: "grade", SortOrder: 16, Icon: "🏆", IsHot: true}, ParentStageSlug: "classic"},
		{Category: model.Category{Name: "通识科学人文", Slug: "grade-classic-general-studies", Type: "grade", SortOrder: 17, Icon: "💡", IsHot: true}, ParentStageSlug: "classic"},

		// 3. 学期 / 分册 (term)
		{Category: model.Category{Name: "上册", Slug: "term-up", Type: "term", SortOrder: 1, Icon: "🍂", IsHot: true}},
		{Category: model.Category{Name: "下册", Slug: "term-down", Type: "term", SortOrder: 2, Icon: "🌸", IsHot: true}},
		{Category: model.Category{Name: "全一册", Slug: "term-full", Type: "term", SortOrder: 3, Icon: "📘", IsHot: false}},
		{Category: model.Category{Name: "必修·第一册", Slug: "term-bx-1", Type: "term", SortOrder: 4, Icon: "📕", IsHot: true}},
		{Category: model.Category{Name: "必修·第二册", Slug: "term-bx-2", Type: "term", SortOrder: 5, Icon: "📕", IsHot: true}},
		{Category: model.Category{Name: "必修·第三册", Slug: "term-bx-3", Type: "term", SortOrder: 6, Icon: "📕", IsHot: false}},
		{Category: model.Category{Name: "选择性必修·第一册", Slug: "term-xx-1", Type: "term", SortOrder: 7, Icon: "📗", IsHot: true}},
		{Category: model.Category{Name: "选择性必修·第二册", Slug: "term-xx-2", Type: "term", SortOrder: 8, Icon: "📗", IsHot: false}},
		{Category: model.Category{Name: "选择性必修·第三册", Slug: "term-xx-3", Type: "term", SortOrder: 9, Icon: "📗", IsHot: false}},

		// 4. 学科 (subject)
		{Category: model.Category{Name: "语文", Slug: "subject-chinese", Type: "subject", SortOrder: 1, Icon: "📖", IsHot: true}},
		{Category: model.Category{Name: "数学", Slug: "subject-math", Type: "subject", SortOrder: 2, Icon: "📐", IsHot: true}},
		{Category: model.Category{Name: "英语", Slug: "subject-english", Type: "subject", SortOrder: 3, Icon: "🔤", IsHot: true}},
		{Category: model.Category{Name: "科学", Slug: "subject-science", Type: "subject", SortOrder: 4, Icon: "🔬", IsHot: true}},
		{Category: model.Category{Name: "道德与法治", Slug: "subject-morality", Type: "subject", SortOrder: 5, Icon: "⚖️", IsHot: true}},
		{Category: model.Category{Name: "物理", Slug: "subject-physics", Type: "subject", SortOrder: 6, Icon: "⚡", IsHot: true}},
		{Category: model.Category{Name: "化学", Slug: "subject-chemistry", Type: "subject", SortOrder: 7, Icon: "🧪", IsHot: true}},
		{Category: model.Category{Name: "生物", Slug: "subject-biology", Type: "subject", SortOrder: 8, Icon: "🧬", IsHot: true}},
		{Category: model.Category{Name: "历史", Slug: "subject-history", Type: "subject", SortOrder: 9, Icon: "📜", IsHot: false}},
		{Category: model.Category{Name: "地理", Slug: "subject-geography", Type: "subject", SortOrder: 10, Icon: "🌍", IsHot: false}},
		{Category: model.Category{Name: "思想政治", Slug: "subject-politics", Type: "subject", SortOrder: 11, Icon: "🏛️", IsHot: false}},
		{Category: model.Category{Name: "信息技术/编程", Slug: "subject-it", Type: "subject", SortOrder: 12, Icon: "💻", IsHot: false}},
		{Category: model.Category{Name: "奥数与思维培优", Slug: "subject-olympiad", Type: "subject", SortOrder: 13, Icon: "🧠", IsHot: true}},
		{Category: model.Category{Name: "文史政经典", Slug: "subject-classic-humanities", Type: "subject", SortOrder: 14, Icon: "📜", IsHot: true}},
		{Category: model.Category{Name: "大学物理与数理", Slug: "subject-classic-mathphys", Type: "subject", SortOrder: 15, Icon: "⚡", IsHot: true}},
		{Category: model.Category{Name: "学科竞赛培优", Slug: "subject-olympiad-advanced", Type: "subject", SortOrder: 16, Icon: "🏆", IsHot: true}},
		{Category: model.Category{Name: "通识科学人文", Slug: "subject-general-studies", Type: "subject", SortOrder: 17, Icon: "💡", IsHot: true}},

		// 5. 教材版本 (edition)
		{Category: model.Category{Name: "人教版 (教育部统编)", Slug: "edition-renjiao", Type: "edition", SortOrder: 1, Icon: "📚", IsHot: true}},
		{Category: model.Category{Name: "北师大版 (BNU)", Slug: "edition-beishida", Type: "edition", SortOrder: 2, Icon: "📚", IsHot: true}},
		{Category: model.Category{Name: "苏教版 (江苏凤凰)", Slug: "edition-sujiao", Type: "edition", SortOrder: 3, Icon: "📚", IsHot: true}},
		{Category: model.Category{Name: "外研版 (英语)", Slug: "edition-waiyan", Type: "edition", SortOrder: 4, Icon: "🔤", IsHot: true}},
		{Category: model.Category{Name: "译林版 (英语)", Slug: "edition-yilin", Type: "edition", SortOrder: 5, Icon: "🔤", IsHot: true}},
		{Category: model.Category{Name: "沪教版 (上海教育)", Slug: "edition-hujiao", Type: "edition", SortOrder: 6, Icon: "📚", IsHot: false}},
		{Category: model.Category{Name: "鲁教版 (山东教育)", Slug: "edition-lujiao", Type: "edition", SortOrder: 7, Icon: "📚", IsHot: false}},
		{Category: model.Category{Name: "冀教版 (河北教育)", Slug: "edition-jijiao", Type: "edition", SortOrder: 8, Icon: "📚", IsHot: false}},
		{Category: model.Category{Name: "湘教版 (湖南教育)", Slug: "edition-xiangjiao", Type: "edition", SortOrder: 9, Icon: "📚", IsHot: false}},
		{Category: model.Category{Name: "粤教版 (广东教育)", Slug: "edition-yuejiao", Type: "edition", SortOrder: 10, Icon: "📚", IsHot: false}},
		{Category: model.Category{Name: "仁爱版 (英语)", Slug: "edition-renai", Type: "edition", SortOrder: 11, Icon: "🔤", IsHot: false}},
		{Category: model.Category{Name: "教科版 (科学为主)", Slug: "edition-jiaoke", Type: "edition", SortOrder: 12, Icon: "🔬", IsHot: false}},
		{Category: model.Category{Name: "浙教版 (浙江教育)", Slug: "edition-zhejiao", Type: "edition", SortOrder: 13, Icon: "📚", IsHot: false}},
		{Category: model.Category{Name: "权威典藏全集版", Slug: "edition-classic-complete", Type: "edition", SortOrder: 14, Icon: "📚", IsHot: true}},
		{Category: model.Category{Name: "影印原著权威版", Slug: "edition-classic-facsimile", Type: "edition", SortOrder: 15, Icon: "📚", IsHot: true}},
		{Category: model.Category{Name: "大学名校教材版", Slug: "edition-university-standard", Type: "edition", SortOrder: 16, Icon: "🎓", IsHot: true}},
		{Category: model.Category{Name: "中学生竞赛培优版", Slug: "edition-olympiad-training", Type: "edition", SortOrder: 17, Icon: "🏆", IsHot: true}},
	}

	for _, item := range otherCategories {
		cat := item.Category
		if item.ParentStageSlug == "primary" && primaryID > 0 {
			cat.ParentID = &primaryID
		} else if item.ParentStageSlug == "junior" && juniorID > 0 {
			cat.ParentID = &juniorID
		} else if item.ParentStageSlug == "senior" && seniorID > 0 {
			cat.ParentID = &seniorID
		} else if item.ParentStageSlug == "classic" && classicID > 0 {
			cat.ParentID = &classicID
		}

		var existing model.Category
		err := db.Where("slug = ?", cat.Slug).First(&existing).Error
		if err != nil {
			if createErr := db.Create(&cat).Error; createErr != nil {
				log.Printf("Create category %s error: %v", cat.Slug, createErr)
			}
		} else {
			existing.Name = cat.Name
			existing.Type = cat.Type
			existing.SortOrder = cat.SortOrder
			existing.Icon = cat.Icon
			existing.IsHot = cat.IsHot
			if cat.ParentID != nil {
				existing.ParentID = cat.ParentID
			}
			db.Save(&existing)
		}
	}

	log.Printf("Standardized K12 categories seeded/updated successfully (%d stages, %d items)", len(stages), len(otherCategories))

	// 12. 初始化默认会员角色与额度体系 (member_levels)
	defaultLevels := []model.MemberLevel{
		{
			ID:          "guest",
			Name:        "游客访问",
			DailyQuota:  5,
			Color:       "slate",
			BadgeText:   "游客",
			PriceHint:   "免费",
			Description: "免登录体验，每日可直达获取 5 次网盘学习资源",
			IsDefault:   false,
			IsEnabled:   true,
			SortOrder:   1,
		},
		{
			ID:          "user",
			Name:        "普通会员",
			DailyQuota:  15,
			Color:       "blue",
			BadgeText:   "注册会员",
			PriceHint:   "免费注册",
			Description: "登录即送，每日可直达获取 15 次网盘学习资源",
			IsDefault:   true,
			IsEnabled:   true,
			SortOrder:   2,
		},
		{
			ID:          "vip_month",
			Name:        "学霸月卡 VIP",
			DailyQuota:  60,
			Color:       "emerald",
			BadgeText:   "月卡VIP",
			PriceHint:   "¥9.9/月",
			Description: "考前冲刺突击神器，每日享 60 次高速直达额度",
			IsDefault:   false,
			IsEnabled:   true,
			SortOrder:   3,
		},
		{
			ID:          "vip_year",
			Name:        "尊享年卡 VIP",
			DailyQuota:  200,
			Color:       "amber",
			BadgeText:   "年卡VIP",
			PriceHint:   "¥39.9/年",
			Description: "教辅老师与重度备考首选，每日享 200 次高速直达额度",
			IsDefault:   false,
			IsEnabled:   true,
			SortOrder:   4,
		},
		{
			ID:          "vip_lifetime",
			Name:        "终身至尊 VIP",
			DailyQuota:  -1,
			Color:       "purple",
			BadgeText:   "终身SVIP",
			PriceHint:   "¥69.9/终身",
			Description: "一次开通终身受用，每日无限次免限制高速直达",
			IsDefault:   false,
			IsEnabled:   true,
			SortOrder:   5,
		},
	}
	for _, lvl := range defaultLevels {
		var existing model.MemberLevel
		if err := db.Where("id = ?", lvl.ID).First(&existing).Error; err != nil {
			if createErr := db.Create(&lvl).Error; createErr != nil {
				log.Printf("Create default MemberLevel %s error: %v", lvl.ID, createErr)
			}
		}
	}
	log.Printf("Member levels checked and initialized successfully (%d levels)", len(defaultLevels))

	return nil
}



