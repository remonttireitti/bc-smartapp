/** Normalisoi rivinvaihdot yhteen muotoon. */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isBoldElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong') return true;
  const style = el.getAttribute('style') ?? '';
  return /font-weight:\s*(bold|[6-9]00)/i.test(style);
}

function blockEndsWithNewline(tag: string): boolean {
  return ['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag);
}

function serializeClipboardNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '\n';

  const inner = Array.from(el.childNodes).map(serializeClipboardNode).join('');
  if (isBoldElement(el)) {
    const trimmed = inner.trim();
    return trimmed ? `**${trimmed}**` : '';
  }
  if (blockEndsWithNewline(tag)) {
    return `${inner}\n`;
  }
  return inner;
}

/** Muuntaa HTML-leikepöydän tekstiksi: rivit + **lihavointi** markdown-merkeillä. */
export function htmlClipboardToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const raw = serializeClipboardNode(doc.body);
  return normalizeLineBreaks(raw).replace(/\n{3,}/g, '\n\n').trim();
}

/** Lukee leikepöydältä tekstin säilyttäen rivit (HTML → plain tarvittaessa). */
export function clipboardDataToPlainText(data: DataTransfer): string {
  const html = data.getData('text/html');
  if (html.trim()) {
    try {
      return htmlClipboardToPlainText(html);
    } catch {
      // fallback plain
    }
  }
  return normalizeLineBreaks(data.getData('text/plain'));
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
