import QRCode from 'qrcode';
import { devicePublicUrl } from './devicePublicCard';

export const DEVICE_QR_LABEL_TEXT = 'Laitteen sähköinen huoltopöytäkirja';

export type DeviceQrLabelItem = { token: string; name: string | null; tag: string | null };

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Lyhyt tunnus tarraan: tunnus (tag) tai nimi, max 32 merkkiä. */
export function deviceQrShortName(item: Pick<DeviceQrLabelItem, 'name' | 'tag'>): string {
  const parts = [item.tag?.trim(), item.name?.trim()].filter((v): v is string => Boolean(v));
  const raw = [...new Set(parts)].join(' · ');
  return raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
}

/** Tarra 50 × 30 mm: QR vasemmalla, teksti oikealla. Useampi laite = useampi tarra. */
export async function buildDeviceQrLabelsHtml(items: DeviceQrLabelItem[], origin?: string): Promise<string> {
  const labels = await Promise.all(
    items.map(async (item) => {
      const svg = await QRCode.toString(devicePublicUrl(item.token, origin), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
      return `<div class="qr-label"><div class="qr-code">${svg}</div><div class="qr-text"><strong>${esc(DEVICE_QR_LABEL_TEXT)}</strong><span>${esc(deviceQrShortName(item))}</span></div></div>`;
    }),
  );
  return `<!doctype html><html lang="fi"><head><meta charset="utf-8"><title>QR-tarrat</title><style>
@page { size: 50mm 30mm; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.qr-label { width: 50mm; height: 30mm; padding: 2mm; display: flex; gap: 2mm; align-items: center; page-break-after: always; break-after: page; overflow: hidden; }
.qr-label:last-child { page-break-after: auto; break-after: auto; }
.qr-code { width: 24mm; height: 24mm; flex: 0 0 24mm; }
.qr-code svg { width: 100%; height: 100%; display: block; }
.qr-text { display: flex; flex-direction: column; gap: 1.5mm; min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; hyphens: auto; }
.qr-text strong { font-size: 6.5pt; line-height: 1.15; }
.qr-text span { font-size: 8pt; line-height: 1.15; word-break: break-word; }
@media screen { body { background: #eee; padding: 8px; } .qr-label { background: #fff; margin: 0 auto 8px; outline: 1px dashed #999; } }
</style></head><body>${labels.join('')}</body></html>`;
}
