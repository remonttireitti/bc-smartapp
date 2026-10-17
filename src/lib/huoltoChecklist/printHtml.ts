import { PRINT_SHELL_CSS, renderInfoColumns, renderPrintHeader, renderVerdictBand } from '../huoltoRaportti/printShell';
import { CHECKLIST_STATUS_LABELS, CIRCUIT_LIMITS, checklistTemplate } from './templates';
import {
  CHECKLIST_OVERALL_LABELS,
  checklistDeviceLabel,
  checklistFindings,
  checklistSummary,
  circuitViolations,
  derivedItemValues,
  formatFiDate,
  measurementLimitText,
  measurementViolation,
  type ChecklistReportData,
} from './logic';

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export type ChecklistPrintMeta = {
  companyName: string;
  logoUrl?: string;
  /** storagePath → URL (tai data-URL). */
  imageUrls: Record<string, string>;
  customer?: { name?: string | null; address?: string | null; contact?: string | null } | null;
  device?: { name?: string | null; tag?: string | null; model?: string | null; serial?: string | null; location?: string | null } | null;
};

const EXTRA_CSS = `
.rp table.cl { width: 100%; border-collapse: collapse; }
.rp table.cl th, .rp table.cl td { text-align: left; vertical-align: top; padding: .9mm 1mm; border-bottom: .5px solid #d4d4d4; font-size: 8.5pt; }
.rp table.cl thead th { font-size: 7.5pt; color: #555; font-weight: 400; border-bottom: .5px solid #888; }
.rp table.cl td.st-col { width: 22mm; white-space: nowrap; }
.rp table.cl td.num, .rp table.cl th.num { text-align: right; white-space: nowrap; }
.rp table.cl .sub { color: #555; font-size: 8pt; }
.rp .st-warn { color: #8a5a00; }
.rp .sign img { max-height: 14mm; max-width: 55mm; display: block; }
`;

function statusCell(status: string | null | undefined): string {
  if (status === 'ok') return '<span class="st st-ok">✓ OK</span>';
  if (status === 'huom') return '<span class="st st-warn">! Huomautus</span>';
  if (status === 'vika') return '<span class="st st-bad">✗ Vika</span>';
  return '<span class="st st-na">Ei kuulu</span>';
}

function kv(label: string, value: unknown): string {
  const v = String(value ?? '').trim();
  return v ? `<div class="kvr"><span>${esc(label)}</span><span>${esc(v)}</span></div>` : '';
}

export function buildChecklistPrintTitle(data: ChecklistReportData, customerName?: string | null): string {
  const t = checklistTemplate(data.reportCategory);
  return [customerName?.trim() || data.asiakas.trim(), checklistDeviceLabel(data), t.title, formatFiDate(data.tarkastusPvm)]
    .filter(Boolean)
    .join(' - ');
}

export function generateChecklistPrintHtml(data: ChecklistReportData, meta: ChecklistPrintMeta): string {
  const template = checklistTemplate(data.reportCategory);
  const summary = checklistSummary(data, template);
  const findings = checklistFindings(data, template);
  // Raja-arvon ylitys näkyy rivin tilana (ei erillistä havaintolistaa, ettei tieto toistu).
  const effective = new Map(findings.map((f) => [f.itemId, f.status]));
  const date = formatFiDate(data.tarkastusPvm);

  const verdictClass = summary.overall === 'vika' ? 'st-bad' : summary.overall === 'huom' ? 'st-warn' : summary.overall === 'ok' ? 'st-ok' : 'st-na';
  const verdictMark = summary.overall === 'vika' ? '✗ ' : summary.overall === 'huom' ? '! ' : summary.overall === 'ok' ? '✓ ' : '';
  const band = renderVerdictBand([
    `<span class="verdict ${verdictClass}">${verdictMark}${esc(CHECKLIST_OVERALL_LABELS[summary.overall])}</span>`,
    `<span class="muted">OK ${summary.ok} · Huomautus ${summary.huom} · Vika ${summary.vika} · Ei kuulu ${summary.na}</span>`,
    date ? `<span class="muted">${esc(date)}</span>` : '',
  ]);

  const customerName = meta.customer?.name?.trim() || data.asiakas;
  const info = renderInfoColumns([
    {
      title: 'Asiakas',
      html: [kv('Nimi', customerName), kv('Osoite', meta.customer?.address || data.osoite), kv('Yhteyshenkilö', meta.customer?.contact)].join(''),
    },
    {
      title: 'Kohde',
      html: [
        kv('Kohde', data.kohde),
        kv('Laite', meta.device?.name),
        kv('Tunnus', meta.device?.tag || data.laiteTunnus),
        kv('Malli', meta.device?.model || [data.laiteValmistaja, data.laiteMalli].filter(Boolean).join(' ')),
        kv('Sarjanumero', meta.device?.serial),
        kv('Sijainti', meta.device?.location || data.laiteSijainti),
      ].join(''),
    },
    {
      title: 'Huolto',
      html: [kv('Mittalaitteet', data.mittalaitteet), kv('Seuraava huolto', formatFiDate(data.seuraavaHuolto))].join(''),
    },
  ]);

  const sections = template.sections
    .map((section) => {
      const rows = section.items
        .map((item) => {
          const state = data.items[item.id];
          const status = effective.get(item.id) ?? state?.status;
          const measured = (item.measurements ?? [])
            .map((m) => {
              const raw = data.measurements[m.id]?.trim();
              if (!raw) return '';
              const bad = measurementViolation(m, raw);
              const limit = measurementLimitText(m);
              const txt = `${m.label} ${raw}${m.unit ? ` ${m.unit}` : ''}`;
              return bad
                ? `<span class="${bad === 'vika' ? 'st-bad' : 'st-warn'}">${esc(txt)} (raja ${esc(limit)})</span>`
                : esc(txt);
            })
            .filter(Boolean);
          const derived = derivedItemValues(item.id, data.measurements).map(esc);
          const values = [...measured, ...derived].join(' · ');
          const comment = state?.comment?.trim();
          // Ei kuulu ja ei mittausta: rivi pois tulosteesta, ettei toisteta tyhjää.
          if (!status && !values && !comment) return '';
          return `<tr><td class="st-col">${statusCell(status)}</td><td>${esc(item.label)}${values ? `<div class="sub">${values}</div>` : ''}${comment ? `<div class="sub">${esc(comment)}</div>` : ''}</td></tr>`;
        })
        .filter(Boolean)
        .join('');
      if (!rows) return '';
      return `<section class="sec"><h2>${esc(section.title)}</h2><table class="cl"><tbody>${rows}</tbody></table></section>`;
    })
    .join('');

  let circuitsHtml = '';
  if (template.circuitTable) {
    const rows = data.circuits.filter((r) => [r.keskus, r.ryhma, r.suoja, r.riso, r.zs, r.rcdMs].some((v) => v.trim()));
    if (rows.length) {
      const viol = circuitViolations(rows);
      const bad = (id: string, field: 'riso' | 'rcdMs') => viol.some((v) => v.rowId === id && v.field === field);
      circuitsHtml = `<section class="sec"><h2>Mittaukset ryhmittäin</h2><table class="cl"><thead><tr><th>Keskus</th><th>Ryhmä</th><th>Suojalaite</th><th class="num">Riso MΩ (≥ ${CIRCUIT_LIMITS.risoMinMohm})</th><th class="num">Zs Ω</th><th class="num">RCD ms (≤ ${CIRCUIT_LIMITS.rcdMaxMs})</th></tr></thead><tbody>${rows
        .map(
          (r) => `<tr><td>${esc(r.keskus)}</td><td>${esc(r.ryhma)}</td><td>${esc(r.suoja)}</td><td class="num${bad(r.id, 'riso') ? ' st-bad' : ''}">${esc(r.riso)}</td><td class="num">${esc(r.zs)}</td><td class="num${bad(r.id, 'rcdMs') ? ' st-bad' : ''}">${esc(r.rcdMs)}</td></tr>`,
        )
        .join('')}</tbody></table></section>`;
    }
  }

  const actions = data.toimenpiteet.trim()
    ? `<section class="sec keep"><h2>Toimenpide-ehdotukset</h2><div class="note">${esc(data.toimenpiteet.trim())}</div></section>`
    : '';

  const photos = template.sections
    .flatMap((s) => s.items.map((item) => ({ item, photos: data.items[item.id]?.photos ?? [] })))
    .flatMap(({ item, photos: list }) => list.map((p) => ({ item, p })))
    .filter(({ p }) => meta.imageUrls[p.storagePath]);
  const photosHtml = photos.length
    ? `<section class="sec"><h2>Kuvat</h2><div class="photos">${photos
        .map(({ item, p }) => `<figure><img src="${escAttr(meta.imageUrls[p.storagePath])}" alt="" /><figcaption>${esc([item.label, p.comment].filter((s) => s && s.trim()).join(' – '))}</figcaption></figure>`)
        .join('')}</div></section>`
    : '';

  const signature = `<div class="sign">
    <div><strong>${esc(data.suorittajaNimi)}</strong>Suorittaja${data.suorittajaPatevyys.trim() ? ` · ${esc(data.suorittajaPatevyys.trim())}` : ''}</div>
    <div><strong>${esc(date)}</strong>Päivämäärä</div>
    <div>${data.signature ? `<img src="${escAttr(data.signature)}" alt="" />` : '<strong></strong>'}Allekirjoitus</div>
  </div>`;

  const subtitle = [template.basis, checklistDeviceLabel(data)].filter(Boolean).join(' · ');
  return `<style>${PRINT_SHELL_CSS}${EXTRA_CSS}</style>
<div class="rp">
  ${renderPrintHeader({ logoUrl: meta.logoUrl, companyLine: meta.companyName, title: template.title, subtitle })}
  ${band}
  ${info}
  ${actions}
  ${sections}
  ${circuitsHtml}
  ${photosHtml}
  ${signature}
</div>`;
}

export { CHECKLIST_STATUS_LABELS };
