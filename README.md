# 刚需教辅与全网学习资源推广系统 (Netdisk Hub)

基于 **PostgreSQL + Go Fiber v3 (后端) + Angular 21 (统一客户端: 前台SSG预渲染 + 后台SPA)** 的高转化网盘推广与资源分发系统。

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

3. **三层高内聚解耦架构**：
   - **数据层 (PostgreSQL 16)**：支持 UUID、灵活 JSONB 属性扩展与 `pg_trgm` 毫秒级模糊搜索。
   - **后端 API (Go Fiber v3)**：毫秒级启动、占用内存仅十几MB；多源并发聚合搜索与自动化 SEO 静态生成。
   - **统一前端客户端 (Angular 21 + TailwindCSS)**：
     - **前台门户与电子课本书架 (SSG 静态预渲染)**：纯静态 HTML 直出、零阻塞加载、SEO 爬虫抓取秒收录，首屏仅 95KB 传输体积。
     - **管理控制台 (SPA 路由懒加载)**：访问 `/admin` 时异步按需加载，集成暗黑高光仪表盘、试卷与课本批量录入、AI 智能打标与海报生成。

---

## 📂 项目结构

```text
netdisk/
├── apps/
│   ├── api/          # Go Fiber v3 高性能后端 API
│   │   ├── cmd/server/main.go
│   │   ├── internal/model/        # PostgreSQL GORM 数据模型
│   │   ├── internal/handler/      # 公开资源、转存打点、后台管理
│   │   └── internal/service/      # 业务逻辑与 SEO 聚合服务
│   │
│   └── client/       # Angular 21 全站统一客户端 (Tailwind CSS)
│       ├── src/app/portal/        # 前台门户：首页精选、学段专区、统编数字课本书架
│       ├── src/app/admin/         # 后台管理：资源录入、SEO工作台、数据看板
│       ├── src/app/core/          # 核心服务：SEO元数据管理、API客户端
│       └── src/app/app.routes.server.ts # SSG预渲染规则分流 (前台SSG / 后台Client)
│
├── deploy/           # Docker Compose 配置文件 (PostgreSQL 16)
└── docs/
    ├── FEATURES.md   # 系统功能清单与业务规范
    ├── CHANGELOG.md  # 详细架构与功能演进日志
    └── db_schema.sql # 完整数据库建表脚本与预置字典数据
```

---

## 🚀 本地快速启动指南

### 1. 启动物理机或 Docker PostgreSQL 数据库
```bash
cd deploy
docker compose up -d
# 数据库将运行在 5432 端口，并自动导入 docs/db_schema.sql
```

### 2. 启动 Go Fiber v3 后端 API
```bash
cd apps/api
go run ./cmd/server
# API 服务监听 http://localhost:4001
# 健康检查: http://localhost:4001/health
# 公开资源接口: http://localhost:4001/api/v1/public/resources
```

### 3. 启动 Angular 统一客户端 (前台+后台)
```bash
cd apps/client
npm start
# 浏览器访问前台门户: http://localhost:4200
# 浏览器访问统编教材书架: http://localhost:4200/book
# 浏览器访问后台控制台: http://localhost:4200/admin
```

### 4. 生产环境 SSG 预渲染静态打包
```bash
cd apps/client
npm run build
# 产物直接生成于 apps/client/dist/client/browser
# 包含 index.html, book/index.html, primary/index.html 等纯静态页面
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
