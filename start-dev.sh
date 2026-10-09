#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " 正在启动 刚需教辅网盘推广全套系统 (开发环境)"
echo "=========================================================="

# 1. 检查物理机 PostgreSQL 服务
if command -v pg_isready &> /dev/null && pg_isready -h localhost -p 5432 &> /dev/null; then
  echo ">>> [1/3] 检测到物理机 PostgreSQL (localhost:5432) 服务运行中，正常连接。"
else
  echo ">>> 提示：请确保物理机 PostgreSQL 5432 服务已启动并创建了 netdisk_db 数据库。"
fi

echo ">>> 后续步骤指南："
echo "1. 启动后端 API (Go Fiber v3):"
echo "   cd apps/api && go run ./cmd/server"
echo ""
echo "2. 启动前台门户 (Astro):"
echo "   cd apps/web && npm run dev"
echo ""
echo "3. 启动管理后台 (Angular SPA):"
echo "   cd apps/admin && npm start"
echo "=========================================================="
