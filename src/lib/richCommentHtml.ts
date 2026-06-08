const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'article', 'section', 'td', 'th',
]);

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'SPAN',
]);

const FONT_SIZE_MAP: Record<string, string> = {
  '1': '0.75em',
  '2': '0.85em',
  '3': '1em',
  '4': '1.1em',
  '5': '1.25em',
  '6': '1.4em',
  '7': '1.6em',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeLineBreaks(text: string): string {
  return text
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\v/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n\n');
}

function extractHtmlFragment(html: string): string {
  const match = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
  return match ? match[1] : html;
}

export function preprocessClipboardHtml(html: string): string {
  let s = extractHtmlFragment(html);
  s = s.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');
  s = s.replace(/<\?xml[\s\S]*?\?>/gi, '');
  s = s.replace(/<\/?o:[a-z]+[^>]*>/gi, '');
  s = s.replace(/<\/?w:[a-z]+[^>]*>/gi, '');
  s = s.replace(/<\/?m:[a-z]+[^>]*>/gi, '');
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<meta[^>]*>/gi, '');
  return s;
}

function isBoldElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const style = (el.getAttribute('style') ?? '').toLowerCase().replace(/\s+/g, '');

  if (/font-weight:(normal|400)/.test(style)) return false;
  if (tag === 'b' || tag === 'strong') return true;
  if (/font-weight:(bold|[7-9]00)/.test(style)) return true;
  if (/mso-bidi-font-weight:bold/.test(style)) return true;
  return false;
}

function isItalicElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const style = (el.getAttribute('style') ?? '').toLowerCase().replace(/\s+/g, '');
  if (/font-style:(normal)/.test(style)) return false;
  if (tag === 'i' || tag === 'em') return true;
  return /font-style:italic/.test(style);
}

function isUnderlineElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const style = (el.getAttribute('style') ?? '').toLowerCase().replace(/\s+/g, '');
  if (tag === 'u') return true;
  return /text-decoration:underline/.test(style);
}

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((child) => isBlockTag(child.tagName.toLowerCase()));
}

function htmlToRootElement(html: string): HTMLElement {
  const cleaned = preprocessClipboardHtml(html);
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = cleaned;
    return div;
  }
  const doc = new DOMParser().parseFromString(cleaned, 'text/html');
  return doc.body;
}

function serializeChildren(el: Element): string {
  return Array.from(el.childNodes).map((child) => serializeNodeToRichHtml(child)).join('');
}

function serializeFontSizeSpan(el: Element): string | null {
  const style = (el.getAttribute('style') ?? '').toLowerCase();
  const match = style.match(/font-size:\s*([^;]+)/i);
  if (!match) return null;
  const size = match[1].trim();
  if (!/^(\d+(\.\d+)?(px|pt|em|rem|%)|small|medium|large|x-small|x-large)$/i.test(size)) return null;
  const inner = serializeChildren(el);
  if (!inner.trim()) return inner;
  return `<span style="font-size:${size}">${inner}</span>`;
}

function serializeNodeToRichHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\u00A0/g, ' ');
    return escapeHtml(text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '<br>';
  if (tag === 'ul') return `<ul>${serializeChildren(el)}</ul>`;
  if (tag === 'ol') return `<ol>${serializeChildren(el)}</ol>`;
  if (tag === 'li') return `<li>${serializeChildren(el)}</li>`;

  if (tag === 'span') {
    const sized = serializeFontSizeSpan(el);
    if (sized) return sized;
    return serializeChildren(el);
  }

  if (isBoldElement(el)) {
    const inner = serializeChildren(el);
    if (!inner.trim()) return inner;
    return `<strong>${inner}</strong>`;
  }

  if (isItalicElement(el)) {
    const inner = serializeChildren(el);
    if (!inner.trim()) return inner;
    return `<em>${inner}</em>`;
  }

  if (isUnderlineElement(el)) {
    const inner = serializeChildren(el);
    if (!inner.trim()) return inner;
    return `<u>${inner}</u>`;
  }

  let out = serializeChildren(el);

  if (isBlockTag(tag) && !hasBlockChild(el)) {
    if (!out.replace(/[\s\u00A0]/g, '')) return '<br>';
    return `<p>${out}</p>`;
  }

  return out;
}

function plainTextToRichHtml(text: string): string {
  const normalized = normalizeLineBreaks(text);
  if (!normalized.trim()) return '';

  const lines = normalized.split('\n');
  return lines
    .map((line) => {
      if (!line.trim()) return '<br>';
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

function legacyMarkdownToRichHtml(text: string): string {
  const normalized = normalizeLineBreaks(text);
  const lines = normalized.split('\n');
  return lines
    .map((line) => {
      if (!line.trim()) return '<br>';
      const html = line.replace(/\*\*([^*]+?)\*\*/g, (_, inner: string) => `<strong>${escapeHtml(inner)}</strong>`);
      if (html.includes('<strong>')) return `<p>${html}</p>`;
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

function legacyFontSizeToCss(size: string): string {
  return FONT_SIZE_MAP[size] ?? '1em';
}

function extractAllowedFontSize(style: string): string | null {
  const match = style.match(/font-size:\s*([^;]+)/i);
  if (!match) return null;
  const size = match[1].trim();
  if (!/^(\d+(\.\d+)?(px|pt|em|rem|%)|small|medium|large|x-small|x-large)$/i.test(size)) return null;
  return size;
}

function convertFontElement(el: Element): Element {
  const span = el.ownerDocument.createElement('span');
  const size = el.getAttribute('size');
  if (size) {
    span.setAttribute('style', `font-size:${legacyFontSizeToCss(size)}`);
  }
  while (el.firstChild) span.appendChild(el.firstChild);
  el.parentNode?.replaceChild(span, el);
  return span;
}

function applyPrintListStyles(el: Element): void {
  const tag = el.tagName;
  if (tag === 'UL') {
    el.setAttribute('style', 'margin:0.25em 0;padding-left:1.25em;list-style:disc;');
  } else if (tag === 'OL') {
    el.setAttribute('style', 'margin:0.25em 0;padding-left:1.35em;list-style:decimal;');
  } else if (tag === 'LI') {
    el.setAttribute('style', 'margin:0.15em 0;');
  }
}

function sanitizeElementTree(node: Element): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      node.removeChild(child);
      continue;
    }

    let el = child as Element;
    let tag = el.tagName;

    if (tag === 'FONT') {
      el = convertFontElement(el);
      tag = el.tagName;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      unwrapElement(el);
      continue;
    }

    const styleBefore = el.getAttribute('style') ?? '';
    while (el.attributes.length > 0) {
      el.removeAttribute(el.attributes[0].name);
    }

    if (tag === 'SPAN') {
      const fontSize = extractAllowedFontSize(styleBefore);
      if (fontSize) {
        el.setAttribute('style', `font-size:${fontSize}`);
        sanitizeElementTree(el);
      } else {
        unwrapElement(el);
      }
      continue;
    }

    if (tag === 'UL' || tag === 'OL' || tag === 'LI') {
      applyPrintListStyles(el);
    }

    sanitizeElementTree(el);
  }
}

function unwrapElement(el: Element): void {
  const parent = el.parentElement;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

/** Muuntaa leikepöydän HTML:n turvalliseen rich comment -HTML:ään. */
export function clipboardHtmlToRichComment(html: string): string {
  const root = htmlToRootElement(html);
  return sanitizeRichCommentHtml(serializeNodeToRichHtml(root));
}

export function looksLikeRichCommentHtml(value: string): boolean {
  return /<\/?(?:p|div|br|b|strong|i|em|u|ul|ol|li|span)\b/i.test(value);
}

export function sanitizeRichCommentHtml(html: string): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  sanitizeElementTree(root);

  let result = root.innerHTML
    .replace(/<p><\/p>/gi, '<br>')
    .replace(/<div><\/div>/gi, '<br>')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .trim();

  if (result === '<br>') return '';
  return result;
}

export function valueToEditorHtml(value: string): string {
  if (!value.trim()) return '';
  if (looksLikeRichCommentHtml(value)) return sanitizeRichCommentHtml(value);
  if (value.includes('**')) return legacyMarkdownToRichHtml(value);
  return plainTextToRichHtml(value);
}

export function editorHtmlToStoredValue(html: string): string {
  const cleaned = sanitizeRichCommentHtml(html);
  if (looksLikeRichCommentHtml(cleaned)) return cleaned;
  return normalizeLineBreaks(cleaned.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
}

/** Tuloste: turvallinen HTML tai escattu plain text. */
export function formatHuomioForPrint(text: string, esc: (v: unknown) => string): string {
  if (!text.trim()) return '';
  if (looksLikeRichCommentHtml(text)) return sanitizeRichCommentHtml(text);
  if (text.includes('**')) {
    return legacyMarkdownToRichHtml(text);
  }
  return esc(text).replace(/\n/g, '<br>');
}

export const huomioPrintTextStyle = 'white-space:pre-wrap;word-wrap:break-word;';

export function clipboardDataToRichCommentHtml(data: DataTransfer): string {
  const html = data.getData('text/html');
  if (html.trim()) {
    try {
      return clipboardHtmlToRichComment(html);
    } catch {
      // fallback plain
    }
  }
  return plainTextToRichHtml(normalizeLineBreaks(data.getData('text/plain')));
}

export const RICH_COMMENT_FONT_SIZES = [
  { label: 'Pieni', value: '2' },
  { label: 'Normaali', value: '3' },
  { label: 'Suuri', value: '5' },
] as const;
