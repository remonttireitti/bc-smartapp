const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'article', 'section', 'td', 'th',
]);

/** Normalisoi rivinvaihdot yhteen muotoon. */
export function normalizeLineBreaks(text: string): string {
  return text
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\v/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n\n');
}

function normalizeText(text: string): string {
  return text.replace(/\u00A0/g, ' ');
}

function extractHtmlFragment(html: string): string {
  const match = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
  return match ? match[1] : html;
}

function preprocessClipboardHtml(html: string): string {
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

  const cls = (el.getAttribute('class') ?? '').toLowerCase();
  return /\bbold\b/.test(cls) || /\bmsobold\b/.test(cls);
}

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((child) => isBlockTag(child.tagName.toLowerCase()));
}

function serializeChildren(el: Element): string {
  return Array.from(el.childNodes).map((child) => serializeNode(child)).join('');
}

function wrapBold(inner: string): string {
  const trimmed = inner.trim();
  if (!trimmed) return inner;
  const lead = inner.match(/^\s*/)?.[0] ?? '';
  const trail = inner.match(/\s*$/)?.[0] ?? '';
  return `${lead}**${trimmed}**${trail}`;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeText(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '\n';

  if (isBoldElement(el)) {
    const inner = serializeChildren(el);
    if (!inner.trim()) return inner;
    return wrapBold(inner);
  }

  let out = serializeChildren(el);

  if (isBlockTag(tag) && !hasBlockChild(el)) {
    if (!out.replace(/[\s\u00A0]/g, '')) return '\n';
    if (!out.endsWith('\n')) out += '\n';
  }

  return out;
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

function finalizePasteText(raw: string): string {
  let text = normalizeLineBreaks(raw);
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n[ \t]+(?=\n)/g, '\n');
  return text;
}

function scorePasteQuality(text: string): number {
  const newlines = (text.match(/\n/g) ?? []).length;
  const paragraphBreaks = (text.match(/\n\s*\n/g) ?? []).length;
  const boldMarkers = (text.match(/\*\*[^*]+\*\*/g) ?? []).length;
  return newlines * 3 + paragraphBreaks * 8 + boldMarkers * 12 + text.length * 0.01;
}

function pickRicherPaste(fromHtml: string, plain: string): string {
  if (!fromHtml.trim()) return plain;
  if (!plain.trim()) return fromHtml;
  return scorePasteQuality(fromHtml) >= scorePasteQuality(plain) ? fromHtml : plain;
}

/** Muuntaa HTML-leikepöydän tekstiksi: rivit + **lihavointi** markdown-merkeillä. */
export function htmlClipboardToPlainText(html: string): string {
  const root = htmlToRootElement(html);
  const raw = serializeNode(root);
  return finalizePasteText(raw);
}

/** Lukee leikepöydältä tekstin säilyttäen rivit (HTML → plain tarvittaessa). */
export function clipboardDataToPlainText(data: DataTransfer): string {
  const plain = finalizePasteText(normalizeLineBreaks(data.getData('text/plain')));
  const html = data.getData('text/html');

  if (!html.trim()) return plain;

  try {
    const fromHtml = htmlClipboardToPlainText(html);
    return pickRicherPaste(fromHtml, plain);
  } catch {
    return plain;
  }
}

/** Korvaa textarea-liitos: säilyttää rivit ja lihavoinnin **merkinnöissä**. */
export function handlePlainTextPaste(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  currentValue: string,
  onValueChange: (value: string) => void,
): void {
  e.preventDefault();
  const textarea = e.currentTarget;
  const text = clipboardDataToPlainText(e.clipboardData);
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? start;
  const next = currentValue.slice(0, start) + text + currentValue.slice(end);
  onValueChange(next);
  const pos = start + text.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  });
}
