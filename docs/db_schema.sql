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
-- 2.1 顶级频道配置表 (channels) - 学习教辅 / 实用工具素材 / 怀旧单机游戏
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(50) NOT NULL UNIQUE,  -- edu, tools, games
    name VARCHAR(100) NOT NULL,        -- 频道展示名称
    icon VARCHAR(50) NOT NULL DEFAULT '📦',
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true, -- 上线 (true) / 隐藏 (false)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);
CREATE INDEX IF NOT EXISTS idx_channels_sort_active ON channels(is_active, sort_order);

-- --------------------------------------------------------------------
-- 2.2 网站多级导航与专区配置表 (nav_menus)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nav_menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES nav_menus(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT '📚',
    link_url VARCHAR(255) NOT NULL,
    badge_text VARCHAR(30) DEFAULT '',
    description TEXT DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_special_highlight BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nav_menus_parent_sort ON nav_menus(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_nav_menus_active ON nav_menus(is_active);

-- --------------------------------------------------------------------
-- 2.3 重点省市地区字典表 (regions)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,  -- 如：广西-柳州、北京-海淀/西城、湖北-黄冈/武汉
    sort_order INT NOT NULL DEFAULT 0,
    is_hot BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 2.4 重点名校/命题单位字典表 (schools)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    region_id INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,         -- 如：柳铁一中初中部、柳州高中、柳州十二中、黄冈中学
    stage VARCHAR(30) DEFAULT 'all',    -- primary, junior, senior, all
    sort_order INT NOT NULL DEFAULT 0,
    is_hot BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_region_school UNIQUE(region_id, name)
);

CREATE INDEX IF NOT EXISTS idx_schools_region_id ON schools(region_id);
CREATE INDEX IF NOT EXISTS idx_schools_name ON schools(name);

-- --------------------------------------------------------------------
-- 3. 核心学习与全品类资源主表 (resources)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(120) NOT NULL UNIQUE,
    channel_slug VARCHAR(50) NOT NULL DEFAULT 'edu' REFERENCES channels(slug), -- 所属顶级频道
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    description TEXT,
    
    -- 核心维度定位（支持高效检索与TDK生成）
    stage VARCHAR(30) NOT NULL DEFAULT 'general', -- primary, junior, senior, cert, exam, tools, games
    grade VARCHAR(30),                            -- 一年级, 二年级 ... 初三, 高一, 通用, 平台分类
    subject VARCHAR(30),                          -- 语文, 数学, 英语, 物理, 素材类型, 游戏类型
    edition VARCHAR(50),                          -- 人教版, 北师大版, 统编版, 软件格式, 游戏版本
    region VARCHAR(100) DEFAULT '',               -- 所属省市地区（如：广西-柳州）
    school VARCHAR(100) DEFAULT '',               -- 归属名校/命题单位（如：柳州十二中）
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
CREATE INDEX IF NOT EXISTS idx_resources_region ON resources(region);
CREATE INDEX IF NOT EXISTS idx_resources_school ON resources(school);
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
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active(有效), invalid(已失效), reported(用户报错待核验)
    report_count INT NOT NULL DEFAULT 0,          -- 用户失效报错次数
    invalid_reason VARCHAR(255) DEFAULT '',       -- 失效具体原因 (如 页面404、分享取消等)
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
-- 6. 网盘管理员账号与转存配置表 (netdisk_accounts)
-- 支撑全自动夸克/百度转存换链与空间状态追踪
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS netdisk_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drive_type VARCHAR(30) NOT NULL,          -- quark, baidu, aliyun
    account_name VARCHAR(100) NOT NULL,       -- 账号标识/备注
    cookie TEXT NOT NULL,                     -- 账号Cookie凭据
    target_folder_fid VARCHAR(100) DEFAULT '0', -- 转存保存目标目录ID (0表示根目录)
    target_folder_name VARCHAR(255) DEFAULT '/',-- 目标目录全路径名称
    is_default BOOLEAN DEFAULT FALSE,         -- 是否默认转存账号
    nickname VARCHAR(100),                    -- 网盘账号昵称
    total_capacity VARCHAR(50),               -- 总容量 (如 1024 GB)
    used_capacity VARCHAR(50),                -- 已用容量 (如 21.3 TB)
    free_capacity VARCHAR(50),                -- 剩余容量 / 状态 (如 580 GB 或 已超限)
    status VARCHAR(20) DEFAULT 'valid',       -- valid(有效), invalid(失效), expired(过期)
    error_message VARCHAR(255),               -- 异常原因
    last_verified_at TIMESTAMPTZ,             -- 上次连通验证时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_netdisk_accounts_drive_type ON netdisk_accounts(drive_type);

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

-- --------------------------------------------------------------------
-- 初始化预置重点地区与名校字典数据
-- --------------------------------------------------------------------
INSERT INTO regions (name, sort_order, is_hot) VALUES
('广西-柳州', 1, true),
('全国联考/命题院', 2, true),
('北京-海淀/西城', 3, true),
('湖北-黄冈/武汉', 4, true),
('河北-衡水', 5, true),
('湖南-长沙', 6, true),
('江苏-南京/南通', 7, false),
('浙江-杭州/宁波', 8, false),
('四川-成都', 9, false),
('广东-广州/深圳', 10, false)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  v_lz INT;
  v_all INT;
  v_bj INT;
  v_hb INT;
  v_hsh INT;
  v_hn INT;
  v_js INT;
  v_zj INT;
  v_sc INT;
BEGIN
  SELECT id INTO v_lz FROM regions WHERE name = '广西-柳州';
  SELECT id INTO v_all FROM regions WHERE name = '全国联考/命题院';
  SELECT id INTO v_bj FROM regions WHERE name = '北京-海淀/西城';
  SELECT id INTO v_hb FROM regions WHERE name = '湖北-黄冈/武汉';
  SELECT id INTO v_hsh FROM regions WHERE name = '河北-衡水';
  SELECT id INTO v_hn FROM regions WHERE name = '湖南-长沙';
  SELECT id INTO v_js FROM regions WHERE name = '江苏-南京/南通';
  SELECT id INTO v_zj FROM regions WHERE name = '浙江-杭州/宁波';
  SELECT id INTO v_sc FROM regions WHERE name = '四川-成都';

  IF v_lz IS NOT NULL THEN
    INSERT INTO schools (region_id, name, stage, sort_order, is_hot) VALUES
    (v_lz, '柳铁一中初中部', 'junior', 1, true),
    (v_lz, '柳州第十二中学 (柳州十二中)', 'junior', 2, true),
    (v_lz, '柳州第八中学 (柳州八中)', 'junior', 3, true),
    (v_lz, '柳州第十五中学 (柳州十五中)', 'junior', 4, true),
    (v_lz, '柳州第十四中学 (柳州十四中)', 'junior', 5, false),
    (v_lz, '柳州第三十五中学 (柳州三十五中)', 'junior', 6, false),
    (v_lz, '柳铁二中初中部', 'junior', 7, false),
    (v_lz, '柳州高级中学 (柳州高中)', 'senior', 8, true),
    (v_lz, '柳铁一中高中部', 'senior', 9, true),
    (v_lz, '柳州市第一中学 (柳州一中)', 'senior', 10, false),
    (v_lz, '柳州市第二中学 (柳州二中)', 'senior', 11, false),
    (v_lz, '柳州市第九中学 (柳州九中)', 'senior', 12, false)
    ON CONFLICT (region_id, name) DO NOTHING;
  END IF;

  IF v_all IS NOT NULL THEN
    INSERT INTO schools (region_id, name, stage, sort_order, is_hot) VALUES
    (v_all, '金太阳大联考', 'senior', 1, true),
    (v_all, '天一大联考', 'senior', 2, true),
    (v_all, '百校大联考', 'senior', 3, true),
    (v_all, '九省联考专家组', 'senior', 4, true),
    (v_all, '八省联考教研组', 'senior', 5, true),
    (v_all, '全国中考教研中心', 'junior', 6, true)
    ON CONFLICT (region_id, name) DO NOTHING;
  END IF;

  IF v_bj IS NOT NULL THEN
    INSERT INTO schools (region_id, name, stage, sort_order, is_hot) VALUES
    (v_bj, '人大附中 (海淀一模/期末)', 'all', 1, true),
    (v_bj, '清华附中', 'all', 2, true),
    (v_bj, '北京四中 (西城期末)', 'all', 3, true),
    (v_bj, '北京十一学校', 'all', 4, true)
    ON CONFLICT (region_id, name) DO NOTHING;
  END IF;

  IF v_hb IS NOT NULL THEN
    INSERT INTO schools (region_id, name, stage, sort_order, is_hot) VALUES
    (v_hb, '黄冈中学 (黄冈密卷)', 'all', 1, true),
    (v_hb, '华中师大一附中', 'senior', 2, true),
    (v_hb, '武汉二中', 'senior', 3, true)
    ON CONFLICT (region_id, name) DO NOTHING;
  END IF;

  IF v_hsh IS NOT NULL THEN
    INSERT INTO schools (region_id, name, stage, sort_order, is_hot) VALUES
    (v_hsh, '衡水中学 (衡水金卷)', 'senior', 1, true),
    (v_hsh, '衡水二中', 'senior', 2, true),
    (v_hsh, '石家庄二中', 'senior', 3, true)
    ON CONFLICT (region_id, name) DO NOTHING;
  END IF;

  IF v_hn IS NOT NULL THEN
    INSERT INTO schools (region_id, name, stage, sort_order, is_hot) VALUES
    (v_hn, '长郡中学', 'all', 1, true),
    (v_hn, '雅礼中学', 'all', 2, true),
    (v_hn, '湖南师大附中', 'all', 3, true),
    (v_hn, '长沙市一中', 'all', 4, true)
    ON CONFLICT (region_id, name) DO NOTHING;
  END IF;
END $$;

