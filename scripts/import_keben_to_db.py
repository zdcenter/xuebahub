#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课本主数据集 (keben_master_dataset.json) 批量导入 PostgreSQL 数据库工具
支持：
1. 单一总合集链接模式 (--all-in-one "https://pan.quark.cn/s/xxx")
2. 分学段链接模式 (--quark-primary "..." --quark-junior "..." --quark-senior "...")
3. JSON 映射模式（从 keben_master_dataset.json 中的 quark_share_url 逐条读取）
4. 先行无链接上架模式 (--no-links，仅上架课本书架展示，后续随时追加链接)
"""

import os
import sys
import json
import uuid
import subprocess

BASE_DIR = "/home/zd/netdisk/keben_pipeline"
MASTER_DATASET_FILE = os.path.join(BASE_DIR, "keben_master_dataset.json")

# 数据库配置（默认读取 apps/api/.env）
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "format.11")
DB_NAME = os.getenv("DB_NAME", "netdisk_db")

def escape_sql_str(val):
    if val is None:
        return "NULL"
    s = str(val).replace("'", "''")
    return f"'{s}'"

def escape_json_str(obj):
    if obj is None:
        return "'[]'::jsonb"
    s = json.dumps(obj, ensure_ascii=False).replace("'", "''")
    return f"'{s}'::jsonb"

def run_sql_script(sql_content):
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    p = subprocess.Popen(
        ["psql", "-h", DB_HOST, "-p", DB_PORT, "-U", DB_USER, "-d", DB_NAME],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True
    )
    stdout, stderr = p.communicate(input=sql_content)
    if p.returncode != 0:
        print("❌ SQL 执行失败:", stderr)
        return False
    return True

def main():
    if not os.path.exists(MASTER_DATASET_FILE):
        print(f"❌ 未找到主数据集文件: {MASTER_DATASET_FILE}")
        return

    with open(MASTER_DATASET_FILE, "r", encoding="utf-8") as f:
        books = json.load(f)

    # 参数解析
    all_in_one_url = None
    all_in_one_pwd = ""
    primary_url = None
    junior_url = None
    senior_url = None
    allow_no_links = "--no-links" in sys.argv

    for i, arg in enumerate(sys.argv):
        if arg == "--all-in-one" and i + 1 < len(sys.argv):
            all_in_one_url = sys.argv[i + 1]
        elif arg == "--quark-primary" and i + 1 < len(sys.argv):
            primary_url = sys.argv[i + 1]
        elif arg == "--quark-junior" and i + 1 < len(sys.argv):
            junior_url = sys.argv[i + 1]
        elif arg == "--quark-senior" and i + 1 < len(sys.argv):
            senior_url = sys.argv[i + 1]
        elif arg == "--pwd" and i + 1 < len(sys.argv):
            all_in_one_pwd = sys.argv[i + 1]

    print(f"==================================================")
    print(f"  学霸网 统编电子教材全量入库工具 (PostgreSQL)")
    print(f"==================================================")
    print(f"共加载课本数据: {len(books)} 本")

    # 构建 SQL 语句
    sql_lines = ["BEGIN;"]

    # 1. 确保 channel 存在
    sql_lines.append("""
    INSERT INTO channels (id, slug, name, icon, description, sort_order, is_active, created_at, updated_at)
    VALUES ('f014f905-8df2-419c-a7b7-035f482d3f33', 'book', '统编电子教材专区', '📖', '全国中小学各学科统编正版高清电子教材与课本PDF数字书架', 2, true, NOW(), NOW())
    ON CONFLICT (slug) DO UPDATE SET is_active = true, name = EXCLUDED.name;
    """)

    resource_count = 0
    link_count = 0

    for item in books:
        bid = item.get("keben_id")
        if not bid:
            continue

        res_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"xuebaw.keben.{bid}"))
        slug = f"res-keben-{bid}"
        title = item.get("title", f"电子课本 {bid}")
        stage = item.get("stage", "general")
        grade = item.get("grade", "通用")
        term = item.get("term", "")
        subject = item.get("subject", "通用")
        edition = item.get("edition", "统编版")
        cover_image = item.get("cover_image", f"https://image.xuebaw.com/covers/textbook/{bid}.webp")
        file_size = item.get("file_size", "15.0 MB")
        page_count = item.get("page_count", 0)
        desc = item.get("description", f"{title} 全国中小学统编官方审定正版矢量高清电子教材 PDF。")
        toc = item.get("toc", [])

        # 确定网盘链接
        quark_url = item.get("quark_share_url", "")
        quark_pwd = item.get("quark_extract_code", "")

        if all_in_one_url:
            quark_url = all_in_one_url
            quark_pwd = all_in_one_pwd
        elif stage == "primary" and primary_url:
            quark_url = primary_url
        elif stage == "junior" and junior_url:
            quark_url = junior_url
        elif stage == "senior" and senior_url:
            quark_url = senior_url

        if not quark_url and not allow_no_links:
            # 如果既未提供链接也未开启 --no-links，则跳过
            continue

        # 写入 resources
        sql_lines.append(f"""
        INSERT INTO resources (
            id, slug, channel_slug, title, subtitle, description,
            stage, grade, term, subject, edition, region, school,
            cover_image, file_type, file_size, page_count,
            view_count, save_count, is_recommended, is_published,
            extra_metadata, file_tree, created_at, updated_at
        ) VALUES (
            '{res_uuid}', {escape_sql_str(slug)}, 'book', {escape_sql_str(title)}, {escape_sql_str(edition + ' ' + grade)}, {escape_sql_str(desc)},
            {escape_sql_str(stage)}, {escape_sql_str(grade)}, {escape_sql_str(term)}, {escape_sql_str(subject)}, {escape_sql_str(edition)}, '', '',
            {escape_sql_str(cover_image)}, 'PDF', {escape_sql_str(file_size)}, {page_count},
            {item.get('page_count', 120) * 3}, {item.get('page_count', 120) * 2}, true, true,
            '{{"source": "keben.app", "keben_id": "{bid}"}}'::jsonb, {escape_json_str(toc)}, NOW(), NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            cover_image = EXCLUDED.cover_image,
            file_size = EXCLUDED.file_size,
            page_count = EXCLUDED.page_count,
            is_published = true,
            updated_at = NOW();
        """)
        resource_count += 1

        if quark_url:
            link_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"xuebaw.keben.link.quark.{bid}"))
            sql_lines.append(f"""
            INSERT INTO resource_links (
                id, resource_id, drive_type, share_url, extract_code,
                password_hint, is_primary, click_count, file_size, file_type,
                resource_desc, status, report_count, created_at, updated_at
            ) VALUES (
                '{link_uuid}', '{res_uuid}', 'quark', {escape_sql_str(quark_url)}, {escape_sql_str(quark_pwd)},
                '', true, 0, {escape_sql_str(file_size)}, 'PDF',
                '夸克网盘极速转存 (支持手机免下载预览翻页与A4极清打印)', 'active', 0, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                share_url = EXCLUDED.share_url,
                extract_code = EXCLUDED.extract_code,
                status = 'active',
                updated_at = NOW();
            """)
            link_count += 1

    sql_lines.append("COMMIT;")

    if resource_count == 0:
        print("\n⚠️ 提示：本次未指定任何夸克网盘链接。")
        print("使用示例：")
        print("  1. 一个总文件夹合集链接导入全库 2031 本课本：")
        print("     python3 scripts/import_keben_to_db.py --all-in-one 'https://pan.quark.cn/s/xxxx'\n")
        print("  2. 分小学/初中/高中三大阶段文件夹链接导入：")
        print("     python3 scripts/import_keben_to_db.py --quark-primary 'https://pan.quark.cn/s/p1' --quark-junior 'https://pan.quark.cn/s/j1' --quark-senior 'https://pan.quark.cn/s/s1'\n")
        print("  3. 若希望先将全部课本直接上架书架展示（无链接模式）：")
        print("     python3 scripts/import_keben_to_db.py --no-links\n")
        return

    print(f"正在向 PostgreSQL 写入 {resource_count} 部课本元数据，{link_count} 条夸克直链...")
    full_sql = "\n".join(sql_lines)
    if run_sql_script(full_sql):
        print(f"🎉 成功导入！数据库已新增/更新 {resource_count} 部正版教材资源，前台书架即刻生效。")
    else:
        print("❌ 写入失败，请检查数据库服务状态。")

if __name__ == "__main__":
    main()
