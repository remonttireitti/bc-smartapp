const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'article', 'section', 'td', 'th',
]);

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN',
]);

const PARA_CLASS = 'rc-para';
const GAP_CLASS = 'rc-gap';
const ALLOWED_CLASSES = new Set([PARA_CLASS, GAP_CLASS]);

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
    if (isBoldElement(el)) {
      const inner = serializeChildren(el);
      return inner.trim() ? `<strong>${inner}</strong>` : inner;
    }
    if (isItalicElement(el)) {
      const inner = serializeChildren(el);
      return inner.trim() ? `<em>${inner}</em>` : inner;
    }
    if (isUnderlineElement(el)) {
      const inner = serializeChildren(el);
      return inner.trim() ? `<u>${inner}</u>` : inner;
    }
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
    if (!out.replace(/[\s\u00A0]/g, '')) return `<p class="${GAP_CLASS}"><br></p>`;
    return `<p class="${PARA_CLASS}">${out}</p>`;
  }

  return out;
}

function plainTextToRichHtml(text: string): string {
  const normalized = normalizeLineBreaks(text);
  if (!normalized.trim()) return '';

  return normalized
    .split(/\n\n+/)
    .map((block) => {
      if (!block.trim()) return `<p class="${GAP_CLASS}"><br></p>`;
      const inner = block.split('\n').map((line) => escapeHtml(line)).join('<br>');
      return `<p class="${PARA_CLASS}">${inner}</p>`;
    })
    .join('');
}

function legacyMarkdownToRichHtml(text: string): string {
  const normalized = normalizeLineBreaks(text);
  return normalized
    .split(/\n\n+/)
    .map((block) => {
      if (!block.trim()) return `<p class="${GAP_CLASS}"><br></p>`;
      const html = block
        .split('\n')
        .map((line) => {
          const withBold = line.replace(/\*\*([^*]+?)\*\*/g, (_, inner: string) => `<strong>${escapeHtml(inner)}</strong>`);
          return withBold.includes('<strong>') ? withBold : escapeHtml(line);
        })
        .join('<br>');
      return `<p class="${PARA_CLASS}">${html}</p>`;
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

function convertElementTag(el: Element, newTag: string): Element {
  const replacement = el.ownerDocument.createElement(newTag);
  while (el.firstChild) replacement.appendChild(el.firstChild);
  el.parentNode?.replaceChild(replacement, el);
  return replacement;
}

function normalizeInlineFormatting(root: Element): void {
  root.querySelectorAll('span').forEach((span) => {
    const style = span.getAttribute('style') ?? '';
    const fontSize = extractAllowedFontSize(style);

    if (isBoldElement(span)) {
      convertElementTag(span, 'strong');
      return;
    }
    if (isItalicElement(span)) {
      convertElementTag(span, 'em');
      return;
    }
    if (isUnderlineElement(span)) {
      convertElementTag(span, 'u');
      return;
    }
    if (fontSize) return;

    unwrapElement(span);
  });

  root.querySelectorAll('b').forEach((el) => {
    if (el.tagName === 'B') convertElementTag(el, 'strong');
  });
  root.querySelectorAll('i').forEach((el) => {
    if (el.tagName === 'I') convertElementTag(el, 'em');
  });
}

function convertDivToParagraph(el: Element): Element {
  const p = el.ownerDocument.createElement('p');
  const cls = el.getAttribute('class') ?? '';
  p.setAttribute('class', ALLOWED_CLASSES.has(cls) ? cls : PARA_CLASS);
  while (el.firstChild) p.appendChild(el.firstChild);
  el.parentNode?.replaceChild(p, el);
  return p;
}

function classifyParagraph(el: Element): void {
  if (el.tagName !== 'P') return;
  const cls = el.getAttribute('class') ?? '';
  if (ALLOWED_CLASSES.has(cls)) return;
  const text = (el.textContent ?? '').replace(/\u00A0/g, ' ').trim();
  const onlyBreaks = !text && !!el.querySelector('br');
  el.setAttribute('class', !text || onlyBreaks ? GAP_CLASS : PARA_CLASS);
}

function normalizeEditorStructure(html: string): string {
  if (!html.trim()) return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return html;

  for (const child of Array.from(root.children)) {
    if (child.tagName === 'DIV') convertDivToParagraph(child as Element);
  }

  root.querySelectorAll('p').forEach((p) => classifyParagraph(p));
  compactLegacyLineParagraphs(root);
  normalizeInlineFormatting(root);

  return root.innerHTML;
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

function applyPrintParagraphStyles(el: Element): void {
  if (el.classList.contains(GAP_CLASS)) {
    el.setAttribute('style', 'min-height:0.55em;margin:0;padding:0;line-height:1.35;');
  } else if (el.classList.contains(PARA_CLASS)) {
    el.setAttribute('style', 'margin:0 0 0.5em;padding:0;line-height:1.4;');
  }
}

function applyPrintRichStyles(html: string): string {
  if (!html.trim()) return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return html;

  normalizeInlineFormatting(root);

  root.querySelectorAll('p').forEach((p) => {
    if (!p.classList.contains(PARA_CLASS) && !p.classList.contains(GAP_CLASS)) {
      classifyParagraph(p);
    }
    applyPrintParagraphStyles(p);
  });

  root.querySelectorAll('strong, b').forEach((el) => {
    el.setAttribute('style', 'font-weight:700;');
  });
  root.querySelectorAll('em, i').forEach((el) => {
    el.setAttribute('style', 'font-style:italic;');
  });
  root.querySelectorAll('u').forEach((el) => {
    el.setAttribute('style', 'text-decoration:underline;');
  });
  root.querySelectorAll('ul, ol, li').forEach((el) => {
    applyPrintListStyles(el);
  });

  return root.innerHTML;
}

function compactLegacyLineParagraphs(root: Element): void {
  const doc = root.ownerDocument;
  const flush = (group: Element[]) => {
    if (group.length <= 1) return;
    const merged = doc.createElement('p');
    merged.setAttribute('class', PARA_CLASS);
    group.forEach((p, index) => {
      if (index > 0) merged.appendChild(doc.createElement('br'));
      while (p.firstChild) merged.appendChild(p.firstChild);
    });
    root.insertBefore(merged, group[0]);
    group.forEach((p) => p.remove());
  };

  let group: Element[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE || (node as Element).tagName !== 'P') {
      flush(group);
      group = [];
      continue;
    }
    const p = node as Element;
    if (p.classList.contains(GAP_CLASS) || !(p.textContent ?? '').replace(/\u00A0/g, ' ').trim()) {
      flush(group);
      group = [];
      continue;
    }
    const isSimpleLine = !p.querySelector('ul,ol,br') && p.children.length === 0;
    if (isSimpleLine) {
      group.push(p);
    } else {
      flush(group);
      group = [];
    }
  }
  flush(group);
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

    if (tag === 'DIV') {
      el = convertDivToParagraph(el);
      tag = el.tagName;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      unwrapElement(el);
      continue;
    }

    const classBefore = el.getAttribute('class') ?? '';
    const styleBefore = el.getAttribute('style') ?? '';
    while (el.attributes.length > 0) {
      el.removeAttribute(el.attributes[0].name);
    }

    if (tag === 'P') {
      if (ALLOWED_CLASSES.has(classBefore)) {
        el.setAttribute('class', classBefore);
      } else {
        classifyParagraph(el);
      }
      sanitizeElementTree(el);
      continue;
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

    if (tag === 'STRONG' || tag === 'EM' || tag === 'U' || tag === 'B' || tag === 'I') {
      sanitizeElementTree(el);
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
  return /<\/?[a-z][\w-]*\b/i.test(value);
}

export const RICH_COMMENT_PRINT_CSS = `
.rc-print p { margin: 0; padding: 0; line-height: 1.4; }
.rc-print p.rc-para + p.rc-para { margin-top: 0.5em; }
.rc-print p.rc-gap { min-height: 0.55em; margin: 0; }
.rc-print strong, .rc-print b { font-weight: 700; }
.rc-print em, .rc-print i { font-style: italic; }
.rc-print u { text-decoration: underline; }
.rc-print ul { margin: 0.25em 0; padding-left: 1.25em; list-style: disc; }
.rc-print ol { margin: 0.25em 0; padding-left: 1.35em; list-style: decimal; }
.rc-print li { margin: 0.15em 0; }
`;

export function sanitizeRichCommentHtml(html: string): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  normalizeInlineFormatting(root);
  sanitizeElementTree(root);

  let result = root.innerHTML
    .replace(/<p><\/p>/gi, '<br>')
    .replace(/<div><\/div>/gi, '<br>')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .trim();

  if (result === '<br>') return '';
  return result;
}

export function markEditorParagraphs(root: HTMLElement): void {
  for (const child of Array.from(root.children)) {
    if (child.tagName === 'DIV') convertDivToParagraph(child as Element);
  }
  root.querySelectorAll('p').forEach((p) => classifyParagraph(p));
}

export function valueToEditorHtml(value: string): string {
  if (!value.trim()) return '';
  let html = value;
  if (!looksLikeRichCommentHtml(value)) {
    html = value.includes('**') ? legacyMarkdownToRichHtml(value) : plainTextToRichHtml(value);
  }
  return sanitizeRichCommentHtml(normalizeEditorStructure(html));
}

export function editorHtmlToStoredValue(html: string): string {
  const normalized = normalizeEditorStructure(html);
  const cleaned = sanitizeRichCommentHtml(normalized);
  if (looksLikeRichCommentHtml(cleaned)) return cleaned;
  return normalizeLineBreaks(cleaned.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
}

/** Tuloste: turvallinen HTML tai escattu plain text. */
export function formatHuomioForPrint(text: string, esc: (v: unknown) => string): string {
  if (!text.trim()) return '';

  let html = text;
  if (!looksLikeRichCommentHtml(text)) {
    if (text.includes('**')) {
      html = legacyMarkdownToRichHtml(text);
    } else {
      return `<div class="rc-print">${esc(text).replace(/\n/g, '<br>')}</div>`;
    }
  }

  const processed = applyPrintRichStyles(
    sanitizeRichCommentHtml(normalizeEditorStructure(html)),
  );
  return `<div class="rc-print">${processed}</div>`;
}

export const huomioPrintTextStyle = 'white-space:pre-wrap;word-wrap:break-word;';

export function paragraphGapHtml(): string {
  return `<p class="${GAP_CLASS}"><br></p>`;
}

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
