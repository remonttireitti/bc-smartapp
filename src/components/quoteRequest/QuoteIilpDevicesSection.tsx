import { useMemo } from 'react';
import { computeIilpNeedKw } from '../../lib/quoteRequest/calculations';
import { VILP_BRAND_OPTIONS } from '../../lib/quoteRequest/constants';
import { findDeviceById, formatDeviceLabel, suggestBestIilpDeviceId } from '../../lib/quoteRequest/deviceCatalog';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import QuotePumpDevicesSection from './QuotePumpDevicesSection';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  feeMap?: import('../../data/devicePricingShared').BrandDeliveryFeeByCategoryMap | null;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteIilpDevicesSection({ form, canEdit, feeMap, onChange }: Props) {
  const needKw = computeIilpNeedKw(form);
  const suggestedId = useMemo(
    () => suggestBestIilpDeviceId(form, needKw),
    [form, needKw],
  );

  const manualSelection =
    form.selectedDeviceId && suggestedId && form.selectedDeviceId !== suggestedId;

  return (
    <>
      <section className="form-section">
        <h2>Laitevalinta</h2>
        <p className="muted">
          Ehdotamme ensisijaisesti mitoituksen mukaista laitetta. Voit valita myös muun mallin — lisää
          silloin huomautus valinnasta.
        </p>
        {needKw > 0 && (
          <p className="muted">
            Mitoitusteho: <strong>{needKw} kW</strong>
            {suggestedId && findDeviceById(suggestedId) && (
              <>
                {' '}
                • Ehdotus:{' '}
                <strong>{formatDeviceLabel(findDeviceById(suggestedId)!)}</strong>
              </>
            )}
          </p>
        )}
        <label>
          Valmistaja
          <select
            value={form.vilpBrandChoice}
            disabled={!canEdit}
            onChange={(e) => {
              const vilpBrandChoice = e.target.value as QuoteRequestData['vilpBrandChoice'];
              const nextForm = { ...form, vilpBrandChoice, selectedDeviceId: '', altDevice1Id: '', altDevice2Id: '' };
              const suggestedId = suggestBestIilpDeviceId(nextForm, needKw);
              const suggested = suggestedId ? findDeviceById(suggestedId) : null;
              onChange({
                vilpBrandChoice,
                selectedDeviceId: suggested?.id ?? '',
                altDevice1Id: '',
                altDevice2Id: '',
                iilpDeviceSelectionNote: '',
                ...(suggested
                  ? { deviceBrand: suggested.brand, deviceModel: suggested.model }
                  : { deviceBrand: '', deviceModel: '' }),
              });
            }}
          >
            {VILP_BRAND_OPTIONS.map((opt) => (
              <option key={opt.value || 'none'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {!form.vilpBrandChoice && (
          <p className="muted">Valitse valmistaja nähdäksesi laitelistauksen.</p>
        )}
        {form.vilpBrandChoice && form.buildingType === 'kerrostalo' && (
          <p className="muted quote-kerrostalo-note">
            Kerrostalossa näytetään oletuksena jäähdytykseen sopivat mallit.
          </p>
        )}
      </section>

      {form.vilpBrandChoice && (
        <QuotePumpDevicesSection
          form={form}
          canEdit={canEdit}
          heatingNeedKw={needKw}
          feeMap={feeMap}
          onChange={onChange}
          variant="selection"
          suggestedDeviceId={suggestedId}
        />
      )}

      {manualSelection && (
        <section className="form-section">
          <label>
            Huomautus laitteen valinnasta
            <textarea
              rows={2}
              value={form.iilpDeviceSelectionNote}
              disabled={!canEdit}
              placeholder="Esim. asiakas toivoo tiettyä mallia / teho poikkeaa mitoituksesta koska…"
              onChange={(e) => onChange({ iilpDeviceSelectionNote: e.target.value })}
            />
          </label>
        </section>
      )}
    </>
  );
}
