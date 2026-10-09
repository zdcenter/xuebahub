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

// Channel 顶级频道模型（学习教辅 / 实用工具素材 / 怀旧复古小游戏）
type Channel struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Slug        string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"slug"` // edu, tools, games
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
	ChannelSlug   string         `gorm:"type:varchar(50);default:'edu';index" json:"channel_slug"` // 所属顶级频道 slug (如: edu, tools, games)
	Title         string         `gorm:"type:varchar(255);not null;index" json:"title"`
	Subtitle      string         `gorm:"type:varchar(255)" json:"subtitle"`
	Description   string         `gorm:"type:text" json:"description"`
	Stage         string         `gorm:"type:varchar(30);index;default:'general'" json:"stage"` // primary, junior, senior, cert, exam, tools, games
	Grade         string         `gorm:"type:varchar(30);index" json:"grade"`                   // 一年级, 二年级, 初三, 高一, 通用, 平台分类
	Subject       string         `gorm:"type:varchar(30);index" json:"subject"`                 // 语文, 数学, 英语, 物理, 素材类型, 游戏类型
	Edition       string         `gorm:"type:varchar(50)" json:"edition"`                       // 人教版, 北师大版, 统编版, 软件格式, 游戏版本
	Region        string         `gorm:"type:varchar(100);index" json:"region"`                // 城市/地区，如 广西-柳州
	School        string         `gorm:"type:varchar(100);index" json:"school"`                // 目标名校，如 柳州十二中
	CategoryID    *uint          `json:"category_id"`
	Category      *Category      `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	CoverImage    string         `gorm:"type:varchar(500)" json:"cover_image"`
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

// CrawledResource 全网资源采集/聚合模型 (为全网聚合搜索预留)
type CrawledResource struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title       string         `gorm:"type:varchar(500);not null" json:"title"`
	SourceName  string         `gorm:"type:varchar(100);not null" json:"source_name"`
	DriveType   string         `gorm:"type:varchar(30);not null" json:"drive_type"`
	ShareURL    string         `gorm:"type:varchar(500);not null" json:"share_url"`
	ExtractCode string         `gorm:"type:varchar(50)" json:"extract_code"`
	FileSize    string         `gorm:"type:varchar(50)" json:"file_size"`
	IsSafe      bool           `gorm:"default:true" json:"is_safe"`
	RawInfo     datatypes.JSON `gorm:"type:jsonb" json:"raw_info"`
	CreatedAt   time.Time      `json:"created_at"`
}

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



