-- ====================================================================
-- PostgreSQL 数据库设计：刚需教辅与全网资源推广系统
-- 字符集: UTF-8, 兼容 PG 14+ / 16+
-- ====================================================================

-- 开启扩展支持：UUID 与 全文模糊检索 (pg_trgm 为全网搜索和模糊联想加速)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- --------------------------------------------------------------------
-- 1. 管理员账户表 (admin_users)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) NOT NULL DEFAULT 'Admin',
    role VARCHAR(20) NOT NULL DEFAULT 'superadmin', -- superadmin / editor
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 2. 分类与学段年级字典表 (categories)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL, -- stage(学段), grade(年级), subject(学科), edition(版本), tag(标签)
    parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INT NOT NULL DEFAULT 0,
    icon VARCHAR(100),
    is_hot BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- --------------------------------------------------------------------
-- 3. 核心学习资源主表 (resources)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(120) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    description TEXT,
    
    -- 核心维度定位（支持高效检索与TDK生成）
    stage VARCHAR(30) NOT NULL,         -- primary(小学), junior(初中), senior(高中), cert(成人考证), exam(考公考研)
    grade VARCHAR(30),                  -- 一年级, 二年级 ... 初三, 高一, 通用
    subject VARCHAR(30),                -- 语文, 数学, 英语, 物理, 教师资格证, 申论行测
    edition VARCHAR(50),                -- 人教版, 北师大版, 苏教版, 统编版, 通用
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    
    -- 诱惑力核心：试卷真实试看展示与转化物料
    cover_image VARCHAR(500),
    preview_images JSONB DEFAULT '[]'::jsonb, -- 试卷前1~3页高清预览图数组，建立极强信任感
    
    -- 文件属性
    file_type VARCHAR(20) DEFAULT 'PDF',     -- PDF, Word, ZIP, MP3
    file_size VARCHAR(50),                   -- 如 '18.5 MB'
    page_count INT DEFAULT 0,                -- 页数，如 32页
    
    -- 统计与运营权重
    view_count INT NOT NULL DEFAULT 0,       -- 浏览量
    save_count INT NOT NULL DEFAULT 0,       -- 转存/下载计数
    is_recommended BOOLEAN DEFAULT false,    -- 站长力荐 / 首页置顶
    is_published BOOLEAN DEFAULT true,       -- 上架状态
    
    -- 扩展元数据 (JSONB 灵活支持真题年份、省市地区、解析完备性等)
    extra_metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resources_stage ON resources(stage);
CREATE INDEX IF NOT EXISTS idx_resources_grade ON resources(grade);
CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject);
CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(created_at DESC);
-- 标题模糊搜索索引，为全文检索与即时联想提速
CREATE INDEX IF NOT EXISTS idx_resources_title_trgm ON resources USING gin (title gin_trgm_ops);

-- --------------------------------------------------------------------
-- 4. 网盘链接分发表 (resource_links)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resource_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    drive_type VARCHAR(30) NOT NULL,          -- quark(夸克网盘), baidu(百度网盘), xunlei(迅雷), aliyun(阿里云盘)
    share_url VARCHAR(500) NOT NULL,          -- 分享链接
    extract_code VARCHAR(50),                 -- 提取码（如有）
    password_hint VARCHAR(100),               -- 解压密码或关注公众号提示
    is_primary BOOLEAN NOT NULL DEFAULT false,-- 是否主推（夸克主推拉新）
    click_count INT NOT NULL DEFAULT 0,       -- 该网盘专属点击转存统计
    file_size VARCHAR(50) DEFAULT '15.0 MB',  -- 该网盘实际容量 (如 1.39 GB)
    file_type VARCHAR(50) DEFAULT 'PDF',      -- 该网盘实际格式 (如 高清视频课 / PDF)
    resource_desc VARCHAR(255) DEFAULT '',    -- 该网盘内容说明 (如 包含25集全套超清视频)
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active(有效), expired(已失效), checking(检测中)
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_links_res_id ON resource_links(resource_id);

-- --------------------------------------------------------------------
-- 5. 全网资源采集与搜索记录表 (crawled_resources / search_logs)
-- 为未来“全网搜索与多源盘搜聚合”预留高并发架构
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_logs (
    id BIGSERIAL PRIMARY KEY,
    keyword VARCHAR(255) NOT NULL,
    client_ip VARCHAR(64),
    result_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_search_logs_keyword ON search_logs(keyword);

CREATE TABLE IF NOT EXISTS crawled_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    source_name VARCHAR(100) NOT NULL,       -- 来源渠道 (如: 夸克盘搜A源, 盘搜B源)
    drive_type VARCHAR(30) NOT NULL,
    share_url VARCHAR(500) NOT NULL,
    extract_code VARCHAR(50),
    file_size VARCHAR(50),
    is_safe BOOLEAN DEFAULT true,            -- 经过敏感词和合规过滤检查
    raw_info JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crawled_resources_title_trgm ON crawled_resources USING gin (title gin_trgm_ops);

-- --------------------------------------------------------------------
-- 初始化预置分类与种子数据
-- --------------------------------------------------------------------
INSERT INTO categories (name, slug, type, sort_order, is_hot) VALUES
('小学阶段', 'primary', 'stage', 1, true),
('初中阶段', 'junior', 'stage', 2, true),
('高中阶段', 'senior', 'stage', 3, true),
('成人考证', 'cert', 'stage', 4, true),
('考公考研', 'exam', 'stage', 5, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, type, sort_order) VALUES
('一年级', 'grade-1', 'grade', 1),
('二年级', 'grade-2', 'grade', 2),
('三年级', 'grade-3', 'grade', 3),
('四年级', 'grade-4', 'grade', 4),
('五年级', 'grade-5', 'grade', 5),
('六年级', 'grade-6', 'grade', 6),
('初一/七年级', 'grade-7', 'grade', 7),
('初二/八年级', 'grade-8', 'grade', 8),
('初三/中考冲刺', 'grade-9', 'grade', 9)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, type, sort_order) VALUES
('语文', 'subject-chinese', 'subject', 1),
('数学', 'subject-math', 'subject', 2),
('英语', 'subject-english', 'subject', 3),
('奥数与思维培优', 'subject-olympiad', 'subject', 4),
('教师资格证', 'subject-ntce', 'subject', 5),
('国家公务员与省考', 'subject-gwy', 'subject', 6)
ON CONFLICT (slug) DO NOTHING;
