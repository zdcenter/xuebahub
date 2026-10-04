# 刚需教辅与全网学习资源推广系统 (Netdisk Hub)

基于 **PostgreSQL + Go Fiber v3 (后端) + Astro (前台门户) + Angular (独立后台SPA)** 的高转化网盘推广与资源分发系统。

---

## 🎯 业务与技术亮点

1. **刚需教辅与高转存定位**：
   - 聚焦中小学同步名校密卷、期末押题卷（人教版/北师大版）、奥数思维拓展、教师资格证与考公考研高频考点。
   - 文件小（单份试卷 5MB~20MB，节省网盘空间）、刚需度高、家长/考生转存转化率极高。
   - 页面突出展示试卷**前 1~3 页高清真实试看排版图**与“支持 A4 打印即练”标识，极大拉满信任感。

2. **高佣金网盘推广矩阵**：
   - **主推【夸克网盘】**：突出“手机APP免下载在线查看与直接打印”，主攻新用户拉新佣金（5~15元/单）+ 转存收益。
   - **备用【百度网盘】**：保障未安装夸克的用户不流失，锁定基本转存收益。
   - **私域沉淀**：提供微信公众号与「学霸真题备考群」入口，形成私域流量闭环。

3. **四层解耦架构**：
   - **数据层 (PostgreSQL 16)**：支持 UUID、灵活 JSONB 属性扩展与 `pg_trgm` 毫秒级模糊搜索。
   - **后端 API (Go Fiber v3)**：毫秒级启动、占用内存仅十几MB；使用 Goroutines 协程支持未来**全网资源多源并发聚合搜索**。
   - **前台门户 (Astro + TailwindCSS)**：纯静态直出 (SSG/ISR)，零 JS 水合开销，首屏秒开，搜索引擎 SEO 极佳，全端响应式完美适配手机端与电脑端。
   - **后台管理 (Angular 21 SPA)**：独立管理后台，包含试卷录入、夸克/百度网盘链接配置、转存数据分析、上下架管理。

---

## 📂 项目结构

```text
netdisk/
├── apps/
│   ├── api/          # Go Fiber v3 后端 API
│   │   ├── cmd/server/main.go
│   │   ├── internal/model/        # PostgreSQL GORM 数据模型
│   │   ├── internal/handler/      # 公开资源、转存打点、后台管理
│   │   └── internal/service/      # Go 协程并发搜索聚合服务
│   │
│   ├── web/          # Astro 前台静态落地页 (TailwindCSS)
│   │   ├── src/pages/index.astro           # 首页：学段筛选/搜索/热门试卷流
│   │   ├── src/pages/resource/[slug].astro # 试卷详情：内页高清试看/一键转存
│   │   └── src/components/ResourceCard.astro
│   │
│   └── admin/        # Angular 独立管理后台 SPA
│       └── src/app/  # 仪表盘、试卷上架表单、转存漏斗分析
│
├── deploy/           # Docker Compose 配置文件 (PostgreSQL 16)
└── docs/
    └── db_schema.sql # 完整数据库建表脚本与预置字典数据
```

---

## 🚀 本地快速启动指南

### 1. 启动 PostgreSQL 数据库
```bash
cd deploy
docker compose up -d
# 数据库将运行在 5432 端口，并自动导入 docs/db_schema.sql
```

### 2. 启动 Go Fiber v3 后端 API
```bash
cd apps/api
go run ./cmd/server
# API 服务监听 http://localhost:8080
# 健康检查: http://localhost:8080/health
# 公开资源接口: http://localhost:8080/api/v1/public/resources
```

### 3. 启动 Astro 前台门户
```bash
cd apps/web
npm run dev
# 前台访问: http://localhost:4321
```

### 4. 启动 Angular 管理后台
```bash
cd apps/admin
npm start
# 管理后台访问: http://localhost:4200
```

---

## 🛡️ 合规运营注意事项

1. **选品红线**：
   - 严禁上线任何商业机构名师的**付费录播视频课**与出版社原版教辅的整本翻拍 PDF。
   - 重点做：**公开历年中高考/期末考试公开真题**、**手写速记笔记**、**公开政策与思维导图**。
2. **免责与投诉通道**：
   - 页面底部已标配完整的《版权保护声明与投诉下架邮箱》（避风港原则），收到下架邮件时第一时间下架对应链接。
3. **服务器节点建议**：
   - 推荐使用中国香港轻量云（如腾讯云/阿里云香港节点）配合 Cloudflare CDN，免去工信部个人网站针对教育培训类繁琐的前置审批与备案受限风险。
