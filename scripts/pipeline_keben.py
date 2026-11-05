#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
K12 电子课本全量抓取与资产沉淀流水线 (keben.app -> R2 + 本地PDF + 学霸网数据集)
"""

import os
import re
import sys
import json
import time
import shutil
import hmac
import hashlib
import datetime
import urllib.request
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

# ==================== 配置项 ====================
BASE_DIR = "/home/zd/netdisk/keben_pipeline"
METADATA_FILE = os.path.join(BASE_DIR, "keben_metadata.json")
COVERS_DIR = os.path.join(BASE_DIR, "covers")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
MASTER_DATASET_FILE = os.path.join(BASE_DIR, "keben_master_dataset.json")

# Cloudflare R2 配置
R2_ACCOUNT_ID = '73d37f32afe703dfcc03ea189fc33fe0'
R2_ACCESS_KEY = '33d6889c2f7ecdf74e0699754d2c4d5b'
R2_SECRET_KEY = '22757aebaa86f6c28173deeab0e8e0b679e932998f9ed6762b8391bcdfbd8090'
R2_BUCKET = 'xuebaw-image'
R2_HOST = f'{R2_ACCOUNT_ID}.r2.cloudflarestorage.com'
R2_PUBLIC_PREFIX = 'https://image.xuebaw.com'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://keben.app/'
}

os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(COVERS_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def get_free_disk_gb():
    total, used, free = shutil.disk_usage(BASE_DIR)
    return free / 1024 / 1024 / 1024

# ==================== R2 上传工具 (原生 AWS SigV4) ====================
def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = hmac.new(k_date, region_name.encode('utf-8'), hashlib.sha256).digest()
    k_service = hmac.new(k_region, service_name.encode('utf-8'), hashlib.sha256).digest()
    k_signing = hmac.new(k_service, 'aws4_request'.encode('utf-8'), hashlib.sha256).digest()
    return k_signing

def upload_buffer_to_r2(key, data_bytes, content_type='image/webp'):
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = now.strftime('%Y%m%d')
    region = 'auto'
    service = 's3'

    payload_hash = hashlib.sha256(data_bytes).hexdigest()
    canonical_uri = f'/{R2_BUCKET}/{key}'
    canonical_headers = f'content-type:{content_type}\nhost:{R2_HOST}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n'
    signed_headers = 'content-type;host;x-amz-content-sha256;x-amz-date'
    canonical_request = f'PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}'

    algorithm = 'AWS4-HMAC-SHA256'
    credential_scope = f'{date_stamp}/{region}/{service}/aws4_request'
    string_to_sign = f'{algorithm}\n{amz_date}\n{credential_scope}\n' + hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()

    signing_key = get_signature_key(R2_SECRET_KEY, date_stamp, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
    auth_header = f'{algorithm} Credential={R2_ACCESS_KEY}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'

    req = urllib.request.Request(
        f'https://{R2_HOST}{canonical_uri}',
        data=data_bytes,
        headers={
            'Host': R2_HOST,
            'Content-Type': content_type,
            'x-amz-date': amz_date,
            'x-amz-content-sha256': payload_hash,
            'Authorization': auth_header
        },
        method='PUT'
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status in (200, 204)

# ==================== 阶段一: 抓取元数据 ====================
def fetch_sitemap_ids():
    print("[1.1] 正在从 keben.app 获取全量 sitemap-0.xml...")
    r = requests.get('https://keben.app/sitemap-0.xml', headers=HEADERS, timeout=20)
    r.raise_for_status()
    urls = re.findall(r'<loc>https://keben\.app/book/(\d+)</loc>', r.text)
    unique_ids = sorted(list(set(urls)), key=lambda x: int(x))
    print(f"      找到共计 {len(unique_ids)} 本电子课本 (ID: {unique_ids[0]} ~ {unique_ids[-1]})")
    return unique_ids

def parse_book_page(book_id):
    url = f"https://keben.app/book/{book_id}"
    api_url = f"https://keben.app/api/download/{book_id}"
    
    res = requests.get(url, headers=HEADERS, timeout=20)
    res.encoding = 'utf-8'
    if res.status_code != 200:
        return None
        
    title = ""
    stage = ""
    subject = ""
    grade = ""
    version = ""
    size_str = ""
    pages = 0
    toc = []
    cover_url = ""
    description = ""

    match = re.search(r'&quot;book&quot;:\[0,(\{.*?\})\]', res.text)
    if match:
        raw_json = match.group(1).replace('&quot;', '"')
        try:
            parsed = json.loads(raw_json)
            def get_val(key, default=""):
                v = parsed.get(key)
                if isinstance(v, list) and len(v) > 1:
                    return v[1]
                return v if v is not None else default
            
            title = get_val("title")
            stage = get_val("stage")
            subject = get_val("subject")
            grade = get_val("grade")
            version = get_val("version")
            size_str = get_val("size")
            pages = get_val("pages", 0)
            cover_url = get_val("coverUrl")
            description = get_val("description")
            
            raw_toc = parsed.get("toc")
            if isinstance(raw_toc, list) and len(raw_toc) > 1 and isinstance(raw_toc[1], list):
                for item in raw_toc[1]:
                    if isinstance(item, list) and len(item) > 1:
                        toc.append(item[1])
        except Exception:
            pass

    pdf_url = ""
    try:
        api_res = requests.get(api_url, headers=HEADERS, timeout=15)
        if api_res.status_code == 200:
            api_data = api_res.json()
            pdf_url = api_data.get("downloadUrl") or api_data.get("primaryUrl") or ""
    except Exception:
        pass

    term = ""
    if "上册" in title:
        term = "上册"
    elif "下册" in title:
        term = "下册"
    elif "全一册" in title:
        term = "全一册"
    elif "必修" in title:
        m = re.search(r'(必修[一二三四五\d]*|选择性必修[一二三四五\d]*)', title)
        if m:
            term = m.group(1)

    stage_code = "general"
    if stage == "小学":
        stage_code = "primary"
    elif stage == "初中":
        stage_code = "junior"
    elif stage == "高中":
        stage_code = "senior"

    return {
        "keben_id": book_id,
        "title": title or f"电子课本 {book_id}",
        "stage": stage or "小学",
        "stage_code": stage_code,
        "grade": grade or "通用",
        "term": term,
        "subject": subject or "通用",
        "edition": version or "统编版",
        "file_size": size_str or "15 MB",
        "page_count": pages if isinstance(pages, int) else 0,
        "cover_url": cover_url,
        "r2_cover_url": f"{R2_PUBLIC_PREFIX}/covers/textbook/{book_id}.webp",
        "description": description or f"{title} 电子课本高清无水印完整版 PDF。",
        "toc": toc,
        "pdf_download_url": pdf_url
    }

def scrape_all_metadata():
    print("\n================== [1/3] 开始全量元数据抓取 ==================")
    all_ids = fetch_sitemap_ids()
    
    existing_meta = {}
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                existing_meta = {item["keben_id"]: item for item in data}
                print(f"[断点续传] 已存在 {len(existing_meta)} 本书元数据缓存")
        except Exception:
            pass

    to_fetch_ids = [bid for bid in all_ids if bid not in existing_meta]
    print(f"本次需抓取元数据: {len(to_fetch_ids)} 本")

    lock = threading.Lock()
    completed_count = len(existing_meta)
    total_count = len(all_ids)

    def worker(bid):
        nonlocal completed_count
        for attempt in range(3):
            try:
                res = parse_book_page(bid)
                if res and res.get("title"):
                    with lock:
                        existing_meta[bid] = res
                        completed_count += 1
                        if completed_count % 50 == 0 or completed_count == total_count:
                            print(f"      [抓取进度] {completed_count}/{total_count} ({(completed_count/total_count*100):.1f}%) 最新: {res['title']}")
                            with open(METADATA_FILE, "w", encoding="utf-8") as f:
                                json.dump(list(existing_meta.values()), f, ensure_ascii=False, indent=2)
                    return True
            except Exception:
                time.sleep(1)
        return False

    if to_fetch_ids:
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = [executor.submit(worker, bid) for bid in to_fetch_ids]
            for f in as_completed(futures):
                pass

    final_list = sorted(list(existing_meta.values()), key=lambda x: int(x["keben_id"]))
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(final_list, f, ensure_ascii=False, indent=2)
    print(f"✅ 元数据抓取完成！共收集 {len(final_list)} 本书，已保存至: {METADATA_FILE}")
    return final_list

# ==================== 阶段二: 下载封面并同步到 Cloudflare R2 ====================
def sync_covers_to_r2(meta_list):
    print("\n================== [2/3] 封面下载与 Cloudflare R2 同步 ==================")
    print(f"总计检查 {len(meta_list)} 本书封面...")

    lock = threading.Lock()
    synced_count = 0
    total_count = len(meta_list)

    def cover_worker(item):
        nonlocal synced_count
        bid = item["keben_id"]
        cover_url = item.get("cover_url")
        if not cover_url:
            return

        local_path = os.path.join(COVERS_DIR, f"{bid}.webp")
        if not os.path.exists(local_path) or os.path.getsize(local_path) < 1000:
            try:
                r = requests.get(cover_url, headers=HEADERS, timeout=15)
                if r.status_code == 200 and len(r.content) > 500:
                    with open(local_path, "wb") as f:
                        f.write(r.content)
            except Exception:
                pass

        if not os.path.exists(local_path):
            return

        r2_key = f"covers/textbook/{bid}.webp"
        with open(local_path, "rb") as f:
            data = f.read()

        try:
            ok = upload_buffer_to_r2(r2_key, data, content_type='image/webp')
            if ok:
                with lock:
                    synced_count += 1
                    if synced_count % 100 == 0 or synced_count == total_count:
                        print(f"      [R2 同步进度] {synced_count}/{total_count} ({(synced_count/total_count*100):.1f}%) 最新封面: {r2_key}")
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(cover_worker, item) for item in meta_list]
        for f in as_completed(futures):
            pass

    print(f"✅ 封面同步完成！全量封面已就绪在 R2: {R2_PUBLIC_PREFIX}/covers/textbook/{{id}}.webp")

# ==================== 阶段三: PDF 并发下载与归档 ====================
def clean_filename(s):
    return re.sub(r'[\/\\:\*\?"<>\|\s]+', '_', s).strip('_')

def get_existing_download_map():
    existing_files = {}
    for root, dirs, files in os.walk(DOWNLOADS_DIR):
        for file in files:
            if file.endswith('.pdf') and file.startswith('[') and ']' in file:
                bid = file[1:file.index(']')]
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, BASE_DIR)
                size_mb = os.path.getsize(full_path) / 1024 / 1024
                existing_files[bid] = (rel_path, size_mb)
    return existing_files

def get_historical_master_map():
    """读取 Master 数据集中已处理并标记为 is_downloaded: true 的历史记录（支持已上传夸克并释放本地空间的文件）"""
    history_map = {}
    candidates = [
        MASTER_DATASET_FILE,
        os.path.join(BASE_DIR, "keben_master_dataset.backup.json")
    ]
    for target_file in candidates:
        if os.path.exists(target_file):
            try:
                with open(target_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for m in data:
                    if m.get('is_downloaded'):
                        history_map[m['keben_id']] = m
                if history_map:
                    break
            except Exception:
                pass
    return history_map

def generate_master_dataset():
    if not os.path.exists(METADATA_FILE):
        print(f"❌ 元数据文件不存在: {METADATA_FILE}")
        return

    with open(METADATA_FILE, 'r', encoding='utf-8') as f:
        meta_list = json.load(f)

    existing_files = get_existing_download_map()
    history_map = get_historical_master_map()

    master_records = []
    for item in meta_list:
        bid = item['keben_id']
        is_on_disk = bid in existing_files
        hist_rec = history_map.get(bid)

        is_downloaded = is_on_disk or (hist_rec is not None and hist_rec.get('is_downloaded', False))

        if is_on_disk:
            rel_path, actual_mb = existing_files[bid]
            file_size_str = f"{actual_mb:.1f} MB"
        elif hist_rec and hist_rec.get('is_downloaded'):
            rel_path = hist_rec.get('local_pdf_path', '')
            file_size_str = hist_rec.get('file_size', item.get('file_size', '15 MB'))
        else:
            rel_path = ''
            file_size_str = item.get('file_size', '15 MB')

        record = {
            'id': f"keben-{bid}",
            'keben_id': bid,
            'slug': f"res-keben-{bid}",
            'channel_slug': "book",
            'title': item['title'],
            'stage': item.get('stage_code', 'general'),
            'grade': item.get('grade', '通用'),
            'term': item.get('term', ''),
            'subject': item.get('subject', '通用'),
            'edition': item.get('edition', '统编版'),
            'file_type': "PDF",
            'file_size': file_size_str,
            'page_count': item.get('page_count', 0),
            'cover_image': item.get('r2_cover_url', f"{R2_PUBLIC_PREFIX}/covers/textbook/{bid}.webp"),
            'description': item.get('description', ''),
            'toc': item.get('toc', []),
            'is_downloaded': is_downloaded,
            'local_pdf_path': rel_path,
            'pdf_download_url': item.get('pdf_download_url', ''),
            'quark_share_url': hist_rec.get('quark_share_url', '') if hist_rec else '',
            'quark_extract_code': hist_rec.get('quark_extract_code', '') if hist_rec else '',
            'baidu_share_url': hist_rec.get('baidu_share_url', '') if hist_rec else '',
            'baidu_extract_code': hist_rec.get('baidu_extract_code', '') if hist_rec else ''
        }
        master_records.append(record)

    with open(MASTER_DATASET_FILE, 'w', encoding='utf-8') as f:
        json.dump(master_records, f, ensure_ascii=False, indent=2)

    total_dl = sum(1 for r in master_records if r['is_downloaded'])
    print(f"✅ Master 数据集已生成: {MASTER_DATASET_FILE} (总计 {len(master_records)} 条，已处理/已下载 {total_dl} 条)")

def download_remaining_pdfs(meta_list, min_free_gb=1.0):
    print("\n================== [3/3] PDF 资源多线程下载与归档 (仅下载未处理资料) ==================")
    existing_files = get_existing_download_map()
    history_map = get_historical_master_map()

    # 历史已标记为下载（包括已上传夸克清空的）与磁盘现有的，均视为已完成
    already_processed_ids = set(existing_files.keys()).union(set(history_map.keys()))

    to_download = [item for item in meta_list if item["keben_id"] not in already_processed_ids]

    print(f"📊 状态总览:")
    print(f"  • 课本元数据总数: {len(meta_list)} 本")
    print(f"  • 历史已完成(含已上传夸克): {len(history_map)} 本")
    print(f"  • 本地磁盘现有文件: {len(existing_files)} 本")
    print(f"  • 累计已处理比例: {len(already_processed_ids)} / {len(meta_list)} ({(len(already_processed_ids)/len(meta_list)*100):.1f}%)")
    print(f"  • 🎯 本次真正待下载补充: {len(to_download)} 本")
    print(f"  • 当前 /home 可用磁盘空间: {get_free_disk_gb():.2f} GB (安全阈值: {min_free_gb} GB)")

    if not to_download:
        print("🎉 恭喜！当前筛选范围内的所有课本均已下载完毕，无需重复下载。")
        generate_master_dataset()
        return

    lock = threading.Lock()
    done_count = 0
    total_to_download = len(to_download)
    stop_signal = False

    def pdf_worker(item):
        nonlocal done_count, stop_signal
        if stop_signal:
            return

        free_gb = get_free_disk_gb()
        if free_gb <= min_free_gb:
            with lock:
                if not stop_signal:
                    stop_signal = True
                    print(f"\n⚠️ [磁盘安全触发] 可用空间仅剩 {free_gb:.2f} GB，已自动暂停下载！")
                    print(f"💡 建议：可将新下载的文件上传至网盘后释放空间。")
            return

        bid = item["keben_id"]
        title = item["title"]
        stage = item.get("stage") or "小学"
        grade = item.get("grade") or "通用"
        subject = item.get("subject") or "通用"
        pdf_url = item.get("pdf_download_url")

        folder = os.path.join(DOWNLOADS_DIR, clean_filename(stage), clean_filename(grade), clean_filename(subject))
        os.makedirs(folder, exist_ok=True)
        safe_name = f"[{bid}] {clean_filename(title)}.pdf"
        dest_path = os.path.join(folder, safe_name)

        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1024 * 100:
            try:
                with open(dest_path, "rb") as f:
                    if f.read(5) == b'%PDF-':
                        with lock:
                            done_count += 1
                        return
            except Exception:
                pass

        temp_dest = dest_path + ".tmp"
        for attempt in range(3):
            if stop_signal:
                return
            
            # 如果首次或重试，若 url 为空或重试则刷新最新直链
            if not pdf_url or attempt > 0:
                try:
                    api_res = requests.get(f"https://keben.app/api/download/{bid}", headers=HEADERS, timeout=15)
                    if api_res.status_code == 200:
                        api_data = api_res.json()
                        pdf_url = api_data.get("downloadUrl") or api_data.get("primaryUrl") or pdf_url
                except Exception:
                    pass

            if not pdf_url:
                time.sleep(1)
                continue

            try:
                with requests.get(pdf_url, headers=HEADERS, stream=True, timeout=60, allow_redirects=True) as r:
                    r.raise_for_status()
                    with open(temp_dest, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 512):
                            if stop_signal:
                                break
                            if chunk:
                                f.write(chunk)

                if stop_signal:
                    if os.path.exists(temp_dest):
                        try: os.remove(temp_dest)
                        except: pass
                    return

                with open(temp_dest, "rb") as f:
                    header = f.read(5)
                    if header == b'%PDF-':
                        os.rename(temp_dest, dest_path)
                        with lock:
                            done_count += 1
                            mb = os.path.getsize(dest_path) / 1024 / 1024
                            rem_gb = get_free_disk_gb()
                            print(f"      [下载进度] {done_count}/{total_to_download} 完成: {safe_name} ({mb:.1f}MB, 剩余空间 {rem_gb:.1f}GB)")
                        return
                    else:
                        if os.path.exists(temp_dest):
                            os.remove(temp_dest)
            except Exception:
                if os.path.exists(temp_dest):
                    try: os.remove(temp_dest)
                    except: pass
                time.sleep(2)

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(pdf_worker, item) for item in to_download]
        for f in as_completed(futures):
            pass

    generate_master_dataset()

# ==================== CLI 入口 ====================
if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "--resume"
    # 支持过滤指定学段
    selected_stage = None
    if "--stage" in sys.argv:
        idx = sys.argv.index("--stage")
        if idx + 1 < len(sys.argv):
            selected_stage = sys.argv[idx + 1]

    if action == "--status":
        print(f"=== 课本资产流水线详细状态报告 ===")
        print(f"存储根目录: {BASE_DIR}")
        print(f"剩余可用磁盘: {get_free_disk_gb():.2f} GB")
        if os.path.exists(METADATA_FILE):
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                meta = json.load(f)
            existing_disk = get_existing_download_map()
            history_map = get_historical_master_map()
            all_done_ids = set(existing_disk.keys()).union(set(history_map.keys()))

            stage_stats = {}
            for item in meta:
                st = item.get("stage") or "其他"
                if st not in stage_stats:
                    stage_stats[st] = {"total": 0, "done": 0, "disk": 0, "missing": 0}
                stage_stats[st]["total"] += 1
                bid = item["keben_id"]
                if bid in all_done_ids:
                    stage_stats[st]["done"] += 1
                else:
                    stage_stats[st]["missing"] += 1
                if bid in existing_disk:
                    stage_stats[st]["disk"] += 1

            print(f"\n【各学段实际已完成（含已传夸克与本地）与缺失待下载统计】")
            for st, s in stage_stats.items():
                pct = (s["done"] / s["total"] * 100) if s["total"] > 0 else 0
                print(f"  • {st}: 总计 {s['total']} 本 | 累计已处理 {s['done']} 本 ({pct:.1f}%) [磁盘现有 {s['disk']} 本] | ❌ 缺失待下载: {s['missing']} 本")

            total_missing = sum(s["missing"] for s in stage_stats.values())
            print(f"\n全库总计: 2032 本 | 累计已处理 {len(all_done_ids)} 本 ({(len(all_done_ids)/len(meta)*100):.1f}%) | 🎯 待下载补充: {total_missing} 本")
    elif action == "--generate-json":
        generate_master_dataset()
    elif action == "--resume" or "--stage" in sys.argv:
        if not os.path.exists(METADATA_FILE):
            meta_list = scrape_all_metadata()
            sync_covers_to_r2(meta_list)
        else:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                meta_list = json.load(f)

        if selected_stage:
            print(f"🎯 指定只下载【{selected_stage}】学段...")
            meta_list = [it for it in meta_list if it.get("stage") == selected_stage]

        download_remaining_pdfs(meta_list, min_free_gb=1.0)
    else:
        print("用法:")
        print("  python3 pipeline_keben.py --status                # 查看各学段详细下载与缺失统计")
        print("  python3 pipeline_keben.py --stage 初中            # 优先单下初中缺失课本")
        print("  python3 pipeline_keben.py --stage 小学            # 优先单下小学缺失课本")
        print("  python3 pipeline_keben.py --stage 高中            # 优先单下高中缺失课本")
        print("  python3 pipeline_keben.py --resume                # 全局继续下载全部缺失课本")
        print("  python3 pipeline_keben.py --generate-json         # 刷新生成主数据集 JSON")
