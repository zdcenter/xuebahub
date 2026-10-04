#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " 正在启动 刚需教辅网盘推广全套系统 (开发环境)"
echo "=========================================================="

# 1. 检查 Docker PostgreSQL
if command -v docker &> /dev/null; then
  echo ">>> [1/3] 启动 PostgreSQL 容器..."
  cd deploy && docker compose up -d && cd ..
else
  echo ">>> 未检测到 docker，跳过自动拉起 PG 容器。"
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
