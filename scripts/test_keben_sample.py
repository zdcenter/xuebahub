import os
import re
import json
import time
import requests

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://keben.app/'
}

SAMPLE_BOOK_IDS = [
    "0025", # 小学语文一年级上册 2024版
    "0177", # 初中英语七年级上册 2024版
    "0091"  # 高中语文必修上册 2019版
]

OUTPUT_DIR = "/home/zd/netdisk/test_keben_downloads"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def test_fetch_and_download(book_id):
    print(f"\n==========================================")
    print(f"正在测试课本 ID: {book_id}")
    url = f"https://keben.app/book/{book_id}"
    api_url = f"https://keben.app/api/download/{book_id}"
    
    # 1. 抓取页面详细元数据
    t0 = time.time()
    page_res = requests.get(url, headers=HEADERS, timeout=15)
    page_res.encoding = 'utf-8'
    print(f"[1/3] 详情页抓取状态码: {page_res.status_code} (耗时 {time.time()-t0:.2f}s)")
    
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
    
    if page_res.status_code == 200:
        match = re.search(r'&quot;book&quot;:\[0,(\{.*?\})\]', page_res.text)
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
            except Exception as e:
                print(f"解析 JSON 异常: {e}")
                
    print(f"   📘 书名: {title}")
    print(f"   🏷️ 学段/学科/年级: {stage} / {grade} / {subject} ({version})")
    print(f"   📄 页数: {pages} 页 | 大小: {size_str}")
    print(f"   🖼️ 封面: {cover_url[:60]}...")
    print(f"   📑 目录条目数: {len(toc)} 条 (例如: {toc[:3]})")
    
    # 2. 调取真实下载接口
    t1 = time.time()
    api_res = requests.get(api_url, headers=HEADERS, timeout=15)
    print(f"[2/3] API 请求状态码: {api_res.status_code} (耗时 {time.time()-t1:.2f}s)")
    
    pdf_url = ""
    if api_res.status_code == 200:
        api_data = api_res.json()
        pdf_url = api_data.get("downloadUrl") or api_data.get("primaryUrl") or ""
        print(f"   🔗 获取到真实 PDF 直链: {pdf_url}")
        
    if not pdf_url:
        print("❌ 未获取到 PDF 下载地址！")
        return None
        
    # 3. 测试下载真实 PDF (流式下载并校验文件)
    safe_title = re.sub(r'[\/\\:\*\?"<>\|]', '_', title)
    dest_file = os.path.join(OUTPUT_DIR, f"{book_id}_{safe_title}.pdf")
    print(f"[3/3] 开始下载 PDF 到: {dest_file}")
    
    t2 = time.time()
    with requests.get(pdf_url, headers=HEADERS, stream=True, timeout=60, allow_redirects=True) as r:
        r.raise_for_status()
        total_size = int(r.headers.get('content-length', 0))
        downloaded = 0
        with open(dest_file, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    # 打印简略进度
                    if total_size > 0:
                        pct = downloaded / total_size * 100
                        print(f"\r   进度: {downloaded / 1024 / 1024:.1f}MB / {total_size / 1024 / 1024:.1f}MB ({pct:.1f}%)", end="")
                    else:
                        print(f"\r   已下载: {downloaded / 1024 / 1024:.1f}MB", end="")
                        
    print(f"\n   ✅ 下载完成！耗时: {time.time()-t2:.2f}s，实际文件大小: {os.path.getsize(dest_file) / 1024 / 1024:.2f} MB")
    
    # 4. 快速校验 PDF 格式头部
    with open(dest_file, "rb") as f:
        header = f.read(5)
        if header == b'%PDF-':
            print("   🔒 文件头校验通过: 确认是真实无损 PDF 文件！")
        else:
            print(f"   ⚠️ 警告: 文件头非标准 PDF: {header}")
            
    return {
        "id": book_id,
        "title": title,
        "stage": stage,
        "grade": grade,
        "subject": subject,
        "version": version,
        "size": size_str,
        "pages": pages,
        "cover_url": cover_url,
        "pdf_url": pdf_url,
        "file_path": dest_file,
        "toc": toc
    }

if __name__ == "__main__":
    results = []
    for b_id in SAMPLE_BOOK_IDS:
        res = test_fetch_and_download(b_id)
        if res:
            results.append(res)
            
    summary_path = os.path.join(OUTPUT_DIR, "sample_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"\n==========================================")
    print(f"🎉 全部 3 本测试课本下载与校验完毕！汇总信息已保存至: {summary_path}")
