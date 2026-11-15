package main

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"netdisk/api/internal/config"
	"netdisk/api/internal/database"
	"netdisk/api/internal/handler"
	"netdisk/api/internal/middleware"
	"netdisk/api/internal/service"
)

func main() {
	cfg := config.Load()

	// 初始化 PostgreSQL 数据库
	_, err := database.Init(cfg.DatabaseURL)
	if err != nil {
		log.Printf("Warning: Database connection failed: %v. Running in offline/mock mode.", err)
	}

	app := fiber.New(fiber.Config{
		AppName: "Netdisk Learning Resource Hub API v1.0",
	})

	// 中间件
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
	}))

	// 注册服务与处理器
	authH := handler.NewAuthHandler(cfg)
	netdiskParser := service.NewNetdiskParserService()
	netdiskChecker := service.NewNetdiskCheckerService(netdiskParser)
	coverGen := service.NewCoverGeneratorService()
	r2Service := service.NewR2Service(cfg)
	telegramCrawler := service.NewTelegramCrawlerService(database.DB, netdiskParser)
	crawlerH := handler.NewCrawlerHandler(telegramCrawler)
	seoService := service.NewSeoService(database.DB)
	seoH := handler.NewSeoHandler(seoService)
	resH := handler.NewResourceHandler(netdiskParser, netdiskChecker, coverGen, r2Service, telegramCrawler, seoService)
	searchAgg := service.NewSearchAggregatorService()
	searchH := handler.NewSearchHandler(searchAgg)
	quarkTransfer := service.NewQuarkTransferService()
	netdiskAccountH := handler.NewNetdiskAccountHandler(quarkTransfer)
	categoryH := handler.NewCategoryHandler()
	channelH := handler.NewChannelHandler()
	navMenuH := handler.NewNavMenuHandler()
	regionSchoolH := handler.NewRegionSchoolHandler(database.DB)
	statsH := handler.NewStatsHandler()
	hotSearchH := handler.NewHotSearchHandler()
	settingsH := handler.NewSettingsHandler()
	emailService := service.NewEmailService(database.DB)
	resourceRequestH := handler.NewResourceRequestHandler(emailService)
	emailH := handler.NewEmailHandler(emailService)
	aiService := service.NewAiService()
	aiH := handler.NewAiHandler(aiService)
	memberH := handler.NewMemberHandler(cfg)

	// API 路由设计
	api := app.Group("/api/v1")

	// 1. 公开端路由 (供前台 Astro 与 C端用户调用)
	public := api.Group("/public")
	public.Get("/categories", categoryH.ListPublicCategories)
	public.Get("/channels", channelH.ListPublicChannels)
	public.Get("/settings", settingsH.GetPublicSettings)
	public.Get("/nav-menus", navMenuH.ListPublicNavMenus)
	public.Get("/regions", regionSchoolH.ListRegions)
	public.Get("/schools", regionSchoolH.ListSchools)
	public.Get("/hot-searches", hotSearchH.ListPublicHotSearches)
	public.Get("/resources", resH.ListPublicResources)
	public.Get("/resources/:id_or_slug/cover.png", resH.GetPublicResourceCover)
	public.Get("/covers/:id_or_slug.png", resH.GetPublicResourceCover)
	public.Get("/resources/:id_or_slug", resH.GetPublicResourceDetail)
	public.Get("/resources/:id_or_slug/related", resH.GetPublicRelatedResources)
	public.Post("/resources/:id_or_slug/track-save", resH.TrackResourceSave)
	public.Post("/links/:link_id/save-click", resH.TrackSaveClick)
	public.Post("/links/:id/report", resH.ReportLink)
	public.Get("/search", searchH.GlobalSearch)
	public.Post("/requests", resourceRequestH.CreatePublicRequest)
	public.Get("/requests", resourceRequestH.ListPublicRequests)
	public.Post("/requests/:id/vote", resourceRequestH.VotePublicRequest)
	public.Post("/telegram/webhook", crawlerH.HandleTelegramWebhook)
	public.Get("/sitemap.xml", seoH.GetPublicSitemap)
	app.Get("/sitemap.xml", seoH.GetPublicSitemap)

	// 会员体系与每日额度流控 (公开与认证端)
	public.Post("/member/register", memberH.Register)
	public.Post("/member/login", memberH.Login)
	public.Get("/member/me", memberH.GetMe)
	public.Get("/member/quota-status", memberH.GetQuotaStatus)
	public.Post("/member/consume-quota", memberH.ConsumeQuota)
	public.Post("/member/redeem", memberH.Redeem)

	// 专属网盘直跳短链 (支持 https://xuebaw.com/goto/:slug 或 /s/:slug 直接 302 重定向)
	app.Get("/goto/:id_or_slug", resH.HandleSmartRedirect)
	public.Get("/goto/:id_or_slug", resH.HandleSmartRedirect)
	app.Get("/s/:id_or_slug", resH.HandleSmartRedirect)
	public.Get("/s/:id_or_slug", resH.HandleSmartRedirect)
	// IndexNow 密钥验证文件 (微软必应 IndexNow 协议要求 /{key}.txt 可访问)
	app.Get("/:keyfile", seoH.ServeIndexNowKeyFile)

	// 2. 认证路由
	api.Post("/auth/login", authH.Login)

	// 3. 后台管理路由 (必须携带合法 JWT 令牌)
	admin := api.Group("/admin", middleware.AuthMiddleware(cfg.JWTSecret))
	admin.Get("/me", authH.Me)
	admin.Put("/me/profile", authH.UpdateProfile)
	admin.Put("/me/password", authH.ChangePassword)
	admin.Get("/stats", statsH.GetDashboardStats)
	admin.Get("/settings", settingsH.GetAdminSettings)
	admin.Put("/settings", settingsH.UpdateSettings)
	admin.Get("/resources", resH.AdminListResources)
	admin.Post("/resources", resH.AdminCreateResource)
	admin.Post("/resources/batch-toggle", resH.AdminBatchTogglePublish)
	admin.Post("/resources/batch-delete", resH.AdminBatchDeleteResources)
	admin.Post("/resources/batch-import", resH.AdminBatchImportResources)
	admin.Put("/resources/:id", resH.AdminUpdateResource)
	admin.Patch("/resources/:id/stats", resH.AdminUpdateResourceStats)
	admin.Put("/resources/:id/stats", resH.AdminUpdateResourceStats)
	admin.Delete("/resources/:id", resH.AdminDeleteResource)
	admin.Patch("/resources/:id/toggle", resH.AdminTogglePublish)
	admin.Post("/resources/:id/toggle", resH.AdminTogglePublish)
	admin.Post("/parse-netdisk", resH.AdminParseNetdisk)
	admin.Post("/links/:id/check", resH.AdminCheckSingleLink)
	admin.Post("/links/batch-check", resH.AdminBatchCheckLinks)
	admin.Put("/links/:id/status", resH.AdminUpdateLinkStatus)
	admin.Post("/upload-cover", resH.AdminUploadCover)
	admin.Post("/upload-poster", resH.AdminUploadPoster)

	// 网站多级导航管理 (动态一级菜单、二级子项、拖拽排序与显隐)
	admin.Get("/nav-menus", navMenuH.ListAdminNavMenus)
	admin.Post("/nav-menus", navMenuH.CreateNavMenu)
	admin.Put("/nav-menus/:id", navMenuH.UpdateNavMenu)
	admin.Patch("/nav-menus/:id/toggle", navMenuH.ToggleNavMenu)
	admin.Delete("/nav-menus/:id", navMenuH.DeleteNavMenu)

	// 频道配置管理 (学习教辅 / 实用工具素材 / 怀旧单机游戏)
	admin.Get("/channels", channelH.ListAdminChannels)
	admin.Post("/channels", channelH.CreateChannel)
	admin.Put("/channels/:id", channelH.UpdateChannel)
	admin.Patch("/channels/:id/toggle", channelH.ToggleChannelActive)
	admin.Delete("/channels/:id", channelH.DeleteChannel)

	// 分类字典库管理 (学段、年级、学期/分册、学科、教材版本)
	admin.Get("/categories", categoryH.ListAdminCategories)
	admin.Post("/categories", categoryH.CreateCategory)
	admin.Put("/categories/:id", categoryH.UpdateCategory)
	admin.Patch("/categories/:id/toggle-hot", categoryH.ToggleCategoryHot)
	admin.Delete("/categories/:id", categoryH.DeleteCategory)
	admin.Post("/categories/reset-defaults", categoryH.ResetDefaultCategories)

	// 高频热搜关键词管理
	admin.Get("/hot-searches", hotSearchH.ListAdminHotSearches)
	admin.Post("/hot-searches", hotSearchH.CreateAdminHotSearch)
	admin.Post("/hot-searches/batch-toggle", hotSearchH.BatchToggleAdminHotSearches)
	admin.Post("/hot-searches/batch-delete", hotSearchH.BatchDeleteAdminHotSearches)
	admin.Put("/hot-searches/:id", hotSearchH.UpdateAdminHotSearch)
	admin.Patch("/hot-searches/:id/toggle", hotSearchH.ToggleAdminHotSearchStatus)
	admin.Delete("/hot-searches/:id", hotSearchH.DeleteAdminHotSearch)

	// 地区与名校字典库管理
	admin.Get("/regions", regionSchoolH.ListRegions)
	admin.Get("/schools", regionSchoolH.ListSchools)
	admin.Post("/schools", regionSchoolH.CreateSchool)
	admin.Delete("/schools/:id", regionSchoolH.DeleteSchool)

	// 求资料需求池管理
	admin.Get("/requests", resourceRequestH.ListAdminRequests)
	admin.Put("/requests/:id", resourceRequestH.UpdateAdminRequest)
	admin.Post("/requests/:id/notify", resourceRequestH.NotifyAdminRequest)
	admin.Delete("/requests/:id", resourceRequestH.DeleteAdminRequest)

	// 网盘账号管理与一键转存换链
	admin.Get("/netdisk/accounts", netdiskAccountH.ListAccounts)
	admin.Post("/netdisk/accounts", netdiskAccountH.SaveAccount)
	admin.Delete("/netdisk/accounts/:id", netdiskAccountH.DeleteAccount)
	admin.Post("/netdisk/accounts/:id/verify", netdiskAccountH.VerifyAccount)
	admin.Post("/netdisk/accounts/:id/default", netdiskAccountH.SetDefaultAccount)
	admin.Get("/netdisk/accounts/:id/folders", netdiskAccountH.ListFolders)
	admin.Post("/netdisk/accounts/:id/folders", netdiskAccountH.CreateFolder)
	admin.Delete("/netdisk/accounts/:id/folders/:fid", netdiskAccountH.DeleteFolder)
	admin.Post("/netdisk/transfer-share", netdiskAccountH.AutoTransferAndShare)
	admin.Get("/netdisk/default-account/files", netdiskAccountH.ListDefaultAccountFiles)
	admin.Post("/netdisk/default-account/create-share", netdiskAccountH.CreateShareFromDefaultAccount)

	// 电报智能采集与草稿池管理 (Crawler & Drafts Ingestion)
	admin.Get("/crawler/config", crawlerH.GetConfig)
	admin.Put("/crawler/config", crawlerH.UpdateConfig)
	admin.Patch("/crawler/toggle-master", crawlerH.ToggleMasterSwitch)
	admin.Post("/crawler/sync", crawlerH.SyncNow)
	admin.Get("/crawler/channels", crawlerH.ListChannels)
	admin.Post("/crawler/channels", crawlerH.CreateChannel)
	admin.Post("/crawler/channels/resolve", crawlerH.ResolveChannel)
	admin.Put("/crawler/channels/:id", crawlerH.UpdateChannel)
	admin.Patch("/crawler/channels/:id/toggle", crawlerH.ToggleChannel)
	admin.Delete("/crawler/channels/:id", crawlerH.DeleteChannel)
	admin.Get("/crawler/broadcast-channels", crawlerH.ListBroadcastChannels)
	admin.Post("/crawler/broadcast-channels", crawlerH.CreateBroadcastChannel)
	admin.Post("/crawler/broadcast-channels/resolve", crawlerH.ResolveBroadcastChannel)
	admin.Patch("/crawler/broadcast-channels/:id/toggle", crawlerH.ToggleBroadcastChannel)
	admin.Delete("/crawler/broadcast-channels/:id", crawlerH.DeleteBroadcastChannel)
	admin.Post("/crawler/broadcast/test", crawlerH.SendTestBroadcast)
	admin.Post("/crawler/broadcast/:resourceId", crawlerH.BroadcastResource)
	admin.Post("/crawler/webhook/register", crawlerH.RegisterWebhook)
	admin.Post("/crawler/webhook/remove", crawlerH.RemoveWebhook)
	admin.Get("/crawler/webhook/info", crawlerH.GetWebhookInfo)
	admin.Get("/crawler/drafts", crawlerH.ListDrafts)
	admin.Post("/crawler/drafts/ingest-text", crawlerH.IngestText)
	admin.Patch("/crawler/drafts/:id/status", crawlerH.UpdateDraftStatus)
	admin.Delete("/crawler/drafts/:id", crawlerH.DeleteDraft)
	admin.Post("/crawler/drafts/batch", crawlerH.BatchDraftAction)

	// 邮件营销与推广中枢 (Email Marketing & Contact Dispatch Hub)
	admin.Get("/email/config", emailH.GetConfig)
	admin.Put("/email/config", emailH.SaveConfig)
	admin.Post("/email/test", emailH.SendTest)
	admin.Post("/email/contacts/extract", emailH.ExtractContacts)
	admin.Get("/email/contacts", emailH.GetContacts)
	admin.Delete("/email/contacts/:id", emailH.DeleteContact)
	admin.Post("/email/contacts/batch-delete", emailH.BatchDeleteContacts)
	admin.Post("/email/campaign/send", emailH.SendCampaign)
	admin.Get("/email/campaigns", emailH.GetCampaignLogs)
	admin.Get("/email/stats", emailH.GetStats)

	// 搜索引擎批量收录与索引中枢 (Baidu Search & Bing IndexNow Hub)
	admin.Get("/seo/config", seoH.GetConfig)
	admin.Put("/seo/config", seoH.SaveConfig)
	admin.Post("/seo/push", seoH.BatchPush)
	admin.Post("/seo/push-all", seoH.PushAll)
	admin.Get("/seo/logs", seoH.GetLogs)
	admin.Get("/seo/stats", seoH.GetStats)
	admin.Post("/seo/cf-purge", seoH.PurgeCloudflare)

	// AI 大模型智能元数据与通俗副标题生成中枢 (Google Gemini & DeepSeek Studio)
	admin.Post("/ai/generate-meta", aiH.GenerateMeta)
	admin.Post("/ai/test-connection", aiH.TestConnection)

	// 会员等级规则、额度体系与卡密管理 (PostgreSQL member_levels & activation_codes)
	admin.Get("/member-levels", memberH.AdminListMemberLevels)
	admin.Post("/member-levels", memberH.AdminCreateMemberLevel)
	admin.Put("/member-levels/:id", memberH.AdminUpdateMemberLevel)
	admin.Get("/activation-codes", memberH.AdminListActivationCodes)
	admin.Post("/activation-codes/batch", memberH.AdminBatchGenerateCodes)
	admin.Put("/activation-codes/:id/void", memberH.AdminVoidActivationCode)
	admin.Get("/member-users", memberH.AdminListUsers)
	admin.Put("/member-users/:id", memberH.AdminUpdateUser)

	// 健康检查
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"service": "Go Fiber v3 Learning Hub API",
		})
	})

	// 启动后台定时死链自动巡检任务 (每 12 小时自动轻量探测存活性，保护前台无死链)
	go func() {
		// 启动后延迟 30 秒执行首次轻量巡检，避免与服务器启动抢占资源
		time.Sleep(30 * time.Second)
		log.Println("[NetdiskChecker] Starting initial background dead-link inspection...")
		opts := service.BatchCheckOptions{
			MinIntervalHours: 24, // 24小时冷却保护
			Force:            false,
			Limit:            50,
		}
		summary, err := netdiskChecker.RunBatchCheck(opts)
		if err != nil {
			log.Printf("[NetdiskChecker] Background check error: %v", err)
		} else {
			log.Printf("[NetdiskChecker] Background check completed: checked=%d, active=%d, invalid=%d, skipped=%d",
				summary.CheckedCount, summary.ActiveCount, summary.InvalidCount, summary.SkippedCount)
		}

		ticker := time.NewTicker(12 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			log.Println("[NetdiskChecker] Starting periodic background dead-link inspection...")
			s, err := netdiskChecker.RunBatchCheck(opts)
			if err != nil {
				log.Printf("[NetdiskChecker] Periodic check error: %v", err)
			} else {
				log.Printf("[NetdiskChecker] Periodic check completed: checked=%d, active=%d, invalid=%d, skipped=%d",
					s.CheckedCount, s.ActiveCount, s.InvalidCount, s.SkippedCount)
			}
		}
	}()

	log.Printf("Server starting on port %s...", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
