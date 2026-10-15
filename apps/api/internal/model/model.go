package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// AdminUser 管理员模型
type AdminUser struct {
	ID           uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Username     string     `gorm:"type:varchar(50);uniqueIndex;not null" json:"username"`
	PasswordHash string     `gorm:"type:varchar(255);not null" json:"-"`
	Nickname     string     `gorm:"type:varchar(50);default:'Admin'" json:"nickname"`
	Role         string     `gorm:"type:varchar(20);default:'superadmin'" json:"role"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// Category 分类与学段年级字典
type Category struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string    `gorm:"type:varchar(50);not null" json:"name"`
	Slug      string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"slug"`
	Type      string    `gorm:"type:varchar(30);index;not null" json:"type"` // stage, grade, subject, edition
	ParentID  *uint     `json:"parent_id"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	Icon      string    `gorm:"type:varchar(100)" json:"icon"`
	IsHot     bool      `gorm:"default:false" json:"is_hot"`
	CreatedAt time.Time `json:"created_at"`
}

// Channel 顶级频道模型（学习教辅备考）
type Channel struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Slug        string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"slug"` // edu
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`
	Icon        string    `gorm:"type:varchar(50);default:'📦'" json:"icon"`
	Description string    `gorm:"type:text" json:"description"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	IsActive    bool      `gorm:"default:true;index" json:"is_active"` // 上线 (true) / 隐藏 (false)
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Resource 核心学习资源主模型
type Resource struct {
	ID            uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Slug          string         `gorm:"type:varchar(120);uniqueIndex;not null" json:"slug"`
	ChannelSlug   string         `gorm:"type:varchar(50);default:'edu';index" json:"channel_slug"` // 所属顶级频道 slug (如: edu)
	Title         string         `gorm:"type:varchar(255);not null;index" json:"title"`
	Subtitle      string         `gorm:"type:varchar(255)" json:"subtitle"`
	Description   string         `gorm:"type:text" json:"description"`
	Stage         string         `gorm:"type:varchar(30);index;default:'general'" json:"stage"` // primary, junior, senior, cert, exam
	Grade         string         `gorm:"type:varchar(30);index" json:"grade"`                   // 一年级, 二年级, 初三, 高一, 通用
	Subject       string         `gorm:"type:varchar(30);index" json:"subject"`                 // 语文, 数学, 英语, 物理, 化学等
	Edition       string         `gorm:"type:varchar(50)" json:"edition"`                       // 人教版, 北师大版, 统编版等
	Region        string         `gorm:"type:varchar(100);index" json:"region"`                // 城市/地区，如 广西-柳州
	School        string         `gorm:"type:varchar(100);index" json:"school"`                // 目标名校，如 柳州十二中
	CategoryID    *uint          `json:"category_id"`
	Category      *Category      `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	CoverImage    string         `gorm:"type:text" json:"cover_image"`
	PreviewImages datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"preview_images"` // 试卷前1~3页高清无水印图
	FileType      string         `gorm:"type:varchar(20);default:'PDF'" json:"file_type"`
	FileSize      string         `gorm:"type:varchar(50)" json:"file_size"`
	PageCount     int            `gorm:"default:0" json:"page_count"`
	ViewCount     int            `gorm:"default:0" json:"view_count"`
	SaveCount     int            `gorm:"default:0" json:"save_count"`
	IsRecommended bool           `gorm:"default:false" json:"is_recommended"`
	IsPublished   bool           `gorm:"default:true" json:"is_published"`
	ExtraMetadata datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"extra_metadata"`
	FileTree      datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"file_tree"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`

	Links []ResourceLink `gorm:"foreignKey:ResourceID;constraint:OnDelete:CASCADE" json:"links,omitempty"`
}

// ResourceLink 网盘分发表
type ResourceLink struct {
	ID            uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ResourceID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"resource_id"`
	DriveType     string     `gorm:"type:varchar(30);not null" json:"drive_type"` // quark, baidu, xunlei, aliyun
	ShareURL      string     `gorm:"type:varchar(500);not null" json:"share_url"`
	ExtractCode   string     `gorm:"type:varchar(50)" json:"extract_code"`
	PasswordHint  string     `gorm:"type:varchar(100)" json:"password_hint"`
	IsPrimary     bool       `gorm:"default:false" json:"is_primary"`
	ClickCount    int        `gorm:"default:0" json:"click_count"`
	FileSize      string     `gorm:"type:varchar(50);default:'15.0 MB'" json:"file_size"`
	FileType      string     `gorm:"type:varchar(50);default:'PDF'" json:"file_type"`
	ResourceDesc  string     `gorm:"type:varchar(255)" json:"resource_desc"`
	Status        string     `gorm:"type:varchar(20);default:'active'" json:"status"` // active, reported, invalid
	ReportCount   int        `gorm:"default:0" json:"report_count"`
	InvalidReason string     `gorm:"type:varchar(255)" json:"invalid_reason"`
	LastCheckedAt *time.Time `json:"last_checked_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// SearchLog 搜索记录
type SearchLog struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Keyword     string    `gorm:"type:varchar(255);index;not null" json:"keyword"`
	ClientIP    string    `gorm:"type:varchar(64)" json:"client_ip"`
	ResultCount int       `gorm:"default:0" json:"result_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// TelegramConfig 电报机器人与采集全局配置模型
type TelegramConfig struct {
	ID                  uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	BotToken            string     `gorm:"type:varchar(255);not null" json:"bot_token"`
	BotUsername         string     `gorm:"type:varchar(100)" json:"bot_username"`
	SyncMode            string     `gorm:"type:varchar(30);default:'polling'" json:"sync_mode"` // polling (定时轮询), webhook (实时自动触发)
	WebhookURL          string     `gorm:"type:varchar(255)" json:"webhook_url"`
	ProxyURL            string     `gorm:"type:varchar(255)" json:"proxy_url"`                  // e.g. http://127.0.0.1:7897
	ApiBaseURL          string     `gorm:"type:varchar(255)" json:"api_base_url"`               // defaults to https://api.telegram.org
	AutoSync            bool       `gorm:"default:true" json:"auto_sync"`
	SyncIntervalSeconds int        `gorm:"default:60" json:"sync_interval_seconds"`
	IsEnabled           bool       `gorm:"default:true" json:"is_enabled"`                      // 全局采集监控总开关 (true: 运行中, false: 已暂停)
	BroadcastChannelID  string     `gorm:"type:varchar(100)" json:"broadcast_channel_id"`       // 站长专属广播频道 ID/用户名 (如 @xuebaw_official 或 -100xxxxxxx)
	AutoBroadcast       bool       `gorm:"default:false" json:"auto_broadcast"`                 // 发布新资料时是否自动广播到自己频道
	BroadcastTemplate   string     `gorm:"type:text" json:"broadcast_template"`                 // 自定义广播文案模板 (留空使用官方高颜值排版)
	LastUpdateID        int64      `gorm:"default:0" json:"last_update_id"`
	LastSyncAt          *time.Time `json:"last_sync_at"`
	LastSyncStatus      string     `gorm:"type:varchar(50);default:'idle'" json:"last_sync_status"` // idle, success, error
	LastSyncMessage     string     `gorm:"type:varchar(500)" json:"last_sync_message"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// TelegramChannel 监听监控的电报频道与群组模型
type TelegramChannel struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ChannelID   string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"channel_id"` // e.g. -1002250092204
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`                   // e.g. 夸克精选资源群
	DriveType   string    `gorm:"type:varchar(30);default:'auto'" json:"drive_type"`        // quark, baidu, alipan, auto
	IsActive    bool      `gorm:"default:true;index" json:"is_active"`
	ItemCount   int       `gorm:"default:0" json:"item_count"`
	Remark      string    `gorm:"type:varchar(255)" json:"remark"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TelegramBroadcastChannel 站长专属广播推送频道与群组模型 (支持多频道群发、独立启停与测试)
type TelegramBroadcastChannel struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ChannelID string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"channel_id"` // e.g. @xuebaw_official 或 -100xxxxxxxx
	Name      string    `gorm:"type:varchar(100);not null" json:"name"`                   // e.g. 学霸网官方资料频道
	IsActive  bool      `gorm:"default:true;index" json:"is_active"`
	ItemCount int       `gorm:"default:0" json:"item_count"`
	Remark    string    `gorm:"type:varchar(255)" json:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ResourceDraft 采集暂存草稿池模型 (从电报/外部采集中转，待管理员审核入库)
type ResourceDraft struct {
	ID                 uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title              string         `gorm:"type:varchar(500);not null;index" json:"title"`
	SourceName         string         `gorm:"type:varchar(100);not null;index" json:"source_name"`
	ChannelID          string         `gorm:"type:varchar(100);index" json:"channel_id"`
	MessageID          int64          `gorm:"index" json:"message_id"`
	DriveType          string         `gorm:"type:varchar(30);not null;index" json:"drive_type"` // quark, baidu, alipan, xunlei
	ShareURL           string         `gorm:"type:varchar(500);not null;index" json:"share_url"`
	ExtractCode        string         `gorm:"type:varchar(50)" json:"extract_code"`
	FileSize           string         `gorm:"type:varchar(50)" json:"file_size"`
	RawText            string         `gorm:"type:text" json:"raw_text"`
	Status             string         `gorm:"type:varchar(30);default:'pending';index" json:"status"` // pending(待审核), approved(已入库), ignored(已忽略)
	ApprovedResourceID *uuid.UUID     `gorm:"type:uuid" json:"approved_resource_id"`
	IsSafe             bool           `gorm:"default:true" json:"is_safe"`
	RawInfo            datatypes.JSON `gorm:"type:jsonb" json:"raw_info"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

// CrawledResource 兼容别名
type CrawledResource = ResourceDraft

// NetdiskAccount 网盘管理员账号与转存配置模型
type NetdiskAccount struct {
	ID               uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	DriveType        string     `gorm:"type:varchar(30);index;not null" json:"drive_type"` // quark, baidu, aliyun
	AccountName      string     `gorm:"type:varchar(100);not null" json:"account_name"`
	Cookie           string     `gorm:"type:text;not null" json:"cookie"`
	TargetFolderFID  string     `gorm:"column:target_folder_fid;type:varchar(100);default:'0'" json:"target_folder_fid"`
	TargetFolderName string     `gorm:"type:varchar(255);default:'/'" json:"target_folder_name"`
	IsDefault        bool       `gorm:"default:false" json:"is_default"`
	Nickname         string     `gorm:"type:varchar(100)" json:"nickname"`
	TotalCapacity    string     `gorm:"type:varchar(50)" json:"total_capacity"`
	UsedCapacity     string     `gorm:"type:varchar(50)" json:"used_capacity"`
	FreeCapacity     string     `gorm:"type:varchar(50)" json:"free_capacity"`
	Status           string     `gorm:"type:varchar(20);default:'valid'" json:"status"` // valid, invalid, expired
	ErrorMessage     string     `gorm:"type:varchar(255)" json:"error_message"`
	LastVerifiedAt   *time.Time `json:"last_verified_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// NavMenu 动态多级导航菜单模型 (支持一级与二级子项、层级树、排序与显隐开关)
type NavMenu struct {
	ID                 uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ParentID           *uuid.UUID `gorm:"type:uuid;index" json:"parent_id"`
	Title              string     `gorm:"type:varchar(100);not null" json:"title"`
	Icon               string     `gorm:"type:varchar(50);default:'📚'" json:"icon"`
	LinkURL            string     `gorm:"type:varchar(255);not null" json:"link_url"`
	BadgeText          string     `gorm:"type:varchar(50)" json:"badge_text"`
	Description        string     `gorm:"type:varchar(255)" json:"description"`
	SortOrder          int        `gorm:"default:0" json:"sort_order"`
	IsActive           bool       `gorm:"default:true;index" json:"is_active"`
	IsSpecialHighlight bool       `gorm:"default:false" json:"is_special_highlight"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`

	Children []NavMenu `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

// Region 地区字典模型 (如: 广西-柳州、北京-海淀、全国联考)
type Region struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"name"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	IsHot     bool      `gorm:"default:false" json:"is_hot"`
	CreatedAt time.Time `json:"created_at"`

	Schools []School `gorm:"foreignKey:RegionID" json:"schools,omitempty"`
}

// School 名校/命题单位字典模型 (如: 柳铁一中、柳州高中、柳州十二中)
type School struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RegionID  uint      `gorm:"index;not null" json:"region_id"`
	Name      string    `gorm:"type:varchar(100);not null" json:"name"`
	Stage     string    `gorm:"type:varchar(30);default:'all'" json:"stage"` // primary, junior, senior, all
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	IsHot     bool      `gorm:"default:false" json:"is_hot"`
	CreatedAt time.Time `json:"created_at"`

	RegionName string `gorm:"->" json:"region_name,omitempty"`
}

// HotSearch 高频热搜关键词配置模型
type HotSearch struct {
	ID         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title      string    `gorm:"type:varchar(100);not null" json:"title"`              // 前台展示文本，如 "🎯 小升初择校密卷"
	Keyword    string    `gorm:"type:varchar(100);not null" json:"keyword"`            // 实际触发搜索词，如 "小升初"
	Stage      string    `gorm:"type:varchar(30);default:'all';index" json:"stage"`     // 归属学段: all, primary, junior, senior, cert, exam
	StyleType  string    `gorm:"type:varchar(30);default:'default'" json:"style_type"` // 样式: default, highlight(冲刺红), hot(热门蓝)
	SortOrder  int       `gorm:"default:0" json:"sort_order"`                          // 排序权重，越小越靠前
	IsActive   bool      `gorm:"default:true;index" json:"is_active"`                  // 启用/停用状态
	ClickCount int       `gorm:"default:0" json:"click_count"`                         // 累计点击数
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// SiteSetting 站点全局系统配置模型 (支持全站公告、客服/QQ社群、SEO与版权备案动态管理)
type SiteSetting struct {
	ID                 string    `gorm:"type:varchar(50);primaryKey" json:"id"` // "global"
	SiteName           string    `gorm:"type:varchar(100);default:'学霸网'" json:"site_name"`
	SiteTitle          string    `gorm:"type:varchar(200);default:'学霸网 - 中小学同步教辅、网盘学习资源与考试真题平台'" json:"site_title"`
	SiteSubtitle       string    `gorm:"type:varchar(255);default:'中小学名校期末冲刺卷、人教版同步教辅、实用工具素材与精品网盘学习资料，支持A4高清打印与极速网盘转存。'" json:"site_subtitle"`
	Keywords           string    `gorm:"type:varchar(300);default:'学霸网,xuebaw.com,网盘资源,中小学试卷下载,期末冲刺卷,人教版同步教辅,夸克网盘学习资料,百度网盘资源,考试真题'" json:"keywords"`
	QQGroup            string    `gorm:"type:varchar(50);default:'625248438'" json:"qq_group"`
	QQGroupURL         string    `gorm:"type:varchar(500);default:'https://qm.qq.com/cgi-bin/qm/qr?k=&jump_from=webapi&authKey=&uin=625248438'" json:"qq_group_url"`
	ContactEmail       string    `gorm:"type:varchar(100);default:'support@xuebaw.com'" json:"contact_email"`
	ContactWechat      string    `gorm:"type:varchar(100)" json:"contact_wechat"`
	ICPBeian           string    `gorm:"type:varchar(100)" json:"icp_beian"`
	GongAnBeian        string    `gorm:"type:varchar(100)" json:"gongan_beian"`
	CopyrightText      string    `gorm:"type:varchar(255);default:'© 2026 学霸网 (xuebaw.com). All rights reserved.'" json:"copyright_text"`
	DisclaimerText     string    `gorm:"type:text;default:'免责声明：本站所有资源均来自互联网公开平台与公开考试题型归纳整理，仅供个人学习研究交流使用，版权归原作者所有。'" json:"disclaimer_text"`
	AnnouncementActive bool      `gorm:"default:false" json:"announcement_active"`
	AnnouncementText   string    `gorm:"type:varchar(500);default:'📢 欢迎来到学霸网！2026 最新各省中考高三一模二模卷及人教版教辅资料正在每日批量更新中，建议收藏本站防走失。'" json:"announcement_text"`
	AnnouncementURL    string    `gorm:"type:varchar(500)" json:"announcement_url"`
	AnnouncementBadge  string    `gorm:"type:varchar(50);default:'HOT'" json:"announcement_badge"`
	AnnouncementType   string    `gorm:"type:varchar(30);default:'blue'" json:"announcement_type"` // blue, amber, emerald, rose
	UpdatedAt          time.Time `json:"updated_at"`
}

// ResourceRequest 用户求资料 / 找试卷需求模型
type ResourceRequest struct {
	ID                  uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title               string     `gorm:"type:varchar(255);not null;index" json:"title"`              // 所需资料名称，如 "2026广州中考一模数学试卷"
	Stage               string     `gorm:"type:varchar(30);default:'all';index" json:"stage"`          // 学段: primary, junior, senior, cert, exam
	Subject             string     `gorm:"type:varchar(50)" json:"subject"`                            // 学科，如 数学/英语
	Note                string     `gorm:"type:text" json:"note"`                                      // 详细要求/考期备注
	Contact             string     `gorm:"type:varchar(100)" json:"contact"`                           // 邮箱/微信/QQ (选填)
	Status              string     `gorm:"type:varchar(20);default:'pending';index" json:"status"`      // pending(待处理), fulfilled(已上架/满足), rejected(已忽略)
	FulfilledResourceID *uuid.UUID `gorm:"type:uuid" json:"fulfilled_resource_id"`                     // 关联已上架的资源ID
	FulfilledNote       string     `gorm:"type:varchar(255)" json:"fulfilled_note"`                    // 站长回复/说明
	VoteCount           int        `gorm:"default:1" json:"vote_count"`                                // 同求人数
	ClientIP            string     `gorm:"type:varchar(64)" json:"client_ip"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// EmailConfig 邮件营销发信与 SMTP 凭据配置模型
type EmailConfig struct {
	ID              string     `gorm:"type:varchar(50);primaryKey" json:"id"` // "global"
	SMTPHost        string     `gorm:"type:varchar(100);default:'smtp.qq.com'" json:"smtp_host"`
	SMTPPort        int        `gorm:"default:465" json:"smtp_port"` // 465 (SSL) 或 587 (TLS)
	SMTPUser        string     `gorm:"type:varchar(100)" json:"smtp_user"`
	SMTPPass        string     `gorm:"type:varchar(100)" json:"smtp_pass"` // 密码或授权码
	SenderName      string     `gorm:"type:varchar(100);default:'学霸网精选真题'" json:"sender_name"`
	SenderEmail     string     `gorm:"type:varchar(100)" json:"sender_email"`
	DailyLimit      int        `gorm:"default:500" json:"daily_limit"` // 每日发信配额
	IntervalSeconds float64    `gorm:"default:1.5" json:"interval_seconds"` // 单封发送间隔秒数(防风控)
	IsEnabled       bool       `gorm:"default:true" json:"is_enabled"`
	LastTestedAt    *time.Time `json:"last_tested_at"`
	LastTestStatus  string     `gorm:"type:varchar(50)" json:"last_test_status"` // success, error
	LastTestMsg     string     `gorm:"type:varchar(255)" json:"last_test_msg"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// EmailContact 精准目标邮箱名录模型 (唯一索引绝对防重)
type EmailContact struct {
	ID         uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Email      string     `gorm:"type:varchar(150);uniqueIndex;not null" json:"email"` // 唯一约束
	Name       string     `gorm:"type:varchar(100)" json:"name"`
	GroupTag   string     `gorm:"type:varchar(50);default:'general';index" json:"group_tag"` // 标签: gaokao, zhongkao, kaogong, general, request, vip
	Source     string     `gorm:"type:varchar(100);default:'paste'" json:"source"` // qq_group, web_paste, request, manual
	SendCount  int        `gorm:"default:0" json:"send_count"` // 累计发送成功次数
	LastSentAt *time.Time `json:"last_sent_at"` // 最近一次发信时间
	Status     string     `gorm:"type:varchar(20);default:'active';index" json:"status"` // active(正常), unsubscribed(已退订), bounced(失效/拒信)
	Remark     string     `gorm:"type:varchar(255)" json:"remark"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// EmailCampaignLog 邮件群发批次活动日志模型
type EmailCampaignLog struct {
	ID            uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	CampaignType  string     `gorm:"type:varchar(50);default:'resource'" json:"campaign_type"` // resource(资料推荐), site(站点推广), custom(自定义)
	ResourceID    *uuid.UUID `gorm:"type:uuid" json:"resource_id"`
	ResourceTitle string     `gorm:"type:varchar(255)" json:"resource_title"`
	Subject       string     `gorm:"type:varchar(255);not null" json:"subject"` // 邮件主题
	TotalCount    int        `gorm:"default:0" json:"total_count"` // 目标总数
	SuccessCount  int        `gorm:"default:0" json:"success_count"`
	FailedCount   int        `gorm:"default:0" json:"failed_count"`
	TargetTag     string     `gorm:"type:varchar(50)" json:"target_tag"`
	Status        string     `gorm:"type:varchar(20);default:'sending';index" json:"status"` // sending, completed, failed
	ErrorMessage  string     `gorm:"type:text" json:"error_message"`
	CreatedAt     time.Time  `json:"created_at"`
	CompletedAt   *time.Time `json:"completed_at"`
}

// SeoConfig 搜索引擎主动收录与索引配置模型 (支持百度普通收录 API 与微软必应 IndexNow)
type SeoConfig struct {
	ID                string     `gorm:"type:varchar(50);primaryKey" json:"id"` // "global"
	SiteDomain        string     `gorm:"type:varchar(200);default:'https://xuebaw.com'" json:"site_domain"`
	BaiduToken        string     `gorm:"type:varchar(100)" json:"baidu_token"`        // 百度搜索资源平台准入密钥 token
	BaiduActive       bool       `gorm:"default:true" json:"baidu_active"`             // 是否开启百度收录推送
	BingApiKey        string     `gorm:"type:varchar(100)" json:"bing_api_key"`       // 必应/IndexNow API Key (32位十六进制)
	BingActive        bool       `gorm:"default:true" json:"bing_active"`              // 是否开启必应/IndexNow 推送
	AutoPushOnPublish bool       `gorm:"default:true" json:"auto_push_on_publish"`    // 发布新资料时是否全自动向搜索引擎推送
	DailyPushLimit    int        `gorm:"default:100000" json:"daily_push_limit"`      // 每日配额上限 (百度通常为 100000 条)
	TodayPushedCount  int        `gorm:"default:0" json:"today_pushed_count"`         // 今日已推送量
	TotalPushedCount  int        `gorm:"default:0" json:"total_pushed_count"`         // 历史累计推送量
	LastPushAt        *time.Time `json:"last_push_at"`                                // 最近一次推送时间
	BaiduRemainQuota  int        `gorm:"default:100000" json:"baidu_remain_quota"`     // 百度接口返回的今日剩余配额
	UpdatedAt         time.Time  `json:"updated_at"`
}

// SeoPushLog 搜索引擎收录推送历史流水模型
type SeoPushLog struct {
	ID            uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Engine        string         `gorm:"type:varchar(30);index;not null" json:"engine"` // baidu, bing, all
	URLCount      int            `gorm:"default:0" json:"url_count"`                   // 提交的 URL 数量
	URLs          datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"urls"`          // 提交的 URL 列表
	Status        string         `gorm:"type:varchar(20);default:'success';index" json:"status"` // success, partial, failed
	ResultSummary string         `gorm:"type:varchar(500)" json:"result_summary"`      // 简要结果说明 (如: 百度成功 12 条, 必应成功接收)
	ResponseBody  string         `gorm:"type:text" json:"response_body"`               // 接口原始返回 JSON
	ErrorMessage  string         `gorm:"type:text" json:"error_message"`
	CreatedAt     time.Time      `json:"created_at"`
}

