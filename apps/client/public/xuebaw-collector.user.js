// ==UserScript==
// @name         学霸网专属浏览器采集助手 (XueBaW Resource Collector)
// @namespace    https://xuebaw.com/
// @version      1.3.1
// @description  全网教育与网盘资源一键多资源批量采集神器！右侧贴边滑出抽屉工作台（原文零遮挡）；紧凑三行卡片排版：标题独立一行、网盘直链独立一行（完整无截断）、提取码独立一行；精准提取真实标题，平滑零闪烁批量同步！
// @author       学霸网开发团队
// @match        *://*/*
// @exclude      *://localhost:*/*
// @exclude      *://127.0.0.1:*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // 默认配置
  let API_BASE = GM_getValue('XUEBAW_API_BASE', 'https://api.xuebaw.com:8443');
  let ADMIN_TOKEN = GM_getValue('XUEBAW_ADMIN_TOKEN', '');

  // 注册油猴菜单
  if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('⚙️ 配置学霸网 API 与安全令牌', () => openSettingsModal());
    GM_registerMenuCommand('⚡ 提取当前页面网盘资源 (右侧抽屉对照)', () => triggerCollect());
  }

  // 注入悬浮触发胶囊
  function initFloatingButton() {
    if (document.getElementById('xuebaw-collector-bubble')) return;

    const btn = document.createElement('div');
    btn.id = 'xuebaw-collector-bubble';
    btn.innerHTML = `
      <div class="xb-pill-btn" title="点击呼出/收起学霸网右侧采集工作台 (原文零遮挡·左右实时对照)">
        <span class="xb-icon">⚡</span>
        <span class="xb-text">采集到学霸网</span>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'xuebaw-collector-style';
    style.textContent = `
      #xuebaw-collector-bubble {
        position: fixed;
        right: 24px;
        bottom: 72px;
        z-index: 99999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }
      .xb-pill-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, #0284c7, #2563eb);
        color: #ffffff;
        padding: 9px 16px;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 18px rgba(37, 99, 235, 0.4), 0 2px 6px rgba(0,0,0,0.1);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      }
      .xb-pill-btn:hover {
        transform: translateY(-2px) scale(1.04);
        box-shadow: 0 6px 24px rgba(37, 99, 235, 0.55);
        background: linear-gradient(135deg, #0369a1, #1d4ed8);
      }

      /* 穿透型侧边工作台容器：左侧网页零遮挡，可完全自由交互与滚动 */
      #xuebaw-modal-container {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 520px;
        max-width: 90vw;
        z-index: 999999999;
        pointer-events: none;
        display: flex;
        justify-content: flex-end;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }

      /* 右侧滑出式全高工作台抽屉 (Right Slide-over Drawer) */
      .xb-drawer-panel {
        width: 100%;
        height: 100vh;
        background: #ffffff;
        border-left: 2px solid #cbd5e1;
        box-shadow: -10px 0 35px rgba(15, 23, 42, 0.22);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        animation: xbSlideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
        padding: 12px 14px;
        color: #1e293b;
        font-size: 13px;
        transition: width 0.2s ease;
      }
      .xb-drawer-panel.is-expanded {
        width: 680px;
        max-width: 92vw;
      }
      @keyframes xbSlideInRight {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }

      /* 抽屉头部 */
      .xb-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 8px;
        margin-bottom: 8px;
        flex-shrink: 0;
      }
      .xb-panel-title {
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .xb-counter-badge {
        font-size: 11px;
        background: #dbeafe;
        color: #1e40af;
        padding: 2px 7px;
        border-radius: 9999px;
        font-weight: 700;
      }
      .xb-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .xb-btn-icon {
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 12px;
        color: #475569;
        cursor: pointer;
        font-weight: 600;
      }
      .xb-btn-icon:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      .xb-close-btn {
        background: transparent;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: #94a3b8;
        padding: 3px 6px;
        line-height: 1;
      }
      .xb-close-btn:hover { color: #dc2626; }

      .xb-compare-banner {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #166534;
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
        flex-shrink: 0;
      }

      .xb-toolbar-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
        padding: 0 2px;
        flex-shrink: 0;
      }
      .xb-btn-text {
        background: none;
        border: none;
        color: #2563eb;
        cursor: pointer;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.15s;
      }
      .xb-btn-text:hover { background: #eff6ff; }

      /* 紧凑卡片列表容器 */
      .xb-items-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-right: 4px;
        margin-bottom: 8px;
      }
      .xb-items-list::-webkit-scrollbar {
        width: 6px;
      }
      .xb-items-list::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
      }

      /* 紧凑三行卡片排版：严格重置并隔离外部样式 */
      .xb-item-card {
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        padding: 8px 10px !important;
        background: #ffffff !important;
        display: flex !important;
        gap: 8px !important;
        align-items: flex-start !important;
        transition: border-color 0.15s, background-color 0.15s !important;
        box-sizing: border-box !important;
        margin: 0 !important;
      }
      .xb-item-card:hover {
        border-color: #94a3b8 !important;
        background: #f8fafc !important;
      }
      .xb-item-card.is-selected {
        border-color: #60a5fa !important;
        background: #f0f7ff !important;
      }
      .xb-checkbox {
        cursor: pointer !important;
        width: 16px !important;
        height: 16px !important;
        accent-color: #2563eb !important;
        margin: 4px 0 0 0 !important;
        flex-shrink: 0 !important;
      }
      .xb-item-main {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
        min-width: 0 !important;
      }

      /* 【行 1：标题独立一行】 */
      .xb-item-title-row {
        display: flex !important;
        gap: 6px !important;
        align-items: center !important;
        width: 100% !important;
      }
      .xb-drive-tag {
        font-size: 11px !important;
        font-weight: 700 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        line-height: 1.3 !important;
      }
      .xb-drive-tag.quark { background: #fef3c7 !important; color: #b45309 !important; border: 1px solid #fde68a !important; }
      .xb-drive-tag.baidu { background: #dbeafe !important; color: #1d4ed8 !important; border: 1px solid #bfdbfe !important; }
      .xb-drive-tag.other { background: #f1f5f9 !important; color: #475569 !important; border: 1px solid #e2e8f0 !important; }

      .xb-item-title-input {
        flex: 1 !important;
        box-sizing: border-box !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 4px !important;
        padding: 3px 6px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #1e3a8a !important;
        background: #ffffff !important;
        height: 26px !important;
        line-height: 20px !important;
        outline: none !important;
        min-width: 0 !important;
        margin: 0 !important;
        transition: all 0.2s !important;
      }
      .xb-item-title-input:hover {
        border-color: #94a3b8 !important;
      }
      .xb-item-title-input:focus {
        border-color: #2563eb !important;
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15) !important;
      }

      /* 【行 2：网盘地址独立一行 (完整展示，不截断)】 */
      .xb-item-url-row {
        display: flex !important;
        gap: 6px !important;
        align-items: center !important;
        width: 100% !important;
        padding: 3px 6px !important;
        background: #f8fafc !important;
        border-radius: 4px !important;
        border: 1px solid #f1f5f9 !important;
        box-sizing: border-box !important;
      }
      .xb-url-icon {
        font-size: 11px !important;
        opacity: 0.7 !important;
        flex-shrink: 0 !important;
      }
      .xb-url-link {
        color: #2563eb !important;
        text-decoration: none !important;
        flex: 1 !important;
        font-size: 11px !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        font-weight: 500 !important;
        word-break: break-all !important; /* 关键：完整展示长地址，杜绝切断省略 */
        line-height: 1.35 !important;
      }
      .xb-url-link:hover {
        text-decoration: underline !important;
        color: #1d4ed8 !important;
      }
      .xb-url-open-icon {
        font-size: 11px !important;
        color: #64748b !important;
        flex-shrink: 0 !important;
      }

      /* 【行 3：提取码独立一行】 */
      .xb-item-code-row {
        display: flex !important;
        gap: 6px !important;
        align-items: center !important;
        width: 100% !important;
        font-size: 11px !important;
      }
      .xb-code-icon {
        font-size: 11px !important;
        flex-shrink: 0 !important;
      }
      .xb-code-label {
        color: #64748b !important;
        font-weight: 600 !important;
        flex-shrink: 0 !important;
      }
      .xb-code-input {
        width: 120px !important;
        height: 22px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 4px !important;
        padding: 1px 6px !important;
        font-size: 11px !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
        font-weight: 700 !important;
        color: #d97706 !important;
        background: #ffffff !important;
        box-sizing: border-box !important;
        outline: none !important;
        margin: 0 !important;
      }
      .xb-code-input:focus {
        border-color: #2563eb !important;
      }

      .xb-empty-box {
        text-align: center;
        padding: 36px 16px;
        color: #64748b;
      }
      .xb-empty-icon {
        font-size: 32px;
        display: block;
        margin-bottom: 8px;
      }

      .xb-footer-meta {
        font-size: 11px;
        color: #64748b;
        margin-bottom: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      .xb-footer-btns {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      .xb-btn-action {
        flex: 2;
        background: linear-gradient(135deg, #0284c7, #2563eb);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 9px 14px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
      }
      .xb-btn-action:hover:not(:disabled) {
        background: linear-gradient(135deg, #0369a1, #1d4ed8);
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(37, 99, 235, 0.4);
      }
      .xb-btn-action:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
      .xb-btn-sec {
        flex: 1;
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 9px 12px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
      }
      .xb-btn-sec:hover { background: #e2e8f0; }
    `;

    document.head.appendChild(style);
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
      const container = document.getElementById('xuebaw-modal-container');
      if (container) {
        container.remove();
      } else {
        triggerCollect();
      }
    });
  }

  // 判断是否为“点此访问”、“点击下载”等无意义通用锚文本
  function isGenericLinkText(text) {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    if (t.length <= 1) return true;
    const genericWords = [
      '点此访问', '点击访问', '点击下载', '立即下载', '点击这里', '点击查看', '点我下载', '点击获取', '立即查看',
      '夸克网盘', '夸克链接', '夸克下载', '百度网盘', '百度链接', '百度云', '下载地址', '立即转存', '高速下载',
      '直达链接', '网盘下载', '网盘链接', '夸克', '百度', '下载', '链接', '访问', '直链', '地址', '查看',
      'click here', 'download', 'link', 'pan', 'quark', 'baidu'
    ];
    return genericWords.some(w => t === w || t === `【${w}】` || t === `[${w}]` || t === `(${w})` || t.startsWith(w));
  }

  // 智能寻找 a 标签对应的真实资源标题
  function resolveRealTitleForAnchor(aElement, fallbackIndex) {
    const rawLinkText = aElement.innerText.trim();
    if (rawLinkText && rawLinkText.length >= 4 && !isGenericLinkText(rawLinkText) && !rawLinkText.startsWith('http')) {
      return rawLinkText;
    }

    const attrTitle = aElement.getAttribute('title') || aElement.getAttribute('aria-label');
    if (attrTitle && attrTitle.trim().length >= 4 && !isGenericLinkText(attrTitle)) {
      return attrTitle.trim();
    }

    const tr = aElement.closest('tr');
    if (tr) {
      const tds = Array.from(tr.querySelectorAll('td, th'));
      for (const td of tds) {
        if (td.contains(aElement)) continue;
        const tdText = td.innerText.trim();
        if (tdText.length >= 4 && !tdText.startsWith('http') && !isGenericLinkText(tdText)) {
          return tdText.split('\n')[0].trim();
        }
      }
    }

    const container = aElement.closest('li, .item, .card, .resource, .post, article, dd, dt, p');
    if (container) {
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6, strong, b, .title, .name');
      if (heading && !heading.contains(aElement)) {
        const headingText = heading.innerText.trim();
        if (headingText.length >= 4 && !isGenericLinkText(headingText)) {
          return headingText;
        }
      }

      let cText = container.innerText || '';
      cText = cText.replace(/https?:\/\/\S+/g, '')
        .replace(/(?:点此访问|点击访问|点击下载|立即下载|夸克网盘|百度网盘|提取码|密码|pwd|code)[:：\s]*/gi, '')
        .trim();
      const lines = cText.split('\n').map(l => l.trim()).filter(l => l.length >= 4 && !isGenericLinkText(l));
      if (lines.length > 0) {
        return lines[0];
      }
    }

    let prev = aElement.previousElementSibling;
    while (prev) {
      const prevText = prev.innerText ? prev.innerText.trim() : '';
      if (prevText.length >= 4 && !isGenericLinkText(prevText) && !prevText.startsWith('http')) {
        return prevText;
      }
      prev = prev.previousElementSibling;
    }

    const docTitle = document.title ? document.title.replace(/[-_\|].*$/, '').trim() : '精选学习网盘资料';
    return `${docTitle} (资源 ${fallbackIndex + 1})`;
  }

  // 提取当前页面中所有的网盘资源
  function extractAllPageResources() {
    let selectedText = window.getSelection() ? window.getSelection().toString().trim() : '';
    let bodyText = document.body ? document.body.innerText : '';
    let targetText = selectedText ? selectedText : bodyText;

    const items = [];
    const seenUrls = new Set();

    const urlPattern = /https?:\/\/(?:pan\.quark\.cn\/s\/[a-zA-Z0-9_\-]+|pan\.baidu\.com\/s\/[a-zA-Z0-9_\-]+(?:\?pwd=[a-zA-Z0-9]+)?|(?:www\.)?(?:alipan|aliyundrive)\.com\/s\/[a-zA-Z0-9_\-]+|www\.123pan\.com\/s\/[a-zA-Z0-9_\-]+|pan\.xunlei\.com\/s\/[a-zA-Z0-9_\-]+)/gi;

    const aLinks = Array.from(document.querySelectorAll('a[href*="quark.cn/s/"], a[href*="baidu.com/s/"], a[href*="alipan.com/s/"], a[href*="123pan.com/s/"]'));
    aLinks.forEach((a, idx) => {
      const href = a.href.trim();
      if (!seenUrls.has(href)) {
        seenUrls.add(href);

        let title = resolveRealTitleForAnchor(a, idx);

        let code = '';
        if (href.includes('pwd=')) {
          try {
            const u = new URL(href);
            code = u.searchParams.get('pwd') || '';
          } catch {}
        }
        if (!code) {
          const parentText = a.parentElement ? a.parentElement.innerText : '';
          const codeMatch = parentText.match(/(?:提取码|密码|pwd|code)[:：\s]*([a-zA-Z0-9]{4,8})/i);
          if (codeMatch) code = codeMatch[1].trim();
        }

        let driveType = href.includes('quark.cn') ? 'quark' : (href.includes('baidu.com') ? 'baidu' : 'other');
        let driveLabel = href.includes('quark.cn') ? '⚡ 夸克' : (href.includes('baidu.com') ? '📦 百度' : '云盘');

        items.push({
          id: 'item_' + Math.random().toString(36).slice(2, 8),
          title: title.slice(0, 100),
          shareUrl: href,
          code: code,
          driveType: driveType,
          driveLabel: driveLabel,
          selected: true
        });
      }
    });

    const lines = targetText.split('\n');
    lines.forEach((line, lineIndex) => {
      const lineMatches = line.match(urlPattern);
      if (lineMatches) {
        lineMatches.forEach(url => {
          const cleanUrl = url.trim();
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);

            let code = '';
            const codeMatch = line.match(/(?:提取码|密码|pwd|code|访问码)[:：\s]*([a-zA-Z0-9]{4,8})/i);
            if (codeMatch) {
              code = codeMatch[1].trim();
            } else if (cleanUrl.includes('pwd=')) {
              try {
                const u = new URL(cleanUrl);
                code = u.searchParams.get('pwd') || '';
              } catch {}
            }

            let title = line.replace(cleanUrl, '')
              .replace(/(?:夸克|百度|网盘|链接|下载|地址|提取码|密码|pwd|code|点此访问|点击下载)[:：\s]*/gi, '')
              .replace(/[《【]([^》】]{4,80})[》】]/, '$1')
              .trim();

            if (!title || title.length < 3 || isGenericLinkText(title)) {
              if (lineIndex > 0 && lines[lineIndex - 1].trim().length >= 3 && !lines[lineIndex - 1].includes('http')) {
                title = lines[lineIndex - 1].trim().replace(/[《【]([^》】]{4,80})[》】]/, '$1');
              }
            }

            if (!title || title.length < 3 || isGenericLinkText(title)) {
              const docTitle = document.title ? document.title.replace(/[-_\|].*$/, '').trim() : '精选真题教辅资料';
              title = `${docTitle} (资源 ${items.length + 1})`;
            }

            let driveType = cleanUrl.includes('quark.cn') ? 'quark' : (cleanUrl.includes('baidu.com') ? 'baidu' : 'other');
            let driveLabel = cleanUrl.includes('quark.cn') ? '⚡ 夸克' : (cleanUrl.includes('baidu.com') ? '📦 百度' : '云盘');

            items.push({
              id: 'item_' + Math.random().toString(36).slice(2, 8),
              title: title.slice(0, 100),
              shareUrl: cleanUrl,
              code: code,
              driveType: driveType,
              driveLabel: driveLabel,
              selected: true
            });
          }
        });
      }
    });

    return items;
  }

  // 触发采集抽屉
  function triggerCollect() {
    const items = extractAllPageResources();
    showRightDrawer(items);
  }

  // 渲染右侧滑出抽屉 (紧凑三行排版：标题一行、地址一行、提取码一行)
  function showRightDrawer(initialItems) {
    const old = document.getElementById('xuebaw-modal-container');
    if (old) old.remove();

    let items = [...initialItems];

    const container = document.createElement('div');
    container.id = 'xuebaw-modal-container';

    let itemsHtml = '';
    if (items.length === 0) {
      itemsHtml = `
        <div class="xb-empty-box">
          <span class="xb-empty-icon">🔍</span>
          <p>未在当前页面中检测到夸克或百度网盘分享链接。</p>
          <p style="font-size: 11px; color: #94a3b8; margin-top: 4px;">小提示：可尝试在网页中用鼠标选中包含网盘链接的文本后，点击右上角【重新扫描】。</p>
        </div>
      `;
    } else {
      itemsHtml = items.map((item, idx) => `
        <div class="xb-item-card ${item.selected ? 'is-selected' : ''}" data-index="${idx}">
          <input type="checkbox" class="xb-checkbox" ${item.selected ? 'checked' : ''} data-index="${idx}" />
          <div class="xb-item-main">
            <!-- 行 1：标题独立一行 -->
            <div class="xb-item-title-row">
              <span class="xb-drive-tag ${item.driveType}">${item.driveLabel}</span>
              <input type="text" class="xb-item-title-input" value="${escapeHtml(item.title)}" data-index="${idx}" placeholder="资料标题 (可直接编辑)" />
            </div>

            <!-- 行 2：网盘地址独立一行 (完整显示不截断) -->
            <div class="xb-item-url-row">
              <span class="xb-url-icon">🔗</span>
              <a href="${escapeHtml(item.shareUrl)}" target="_blank" class="xb-url-link" title="点击可在新标签页验证有效性">
                ${escapeHtml(item.shareUrl)}
              </a>
              <span class="xb-url-open-icon">↗</span>
            </div>

            <!-- 行 3：提取码独立一行 -->
            <div class="xb-item-code-row">
              <span class="xb-code-icon">🔑</span>
              <span class="xb-code-label">提取密码：</span>
              <input type="text" class="xb-code-input" value="${escapeHtml(item.code)}" placeholder="无密码 (免提取码)" data-index="${idx}" />
            </div>
          </div>
        </div>
      `).join('');
    }

    const selectedCount = items.filter(it => it.selected).length;

    container.innerHTML = `
      <div class="xb-drawer-panel" id="xb-drawer-panel">
        <div class="xb-panel-header">
          <div class="xb-panel-title">
            <span>⚡ 学霸网批量采集</span>
            <span class="xb-counter-badge">${items.length} 个</span>
          </div>
          <div class="xb-header-actions">
            <button type="button" class="xb-btn-icon" id="xb-btn-rescan" title="重新扫描页面内容">🔄 重新扫描</button>
            <button type="button" class="xb-btn-icon" id="xb-btn-toggle-width" title="切换抽屉宽度 (520px / 680px)">↔ 宽度</button>
            <button class="xb-close-btn" id="xb-btn-close" title="收起抽屉 (Esc)">✕</button>
          </div>
        </div>

        <div class="xb-compare-banner">
          <span>👀 <strong>左侧原文零遮挡</strong>：左侧页面可自由滚动查阅，右侧对照核对无误后一键推送！</span>
        </div>

        ${items.length > 0 ? `
          <div class="xb-toolbar-row">
            <span style="color: #475569; font-weight: 600;">
              已勾选 <strong id="xb-selected-count" style="color: #2563eb;">${selectedCount}</strong> / ${items.length} 个资料
            </span>
            <div>
              <button type="button" class="xb-btn-text" id="xb-select-all">全选</button>
              <span style="color: #cbd5e1;">|</span>
              <button type="button" class="xb-btn-text" id="xb-select-none">取消全选</button>
            </div>
          </div>
        ` : ''}

        <div class="xb-items-list" id="xb-items-list">
          ${itemsHtml}
        </div>

        <div class="xb-footer-meta">
          <span>目标：<span style="font-family: monospace; color: #2563eb;">${API_BASE}</span></span>
          <a href="javascript:void(0)" id="xb-btn-config" style="color: #0284c7; text-decoration: none;">⚙️ 修改凭证</a>
        </div>

        <div class="xb-footer-btns">
          <button class="xb-btn-sec" id="xb-btn-cancel">收起</button>
          <button class="xb-btn-action" id="xb-btn-submit" ${selectedCount === 0 ? 'disabled' : ''}>
            ${selectedCount > 1 ? `🚀 批量推送 (${selectedCount} 个)` : `🚀 批量推送到草稿池`}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const drawer = container.querySelector('#xb-drawer-panel');

    function updateSelectionUI() {
      const curSelected = items.filter(it => it.selected).length;

      const countEl = container.querySelector('#xb-selected-count');
      if (countEl) countEl.textContent = curSelected;

      const submitBtn = container.querySelector('#xb-btn-submit');
      if (submitBtn) {
        submitBtn.disabled = curSelected === 0;
        submitBtn.textContent = curSelected > 1 
          ? `🚀 批量推送 (${curSelected} 个)` 
          : (curSelected === 1 ? `🚀 推送到草稿池 (1 个)` : `🚀 请勾选要推送的资料`);
      }

      container.querySelectorAll('.xb-item-card').forEach((card, idx) => {
        const isSel = items[idx]?.selected ?? false;
        card.classList.toggle('is-selected', isSel);
        const cb = card.querySelector('.xb-checkbox');
        if (cb && cb.checked !== isSel) {
          cb.checked = isSel;
        }
      });
    }

    container.querySelector('#xb-btn-close').addEventListener('click', () => container.remove());
    container.querySelector('#xb-btn-cancel').addEventListener('click', () => container.remove());
    container.querySelector('#xb-btn-config').addEventListener('click', () => {
      container.remove();
      openSettingsModal();
    });

    container.querySelector('#xb-btn-rescan').addEventListener('click', () => {
      triggerCollect();
    });

    container.querySelector('#xb-btn-toggle-width').addEventListener('click', () => {
      drawer.classList.toggle('is-expanded');
    });

    if (items.length > 0) {
      container.querySelector('#xb-select-all').addEventListener('click', () => {
        items.forEach(it => it.selected = true);
        updateSelectionUI();
      });

      container.querySelector('#xb-select-none').addEventListener('click', () => {
        items.forEach(it => it.selected = false);
        updateSelectionUI();
      });

      container.querySelectorAll('.xb-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'), 10);
          items[idx].selected = e.target.checked;
          updateSelectionUI();
        });
      });

      container.querySelectorAll('.xb-item-title-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'), 10);
          items[idx].title = e.target.value;
        });
      });

      container.querySelectorAll('.xb-code-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'), 10);
          items[idx].code = e.target.value.trim();
        });
      });

      const submitBtn = container.querySelector('#xb-btn-submit');
      submitBtn.addEventListener('click', () => {
        const selectedItems = items.filter(it => it.selected);
        if (selectedItems.length === 0) {
          alert('请至少勾选一个有效资料进行推送！');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = `⏳ 正在批量推送 ${selectedItems.length} 个资料...`;

        const combinedText = selectedItems.map(it => {
          return `${it.title}\n${it.shareUrl} 提取码: ${it.code}`;
        }).join('\n\n');

        sendToXueBaW(combinedText, (err, res) => {
          submitBtn.disabled = false;
          if (err) {
            alert('❌ 批量推送失败: ' + err);
            updateSelectionUI();
          } else {
            alert(`✅ 批量录入成功！已将 ${selectedItems.length} 条资料同步至学霸网后台待审草稿池。`);
            container.remove();
          }
        });
      });
    }

    const onKeyEsc = (e) => {
      if (e.key === 'Escape') {
        container.remove();
        document.removeEventListener('keydown', onKeyEsc);
      }
    };
    document.addEventListener('keydown', onKeyEsc);
  }

  function sendToXueBaW(rawText, callback) {
    if (!API_BASE) {
      callback('未配置 API 基础地址');
      return;
    }

    const endpoint = `${API_BASE.replace(/\/$/, '')}/api/v1/admin/crawler/ingest-text`;
    const payload = JSON.stringify({
      raw_text: rawText,
      source_name: `浏览器助手 (${document.domain})`,
      drive_type: 'auto'
    });

    const headers = {
      'Content-Type': 'application/json'
    };
    if (ADMIN_TOKEN) {
      headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
    }

    if (typeof GM_xmlhttpRequest !== 'undefined') {
      GM_xmlhttpRequest({
        method: 'POST',
        url: endpoint,
        headers: headers,
        data: payload,
        onload: function(response) {
          if (response.status >= 200 && response.status < 300) {
            callback(null, response.responseText);
          } else {
            callback(`HTTP ${response.status}: ${response.responseText}`);
          }
        },
        onerror: function(e) {
          callback('网络异常或跨域受限，请确认 API_BASE 是否可通');
        }
      });
    } else {
      fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: payload
      })
      .then(res => res.json())
      .then(data => callback(null, data))
      .catch(e => callback(e.message));
    }
  }

  function openSettingsModal() {
    const old = document.getElementById('xuebaw-settings-container');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'xuebaw-settings-container';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.5); z-index: 9999999999;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background: #ffffff; width: 440px; max-width: 92vw; border-radius: 12px; padding: 18px; box-shadow: 0 20px 45px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">
          <strong style="font-size: 15px; color: #0f172a;">⚙️ 学霸网采集助手配置</strong>
          <button style="background:none; border:none; font-size:16px; cursor:pointer; color:#94a3b8;" id="xb-set-close">✕</button>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 700; color: #475569; margin-bottom: 4px; font-size: 12px;">学霸网 API 基础地址：</label>
          <input type="text" id="xb-set-api" style="width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px; font-size: 12px;" value="${escapeHtml(API_BASE)}" placeholder="https://api.xuebaw.com:8443 或 http://localhost:4001" />
          <small style="color: #64748b; font-size: 11px;">线上推荐: https://api.xuebaw.com:8443；本地开发: http://localhost:4001</small>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 700; color: #475569; margin-bottom: 4px; font-size: 12px;">管理员 JWT Token (可选)：</label>
          <input type="text" id="xb-set-token" style="width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px; font-size: 12px;" value="${escapeHtml(ADMIN_TOKEN)}" placeholder="后台登录后的 Authorization 凭证" />
          <small style="color: #64748b; font-size: 11px;">可从学霸网后台浏览器控制台 localStorage.getItem('token') 获取</small>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 14px;">
          <button style="flex:1; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-size:12px; cursor:pointer;" id="xb-set-cancel">取消</button>
          <button style="flex:1; background:#2563eb; color:#fff; border:none; border-radius:6px; padding:8px; font-size:12px; font-weight:700; cursor:pointer;" id="xb-set-save">💾 保存配置</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#xb-set-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#xb-set-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#xb-set-save').addEventListener('click', () => {
      const api = overlay.querySelector('#xb-set-api').value.trim();
      const token = overlay.querySelector('#xb-set-token').value.trim();

      API_BASE = api || 'https://api.xuebaw.com:8443';
      ADMIN_TOKEN = token;

      GM_setValue('XUEBAW_API_BASE', API_BASE);
      GM_setValue('XUEBAW_ADMIN_TOKEN', ADMIN_TOKEN);

      alert('✅ 配置已保存成功！');
      overlay.remove();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingButton);
  } else {
    initFloatingButton();
  }
})();
