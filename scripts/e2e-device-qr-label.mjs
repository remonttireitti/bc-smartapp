// QR-tarra (Dymo XTL 300, 24 mm teippi): tulosteen @page-koko, PNG 709×283 px / 300 dpi, PDF 60×24 mm. Ei verkkokirjoituksia.
// Ajo: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5303 & BASE=http://localhost:5303 node scripts/e2e-device-qr-label.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5303';
const b = await chromium.launch();
const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/q/${'A'.repeat(43)}`); await p.waitForTimeout(3000);
const r = await p.evaluate(async () => {
  const m = await import('/src/lib/deviceQrLabel.ts');
  const item = { token: 'Zk3Jq9XcVbN2mLp0RtYu7WsEaD4fGhJk8QzXcVbN2mL', name: 'Kylmäkoneikko', tag: 'JK-1' };
  const png = new Uint8Array(await (await m.renderDeviceQrLabelPng(item, 'https://bestcool.eu')).arrayBuffer());
  const pdf = await (await m.renderDeviceQrLabelPdf(item, 'https://bestcool.eu')).text();
  const dv = new DataView(png.buffer);
  return {
    html: await m.buildDeviceQrLabelsHtml([item, item], 'https://bestcool.eu'),
    w: dv.getUint32(16), h: dv.getUint32(20),
    phys: [dv.getUint32(41), dv.getUint32(45)], physTag: String.fromCharCode(...png.slice(37, 41)),
    pdfBox: /\/MediaBox \[([^\]]+)\]/.exec(pdf)?.[1], file: m.deviceQrLabelFileName(item, 'png'),
  };
});
const c = {
  pageSize: /@page \{ size: 60mm 24mm; margin: 0; \}/.test(r.html),
  twoLabels: (r.html.match(/class="qr-label"/g) || []).length === 2,
  tagline: r.html.includes('Sähköinen huoltopöytäkirja – ylläpitää BC Smartapp'),
  bigTunnus: r.html.includes('>JK-1</strong>') && /font-size:20pt/.test(r.html),
  pngSize: r.w === 709 && r.h === 283,
  pngDpi: r.physTag === 'pHYs' && r.phys[0] === 11811 && r.phys[1] === 11811,
  pdfSize: r.pdfBox === '0 0 170.08 68.03' || /^0 0 170\.0\d* 68\.0\d*$/.test(r.pdfBox || ''),
  fileName: r.file === 'qr-tarra-jk-1.png',
  noErrors: errs.length === 0,
};
console.log(JSON.stringify(c), r.pdfBox);
console.log(Object.values(c).every(Boolean) ? 'RESULT PASS' : 'RESULT FAIL');
await b.close();
