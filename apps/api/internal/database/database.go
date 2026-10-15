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
	}
	for _, m := range models {
		if err := db.AutoMigrate(m); err != nil {
			log.Printf("AutoMigrate model %T error: %v", m, err)
		}
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

	// 1. 初始化核心频道 (教辅备考)
	channels := []model.Channel{
		{
			Slug:        "edu",
			Name:        "📚 刚需教辅与学习资料",
			Icon:        "📚",
			Description: "中小学同步教辅（人教版/期末冲刺/名校密卷）、奥数思维拓展、教师资格证、考公考研等刚需备考资源",
			SortOrder:   1,
			IsActive:    true,
		},
	}
	for _, ch := range channels {
		db.Where("slug = ?", ch.Slug).FirstOrCreate(&ch)
	}
	// 彻底清理非教材类频道 (如 tools, games)
	db.Where("slug IN (?)", []string{"tools", "games"}).Delete(&model.Channel{})
	log.Println("Seeded and normalized initial channel: edu")

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
				Title:     "考证专区",
				Icon:      "📋",
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
				Title:     "公考升学",
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
}



