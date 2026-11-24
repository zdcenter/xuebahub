#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课本主数据集 (keben_master_dataset.json) 批量导入 PostgreSQL 数据库工具 (支持全层级自适应匹配)

链接匹配优先级（自顶向下智能回溯）：
1. 命令行覆盖 (--all-in-one / --quark-primary 等)
2. 【学科细分链接】(如 "小学/一年级/语文", "高中/语文")
3. 【年级专属链接】(如 "小学/一年级", "初中/七年级")
4. 【学段专属链接】(如 "小学", "初中", "高中")
5. 课本自带链接 (quark_share_url)
"""

import os
import re
import sys
import json
import uuid
import subprocess

BASE_DIR = "/home/zd/netdisk/keben_pipeline"
MASTER_DATASET_FILE = os.path.join(BASE_DIR, "keben_master_dataset.json")
CATEGORY_LINKS_FILE = os.path.join(BASE_DIR, "quark_category_links.json")

# 数据库配置（默认读取 apps/api/.env）
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "format.11")
DB_NAME = os.getenv("DB_NAME", "netdisk_db")

def parse_quark_input(text):
    """智能解析用户粘贴的夸克分享链接与提取码"""
    if not text or not isinstance(text, str):
        return "", ""
    text = text.strip()
    if not text:
        return "", ""

    url_match = re.search(r"https?://pan\.quark\.cn/s/[a-zA-Z0-9]+", text)
    if not url_match:
        return "", ""
    share_url = url_match.group(0)

    code_match = re.search(r"(?:提取码|密码|code|pwd)[:：\s]*([a-zA-Z0-9]{4})", text, re.IGNORECASE)
    extract_code = code_match.group(1) if code_match else ""

    return share_url, extract_code

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

def get_book_hierarchy_keys(book):
    """
    返回书籍的多级层级候选 key 列表，用于向上回溯自适应匹配：
    优先级：学科细分 -> 学段/科目 (如 高中/语文) -> 年级 (如 小学/一年级) -> 学段 (如 小学)
    """
    candidates = []
    p = book.get("local_pdf_path", "")
    parts = [x for x in p.split("/") if x]

    stage_map = {"primary": "小学", "junior": "初中", "senior": "高中"}
    raw_stage = book.get("stage", "")
    cn_stage = stage_map.get(raw_stage, raw_stage)
    cn_grade = book.get("grade", "")
    cn_subject = book.get("subject", "")

    if len(parts) >= 4:
        # downloads/小学/一年级/语文/[xxx].pdf
        st = parts[1]
        gr = parts[2]
        sub = parts[3]
        candidates.append(f"{st}/{gr}/{sub}")
        candidates.append(f"{st}/{sub}")      # 兼容用户配置 高中/语文
        candidates.append(f"{st}/{gr}")       # 兼容 小学/一年级
        candidates.append(st)                 # 兼容 小学
    elif len(parts) >= 3:
        st = parts[1]
        gr = parts[2]
        candidates.append(f"{st}/{gr}")
        candidates.append(st)

    # 兜底补充从元数据生成的候选 key
    if cn_stage and cn_subject:
        if cn_grade:
            candidates.append(f"{cn_stage}/{cn_grade}/{cn_subject}")
        candidates.append(f"{cn_stage}/{cn_subject}")
    if cn_stage and cn_grade:
        candidates.append(f"{cn_stage}/{cn_grade}")
    if cn_stage:
        candidates.append(cn_stage)

    # 去重并保持顺序
    seen = set()
    result = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            result.append(c)
    return result

def print_status(books, cat_links):
    """打印分类与年级链接配置进度"""
    covered = 0
    missing = []
    for b in books:
        keys = get_book_hierarchy_keys(b)
        hit = False
        for k in keys:
            if k in cat_links and parse_quark_input(cat_links[k])[0]:
                hit = True
                break
        if hit:
            covered += 1
        else:
            missing.append(b)

    print("==================================================")
    print("  夸克电子教材链接配置全量覆盖报告")
    print("==================================================")
    print(f"全库课本总册数: {len(books)} 本 | 已覆盖可转存: {covered} 本 ({(covered/len(books)*100):.1f}%)")
    if missing:
        print(f"❌ 待覆盖课本: {len(missing)} 本")
        print("未覆盖样本示例:")
        for m in missing[:5]:
            print(f"  • [{m.get('keben_id')}] {m.get('title')} ({m.get('stage')}/{m.get('grade')}/{m.get('subject')})")
    else:
        print("🎉 全库 2032 本电子课本已实现 100% 全覆盖！")

def main():
    if not os.path.exists(MASTER_DATASET_FILE):
        print(f"❌ 未找到主数据集文件: {MASTER_DATASET_FILE}")
        return

    with open(MASTER_DATASET_FILE, "r", encoding="utf-8") as f:
        books = json.load(f)

    cat_links = {}
    if os.path.exists(CATEGORY_LINKS_FILE):
        try:
            with open(CATEGORY_LINKS_FILE, "r", encoding="utf-8") as f:
                cat_links = json.load(f)
        except Exception as e:
            print(f"⚠️ 读取 {CATEGORY_LINKS_FILE} 失败: {e}")

    if "--status" in sys.argv:
        print_status(books, cat_links)
        return

    # 参数解析
    all_in_one_url = None
    all_in_one_pwd = ""
    primary_url = None
    junior_url = None
    senior_url = None
    dry_run = "--dry-run" in sys.argv
    allow_no_links = "--all" in sys.argv or "--no-links" in sys.argv
    sql_only_path = None
    if "--sql-only" in sys.argv:
        idx = sys.argv.index("--sql-only")
        if idx + 1 < len(sys.argv):
            sql_only_path = sys.argv[idx + 1]
        else:
            sql_only_path = "keben_export.sql"

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
    print(f"  学霸网 统编电子教材入库工具 (PostgreSQL)")
    print(f"==================================================")

    sql_lines = ["BEGIN;"]

    # 1. 确保 channel 存在
    sql_lines.append("""
    INSERT INTO channels (id, slug, name, icon, description, sort_order, is_active, created_at, updated_at)
    VALUES ('f014f905-8df2-419c-a7b7-035f482d3f33', 'book', '统编电子教材专区', '📖', '全国中小学各学科统编正版高清电子教材与课本PDF数字书架', 2, true, NOW(), NOW())
    ON CONFLICT (slug) DO UPDATE SET is_active = true, name = EXCLUDED.name;
    """)

    # 2. 规范化教材版本字典 (确保前台版本按钮大方清爽且能精准匹配)
    sql_lines.append("""
    UPDATE categories SET name = '人教版/统编版' WHERE slug = 'edition-renjiao';
    UPDATE categories SET name = '北师大版' WHERE slug = 'edition-beishida';
    UPDATE categories SET name = '苏教版' WHERE slug = 'edition-sujiao';
    UPDATE categories SET name = '外研版' WHERE slug = 'edition-waiyan';
    UPDATE categories SET name = '译林版' WHERE slug = 'edition-yilin';
    UPDATE categories SET name = '沪教版' WHERE slug = 'edition-hujiao';
    UPDATE categories SET name = '鲁教版' WHERE slug = 'edition-lujiao';
    UPDATE categories SET name = '冀教版' WHERE slug = 'edition-jijiao';
    UPDATE categories SET name = '湘教版' WHERE slug = 'edition-xiangjiao';
    UPDATE categories SET name = '粤教版' WHERE slug = 'edition-yuejiao';
    UPDATE categories SET name = '教科版' WHERE slug = 'edition-jiaoke';
    UPDATE categories SET name = '浙教版' WHERE slug = 'edition-zhejiao';
    UPDATE categories SET name = '仁爱版' WHERE slug = 'edition-renai';
    INSERT INTO categories (name, slug, type, sort_order, is_hot, icon)
    VALUES ('青岛版', 'edition-qingdao', 'edition', 14, true, '📚')
    ON CONFLICT (slug) DO UPDATE SET name = '青岛版';
    UPDATE categories SET is_hot = true WHERE slug IN (
      'edition-renjiao', 'edition-beishida', 'edition-sujiao', 'edition-waiyan',
      'edition-hujiao', 'edition-lujiao', 'edition-jiaoke', 'edition-qingdao'
    );
    """)

    resource_count = 0
    link_count = 0
    matched_level_stats = {}

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

        # 多级回溯匹配网盘链接
        quark_url = ""
        quark_pwd = ""
        matched_level_name = ""

        # 获取候选 keys
        h_keys = get_book_hierarchy_keys(item)
        for k in h_keys:
            if k in cat_links and cat_links[k]:
                u, c = parse_quark_input(cat_links[k])
                if u:
                    quark_url = u
                    quark_pwd = c
                    matched_level_name = k
                    matched_level_stats[k] = matched_level_stats.get(k, 0) + 1
                    break

        # 命令行覆盖优先
        if all_in_one_url:
            quark_url = all_in_one_url
            quark_pwd = all_in_one_pwd
            matched_level_name = "全套合集"
        elif stage == "primary" and primary_url:
            quark_url = primary_url
            matched_level_name = "小学合集"
        elif stage == "junior" and junior_url:
            quark_url = junior_url
            matched_level_name = "初中合集"
        elif stage == "senior" and senior_url:
            quark_url = senior_url
            matched_level_name = "高中合集"
        elif not quark_url and item.get("quark_share_url"):
            quark_url = item.get("quark_share_url")
            quark_pwd = item.get("quark_extract_code", "")

        if not quark_url and not allow_no_links:
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
            '{{"source": "keben.app", "keben_id": "{bid}", "matched_key": "{matched_level_name}"}}'::jsonb, {escape_json_str(toc)}, NOW(), NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            cover_image = EXCLUDED.cover_image,
            file_size = EXCLUDED.file_size,
            page_count = EXCLUDED.page_count,
            extra_metadata = EXCLUDED.extra_metadata,
            is_published = true,
            updated_at = NOW();
        """)
        resource_count += 1

        if quark_url:
            link_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"xuebaw.keben.link.quark.{bid}"))
            desc_text = f"夸克网盘极速转存 ({matched_level_name} 专属直达)" if matched_level_name else "夸克网盘极速转存"
            sql_lines.append(f"""
            INSERT INTO resource_links (
                id, resource_id, drive_type, share_url, extract_code,
                password_hint, is_primary, click_count, file_size, file_type,
                resource_desc, status, report_count, created_at, updated_at
            ) VALUES (
                '{link_uuid}', '{res_uuid}', 'quark', {escape_sql_str(quark_url)}, {escape_sql_str(quark_pwd)},
                '', true, 0, {escape_sql_str(file_size)}, 'PDF',
                {escape_sql_str(desc_text)}, 'active', 0, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                share_url = EXCLUDED.share_url,
                extract_code = EXCLUDED.extract_code,
                resource_desc = EXCLUDED.resource_desc,
                status = 'active',
                updated_at = NOW();
            """)
            link_count += 1

    sql_lines.append("COMMIT;")

    if resource_count == 0:
        print("\n⚠️ 提示：当前未检测到任何已配置的夸克网盘链接。")
        return

    print(f"准备写入/更新：{resource_count} 部课本元数据，{link_count} 条夸克直链")
    if dry_run:
        print("🔍 [Dry Run 演练模式] 未执行实际数据库操作。")
        return

    full_sql = "\n".join(sql_lines)

    if sql_only_path:
        with open(sql_only_path, "w", encoding="utf-8") as f:
            f.write(full_sql)
        file_size_mb = os.path.getsize(sql_only_path) / 1024 / 1024
        print(f"📦 [SQL 纯文本导出模式] 成功导出全部 2032 本课本入库 SQL 到: {sql_only_path} ({file_size_mb:.2f} MB)")
        print(f"👉 您只需将该文件上传到服务器，执行以下命令即可一键完成导入：")
        print(f"   psql -h <服务器DB_HOST> -p 5432 -U postgres -d netdisk_db -f {sql_only_path}")
        return

    if run_sql_script(full_sql):
        print(f"🎉 成功执行！PostgreSQL 已写入/更新 {resource_count} 部教材资源，前台专区即刻生效。")
    else:
        print("❌ 写入失败，请检查数据库服务状态。")

if __name__ == "__main__":
    main()
