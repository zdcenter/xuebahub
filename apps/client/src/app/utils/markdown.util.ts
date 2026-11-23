/**
 * Lightweight, safe Markdown to HTML parser without external dependencies.
 * Sanitizes input against XSS and renders common Markdown structures.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseMarkdown(md: string | null | undefined): string {
  if (!md || !md.trim()) {
    return '';
  }

  // 1. Separate code blocks to protect them from inline formatting
  const codeBlocks: string[] = [];
  let text = md.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trimEnd());
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    const index = codeBlocks.length;
    codeBlocks.push(
      `<pre class="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto my-2 text-xs font-mono"><code${langAttr}>${escapedCode}</code></pre>`
    );
    return `__CODE_BLOCK_${index}__`;
  });

  // 2. Escape HTML for the rest of the text
  text = escapeHtml(text);

  // 3. Process line by line for block-level elements
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let blockquoteBuffer: string[] = [];

  const flushBlockquote = () => {
    if (inBlockquote) {
      output.push(
        `<blockquote class="border-l-4 border-indigo-500 bg-indigo-50/50 pl-3 py-1.5 my-2 text-slate-600 italic rounded-r text-xs sm:text-sm">${blockquoteBuffer.join('<br>')}</blockquote>`
      );
      blockquoteBuffer = [];
      inBlockquote = false;
    }
  };

  const flushList = () => {
    if (inList) {
      output.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check code block placeholder
    if (/^__CODE_BLOCK_\d+__$/.test(line.trim())) {
      flushBlockquote();
      flushList();
      output.push(line.trim());
      continue;
    }

    // Horizontal rule: --- or *** or ___
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      flushBlockquote();
      flushList();
      output.push('<hr class="my-4 border-t border-slate-200">');
      continue;
    }

    // Blockquote: > text
    if (/^&gt;\s?(.*)/.test(line)) {
      flushList();
      inBlockquote = true;
      blockquoteBuffer.push(line.replace(/^&gt;\s?/, ''));
      continue;
    } else {
      flushBlockquote();
    }

    // Unordered List: - item or * item
    const ulMatch = line.match(/^[\*\-]\s+(.*)/);
    if (ulMatch) {
      if (inList !== 'ul') {
        flushList();
        inList = 'ul';
        output.push('<ul class="list-disc list-inside space-y-1 my-2 text-slate-700 text-xs sm:text-sm">');
      }
      output.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }

    // Ordered List: 1. item
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      if (inList !== 'ol') {
        flushList();
        inList = 'ol';
        output.push('<ol class="list-decimal list-inside space-y-1 my-2 text-slate-700 text-xs sm:text-sm">');
      }
      output.push(`<li>${olMatch[2]}</li>`);
      continue;
    }

    flushList();

    // Headers: # H1 to ###### H6
    if (/^######\s+(.*)/.test(line)) {
      output.push(`<h6 class="text-xs font-bold text-slate-800 mt-3 mb-1.5">${line.replace(/^######\s+/, '')}</h6>`);
      continue;
    }
    if (/^#####\s+(.*)/.test(line)) {
      output.push(`<h5 class="text-xs font-bold text-slate-800 mt-3 mb-1.5">${line.replace(/^#####\s+/, '')}</h5>`);
      continue;
    }
    if (/^####\s+(.*)/.test(line)) {
      output.push(`<h4 class="text-xs sm:text-sm font-bold text-slate-800 mt-3 mb-1.5">${line.replace(/^####\s+/, '')}</h4>`);
      continue;
    }
    if (/^###\s+(.*)/.test(line)) {
      output.push(`<h3 class="text-sm sm:text-base font-bold text-slate-900 mt-3.5 mb-2">${line.replace(/^###\s+/, '')}</h3>`);
      continue;
    }
    if (/^##\s+(.*)/.test(line)) {
      output.push(`<h2 class="text-base sm:text-lg font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100">${line.replace(/^##\s+/, '')}</h2>`);
      continue;
    }
    if (/^#\s+(.*)/.test(line)) {
      output.push(`<h1 class="text-lg sm:text-xl font-extrabold text-slate-900 mt-4 mb-2 pb-1.5 border-b border-slate-200">${line.replace(/^#\s+/, '')}</h1>`);
      continue;
    }

    // Empty line creates separation
    if (line.trim() === '') {
      output.push('<div class="h-2"></div>');
      continue;
    }

    // Normal paragraph line
    output.push(`<p class="my-1 text-slate-700 leading-relaxed text-xs sm:text-sm">${line}</p>`);
  }

  flushBlockquote();
  flushList();

  let html = output.join('\n');

  // 4. Inline elements formatting
  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 text-indigo-600 font-mono text-[11px] sm:text-xs border border-slate-200">$1</code>');

  // Bold & Italic: ***text***
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong class="font-semibold text-slate-900">$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~([^~]+)~~/g, '<del class="text-slate-400">$1</del>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 underline underline-offset-2 font-medium">$1</a>');

  // 5. Restore code blocks
  html = html.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => {
    return codeBlocks[parseInt(idx, 10)] || '';
  });

  return html;
}
