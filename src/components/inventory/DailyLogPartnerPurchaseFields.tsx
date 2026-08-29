import {
  partnerPurchaseLineTotal,
} from '../../lib/partnerPurchaseDeduction';
import { DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT } from '../../lib/workReportExpenseBilling';
import type { PartnerPurchaseLineDraft } from '../../lib/partnerPurchaseLines';
import DailyLogTileSection from '../DailyLogTileSection';
import { DAILY_LOG_SECTION_COLORS } from '../../lib/dailyLogSectionHelpers';

type Props = {
  drafts: PartnerPurchaseLineDraft[];
  setDrafts: (next: PartnerPurchaseLineDraft[]) => void;
  partnerOptions: { id: string; name: string }[];
};

function rowTitle(row: PartnerPurchaseLineDraft, partnerName: string | undefined): string {
  const desc = row.description.trim() || 'Uusi osto';
  const parts = [desc];
  if (partnerName) parts.push(partnerName);
  if (Number(row.unit_price) > 0) {
    parts.push(`${partnerPurchaseLineTotal({
      qty: Number(row.qty) || 1,
      unit_price: Number(row.unit_price),
      partner_margin_percent: Number(row.partner_margin_percent) || DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
    }).toFixed(2)} €`);
  }
  return parts.join(' · ');
}

export default function DailyLogPartnerPurchaseFields({
  drafts,
  setDrafts,
  partnerOptions,
}: Props) {
  if (partnerOptions.length === 0) return null;

  function updateRow(index: number, patch: Partial<PartnerPurchaseLineDraft>) {
    setDrafts(drafts.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <DailyLogTileSection
      sectionKey="partner-purchase"
      title="Työkalu/varaosa-osto (kumppanin piikki)"
      subtitle={
        drafts.length === 0
          ? 'Ei ostoja'
          : `${drafts.length} osto${drafts.length === 1 ? '' : 'a'}`
      }
      color={DAILY_LOG_SECTION_COLORS.partnerPurchase}
      wide
    >
      <div className="expense-section expense-section-in-dialog partner-purchase-section">
        <p className="muted expense-section-hint">
          Ostot tukkurilta kumppanin piikkiin. Summa vähennetään kumppanilaskutuksesta — ei näy
          asiakkaan tulosteessa.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            setDrafts([
              ...drafts,
              {
                key: crypto.randomUUID(),
                partner_company_id: partnerOptions[0]?.id ?? '',
                supplier_name: '',
                description: '',
                qty: '1',
                unit_price: '',
                partner_margin_percent: String(DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT),
              },
            ])
          }
        >
          + Lisää osto
        </button>
        {drafts.map((row, index) => {
          const partnerName = partnerOptions.find((opt) => opt.id === row.partner_company_id)?.name;
          const previewTotal =
            Number(row.unit_price) > 0
              ? partnerPurchaseLineTotal({
                  qty: Number(row.qty) || 1,
                  unit_price: Number(row.unit_price),
                  partner_margin_percent:
                    Number(row.partner_margin_percent) || DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
                })
              : null;
          return (
            <div key={row.key} className="expense-row partner-purchase-row">
              <h4 className="partner-purchase-row-title">{rowTitle(row, partnerName)}</h4>
              <label>
                Kumppani (jonka piikki)
                <select
                  value={row.partner_company_id}
                  onChange={(e) => updateRow(index, { partner_company_id: e.target.value })}
                  required
                >
                  <option value="">Valitse kumppani…</option>
                  {partnerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kuvaus
                <input
                  value={row.description}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                  placeholder="Esim. Mittarisarja"
                  required
                />
              </label>
              <label>
                Tukkuri / toimittaja
                <input
                  value={row.supplier_name}
                  onChange={(e) => updateRow(index, { supplier_name: e.target.value })}
                  placeholder="Valinnainen"
                />
              </label>
              <label>
                Määrä (kpl)
                <input
                  type="number"
                  step="1"
                  min="0.001"
                  value={row.qty}
                  onChange={(e) => updateRow(index, { qty: e.target.value })}
                  required
                />
              </label>
              <label>
                Veroton hinta (€/kpl)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unit_price}
                  onChange={(e) => updateRow(index, { unit_price: e.target.value })}
                  required
                />
              </label>
              <label>
                Kumppanin välityspalkkio (%)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
                  value={row.partner_margin_percent}
                  onChange={(e) => updateRow(index, { partner_margin_percent: e.target.value })}
                  required
                />
              </label>
              {previewTotal != null ? (
                <p className="muted partner-purchase-preview">
                  Veloitettava kumppanilta: <strong>{previewTotal.toFixed(2).replace('.', ',')} €</strong>
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}
              >
                Poista osto
              </button>
            </div>
          );
        })}
      </div>
    </DailyLogTileSection>
  );
}
