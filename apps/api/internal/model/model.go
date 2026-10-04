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

// Resource 核心学习资源主模型
type Resource struct {
	ID            uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Slug          string         `gorm:"type:varchar(120);uniqueIndex;not null" json:"slug"`
	Title         string         `gorm:"type:varchar(255);not null;index" json:"title"`
	Subtitle      string         `gorm:"type:varchar(255)" json:"subtitle"`
	Description   string         `gorm:"type:text" json:"description"`
	Stage         string         `gorm:"type:varchar(30);index;not null" json:"stage"`   // primary, junior, senior, cert, exam
	Grade         string         `gorm:"type:varchar(30);index" json:"grade"`            // 一年级, 二年级, 初三, 高一
	Subject       string         `gorm:"type:varchar(30);index" json:"subject"`          // 语文, 数学, 英语, 物理
	Edition       string         `gorm:"type:varchar(50)" json:"edition"`                // 人教版, 北师大版, 统编版
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
	Status        string     `gorm:"type:varchar(20);default:'active'" json:"status"`
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
