#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
夸克网盘目录交互式浏览与批量子文件夹分享工具 (Quark Batch Sharer)

功能特性：
1. 从本地数据库自动获取已配置的夸克网盘账号与有效 Cookie。
2. 交互式向下钻取网盘文件夹（支持查看任意学段、年级）。
3. 列出当前目录下的所有子文件夹（如：语文、数学、道德与法治、科学等）。
4. 支持自由多选（如输入 1,2 或 1-3 或 all 全选）批量生成永久免密公开分享链接。
5. 自动格式化排版分享结果，支持一键保存同步到 keben_pipeline/quark_category_links.json。
6. 支持可选直接自动调用 import_keben_to_db.py 完成新课本入库上架！
"""

import os
import sys
import json
import time
import random
import subprocess
import requests

BASE_DIR = "/home/zd/netdisk/keben_pipeline"
CATEGORY_LINKS_FILE = os.path.join(BASE_DIR, "quark_category_links.json")
IMPORT_SCRIPT = "/home/zd/netdisk/scripts/import_keben_to_db.py"

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "format.11")
DB_NAME = os.getenv("DB_NAME", "netdisk_db")

def get_quark_cookie_from_db():
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    cmd = ["psql", "-h", DB_HOST, "-p", DB_PORT, "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c",
           "SELECT cookie FROM netdisk_accounts WHERE is_default=true LIMIT 1;"]
    try:
        cookie = subprocess.check_output(cmd, env=env, text=True).strip()
        if not cookie:
            cmd2 = ["psql", "-h", DB_HOST, "-p", DB_PORT, "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c",
                    "SELECT cookie FROM netdisk_accounts WHERE cookie != '' ORDER BY is_default DESC LIMIT 1;"]
            cookie = subprocess.check_output(cmd2, env=env, text=True).strip()
        return cookie
    except Exception as e:
        print(f"❌ 读取数据库网盘账号失败: {e}")
        return ""

class QuarkClient:
    def __init__(self, cookie):
        self.cookie = cookie
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://pan.quark.cn',
            'Referer': 'https://pan.quark.cn/',
            'Cookie': self.cookie,
            'Content-Type': 'application/json;charset=UTF-8'
        }

    def list_folders(self, pdir_fid="0"):
        url = f"https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid={pdir_fid}&_page=1&_size=100&_fetch_total=1&_fetch_sub_dirs=1&_sort=file_type:asc,file_name:asc"
        try:
            r = requests.get(url, headers=self.headers, timeout=15)
            data = r.json()
            if data.get("code") != 0:
                print(f"⚠️ 夸克接口返回错误: {data.get('message')}")
                return []
            items = []
            for it in data.get("data", {}).get("list", []):
                if it.get("dir"):
                    items.append({
                        "fid": it.get("fid"),
                        "name": it.get("file_name")
                    })
            return items
        except Exception as e:
            print(f"❌ 网络请求异常: {e}")
            return []

    def create_share(self, fid, title="电子教材"):
        t = int(time.time() * 1000)
        dt = random.randint(1000, 9999)
        url = f"https://drive-pc.quark.cn/1/clouddrive/share?pr=ucpro&fr=pc&__dt={dt}&__t={t}"
        payload = {
            "fid_list": [fid],
            "title": title,
            "url_type": 1,
            "expired_type": 1,
            "expire_time": 0
        }
        try:
            r = requests.post(url, headers=self.headers, json=payload, timeout=20)
            res = r.json()
            if res.get("code") != 0:
                return None, f"创建分享失败: {res.get('message')}"
            
            share_id = res.get("data", {}).get("share_id", "")
            if not share_id and res.get("data", {}).get("task_id"):
                task_id = res["data"]["task_id"]
                for _ in range(8):
                    time.sleep(0.5)
                    task_url = f"https://drive-pc.quark.cn/1/clouddrive/task?pr=ucpro&fr=pc&task_id={task_id}&__dt={random.randint(1000,9999)}&__t={int(time.time()*1000)}"
                    tr = requests.get(task_url, headers=self.headers, timeout=10).json()
                    if tr.get("data", {}).get("share_id"):
                        share_id = tr["data"]["share_id"]
                        break

            if not share_id:
                return None, "未能获取到 share_id"

            # 获取真实公开访问链接及提取码
            pwd_url = f"https://drive-pc.quark.cn/1/clouddrive/share/password?pr=ucpro&fr=pc&__dt={random.randint(1000,9999)}&__t={int(time.time()*1000)}"
            pr = requests.post(pwd_url, headers=self.headers, json={"share_id": share_id}, timeout=15).json()
            share_url = pr.get("data", {}).get("share_url") or f"https://pan.quark.cn/s/{share_id}"
            pwd = pr.get("data", {}).get("share_pwd", "")
            return {
                "share_id": share_id,
                "share_url": share_url,
                "extract_code": pwd,
                "title": title
            }, None
        except Exception as e:
            return None, f"网络异常: {e}"

def parse_selection(input_str, max_n):
    """解析用户输入的选项，如 1,2 或 1-3 或 all"""
    s = input_str.strip().lower()
    if s == "all" or s == "a":
        return list(range(1, max_n + 1))
    
    selected = set()
    parts = s.replace("，", ",").split(",")
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if "-" in p:
            sub = p.split("-")
            if len(sub) == 2 and sub[0].isdigit() and sub[1].isdigit():
                start, end = int(sub[0]), int(sub[1])
                for x in range(start, end + 1):
                    if 1 <= x <= max_n:
                        selected.add(x)
        elif p.isdigit():
            x = int(p)
            if 1 <= x <= max_n:
                selected.add(x)
    return sorted(list(selected))

def main():
    print("=" * 60)
    print("      夸克网盘目录浏览与批量子文件夹分享工具")
    print("=" * 60)

    cookie = get_quark_cookie_from_db()
    if not cookie:
        print("❌ 未能在本地数据库中找到有效的夸克网盘 Cookie，请先在管理后台配置。")
        return

    client = QuarkClient(cookie)
    current_fid = "0"
    path_stack = [{"fid": "0", "name": "根目录"}]

    while True:
        # 拼接当前路径名（排除根目录和 keben_pdf 前缀以对应标准分类）
        display_path = " / ".join(c["name"] for c in path_stack)
        print(f"\n📂 当前网盘位置: 【{display_path}】")
        folders = client.list_folders(current_fid)

        if not folders:
            print("  (该目录下没有子文件夹)")
            if len(path_stack) > 1:
                input("按回车返回上一级...")
                path_stack.pop()
                current_fid = path_stack[-1]["fid"]
                continue
            else:
                break

        print("-" * 50)
        for idx, f in enumerate(folders, 1):
            print(f"  [{idx}] 📁 {f['name']}")
        print("-" * 50)
        print("操作提示：")
        print("  • 输入编号（如 1 或 2）进入对应子文件夹")
        print("  • 输入【share】或【s】对此目录下的子文件夹进行批量选择与生成分享")
        print("  • 输入【b】返回上一层目录")
        print("  • 输入【q】退出工具")

        choice = input("\n👉 请选择操作: ").strip().lower()
        if choice == "q":
            print("已退出。")
            break
        elif choice == "b":
            if len(path_stack) > 1:
                path_stack.pop()
                current_fid = path_stack[-1]["fid"]
            else:
                print("⚠️ 已在最顶层根目录，无法返回上一层。")
            continue
        elif choice in ("share", "s"):
            # 开始批量分享流程
            print(f"\n🎯 准备为【{display_path}】下的子文件夹批量生成分享链接...")
            print("请选择要分享哪些子文件夹：")
            for idx, f in enumerate(folders, 1):
                print(f"  [{idx}] 📁 {f['name']}")
            
            sel_input = input("\n👉 请输入要分享的序号 (例如 1,2 或 1-3 或 all 全部): ").strip()
            sel_indices = parse_selection(sel_input, len(folders))
            if not sel_indices:
                print("⚠️ 未选择任何文件夹，已取消。")
                continue

            chosen_folders = [folders[i - 1] for i in sel_indices]
            print(f"\n⚡ 已选中 {len(chosen_folders)} 个文件夹:")
            for cf in chosen_folders:
                print(f"   • {cf['name']}")

            confirm = input("\n确认立即调用夸克接口生成永久公开分享链接吗？[Y/n]: ").strip().lower()
            if confirm not in ("", "y", "yes"):
                print("已取消本次分享。")
                continue

            # 构建当前路径前缀（例如：小学/一年级）
            clean_crumbs = [c["name"] for c in path_stack if c["name"] not in ("根目录", "keben_pdf")]
            category_prefix = "/".join(clean_crumbs)

            share_results = []
            print("\n🚀 正在逐一生成公开分享链接中，请稍候...")
            for idx, cf in enumerate(chosen_folders, 1):
                full_cat_name = f"{category_prefix}/{cf['name']}" if category_prefix else cf["name"]
                print(f"  [{idx}/{len(chosen_folders)}] 正在处理: {cf['name']} ...", end="", flush=True)
                res, err = client.create_share(cf["fid"], title=full_cat_name)
                if res:
                    share_url = res["share_url"]
                    code = res.get("extract_code", "")
                    code_info = f" (提取码: {code})" if code else ""
                    print(f" ✅ 成功: {share_url}{code_info}")
                    share_results.append({
                        "category": full_cat_name,
                        "name": cf["name"],
                        "url": share_url,
                        "code": code
                    })
                else:
                    print(f" ❌ 失败: {err}")
                time.sleep(0.8) # 适当休眠避免触发接口频率限制

            if not share_results:
                print("❌ 没有成功生成任何分享链接。")
                continue

            # 打印排版格式
            print("\n" + "=" * 60)
            print("              📋 批量生成分享链接排版结果")
            print("=" * 60)
            formatted_text_lines = []
            for r in share_results:
                line = f"{r['category']}: {r['url']}"
                if r['code']:
                    line += f" 提取码: {r['code']}"
                formatted_text_lines.append(line)
                print(f"  {line}")
            print("=" * 60)

            # 询问是否自动保存到 quark_category_links.json
            save_confirm = input(f"\n💾 是否自动将这 {len(share_results)} 个链接同步保存到本地配置文件？\n   ({CATEGORY_LINKS_FILE}) [Y/n]: ").strip().lower()
            if save_confirm in ("", "y", "yes"):
                cat_links = {}
                if os.path.exists(CATEGORY_LINKS_FILE):
                    try:
                        with open(CATEGORY_LINKS_FILE, "r", encoding="utf-8") as f:
                            cat_links = json.load(f)
                    except Exception:
                        pass
                
                for r in share_results:
                    val = r["url"]
                    if r["code"]:
                        val += f" 提取码: {r['code']}"
                    cat_links[r["category"]] = val

                with open(CATEGORY_LINKS_FILE, "w", encoding="utf-8") as f:
                    json.dump(cat_links, f, ensure_ascii=False, indent=2)
                print(f"🎉 成功同步更新配置文件: {CATEGORY_LINKS_FILE} ！")

                # 询问是否立即执行入库上架
                import_confirm = input("\n🚀 是否立即执行入库上架脚本，让这批新课本即刻在开发环境上线？[Y/n]: ").strip().lower()
                if import_confirm in ("", "y", "yes"):
                    subprocess.run([sys.executable, IMPORT_SCRIPT])

            continue

        elif choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(folders):
                target = folders[idx - 1]
                path_stack.append({"fid": target["fid"], "name": target["name"]})
                current_fid = target["fid"]
            else:
                print(f"⚠️ 无效序号: {choice}，请输入 1 ~ {len(folders)} 之间的数字。")
        else:
            print(f"⚠️ 无法识别的指令: {choice}")

if __name__ == "__main__":
    main()
