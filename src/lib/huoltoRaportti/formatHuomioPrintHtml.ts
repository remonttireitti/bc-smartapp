/**
 * Tuloste: esc + yksinkertainen **lihavointi** (käytä white-space:pre-wrap -kontainerissa).
 */
export function formatHuomioPrintHtml(text: string, esc: (v: unknown) => string): string {
  const escaped = esc(text);
  return escaped.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
}

export const huomioPrintTextStyle = 'white-space:pre-wrap;word-wrap:break-word;';
