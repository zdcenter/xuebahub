#!/usr/bin/env bash
# ==============================================================================
# 刚需教辅网盘系统 - PostgreSQL 数据库每日自动化冷备与轮转脚本
# ==============================================================================
set -euo pipefail

BACKUP_DIR="/home/zd/netdisk/backups"
DB_NAME="${DB_NAME:-netdisk_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-format.11}"

KEEP_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 开始执行数据库备份: ${DB_NAME} (目标文件: ${BACKUP_FILE})"

# 检查数据库服务连通性
if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" > /dev/null 2>&1; then
  echo "❌ 数据库连接失败: 无法连接至 ${DB_HOST}:${DB_PORT}"
  exit 1
fi

# 执行 pg_dump 并通过 gzip 压缩
if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"; then
  FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "✅ 备份成功！文件大小: ${FILE_SIZE}"
else
  echo "❌ 备份失败！"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# 清理保留期（7天）以外的旧备份
echo "🧹 检查并清理超过 ${KEEP_DAYS} 天的历史备份文件..."
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -type f -mtime +${KEEP_DAYS} -exec rm -vf {} \;

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🎉 备份与轮转任务全部完成！"
