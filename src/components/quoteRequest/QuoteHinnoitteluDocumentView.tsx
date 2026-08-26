import { type ReactNode } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import QuoteIilpOptionsSection from './QuoteIilpOptionsSection';
import QuoteOptionalItemsSection from './QuoteOptionalItemsSection';
import QuotePumpDevicesSection from './QuotePumpDevicesSection';
import QuoteTermsPrintSection from './QuoteTermsPrintSection';
import QuoteVilpConfigSection from './QuoteVilpConfigSection';
import { QuoteManualDevicePricingSection } from './QuoteManualDevicePricingSection';
import { computeTravelNet, resolveIilpLaborPricingMode, travelCostLabel } from '../../lib/quoteRequest/calculations';
import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import {
  DEFAULT_TRAVEL_KM_RATE,
  isPumpQuoteType,
  quoteShowsKotitalousDeduction,
  quoteUsesTravelCost,
  quoteVatPrintNotice,
} from '../../lib/quoteRequest/constants';
import {
  buildQuoteHinnoitteluTiles,
  type QuoteHinnoitteluTileId,
} from '../../lib/quoteRequest/quoteHinnoitteluEntries';
import type { QuoteRequestData, QuoteVatProfile } from '../../lib/quoteRequest/types';
import { formatDeviceLabel } from '../../lib/quoteRequest/deviceCatalog';
import type { HeatPumpDevice } from '../../data/pumpDeviceCatalog';

type PatchForm = (patch: Partial<QuoteRequestData>) => void;

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: PatchForm;
  pumpSizingNeedKw: number | null;
  deliveryFeeMap: BrandDeliveryFeeByCategoryMap | null;
  onVatProfileChange: (profile: QuoteVatProfile) => void;
  summary: ReactNode;
};

export default function QuoteHinnoitteluDocumentView({
  form,
  canEdit,
  onChange,
  pumpSizingNeedKw,
  deliveryFeeMap,
  onVatProfileChange,
  summary,
}: Props) {
  const tiles = buildQuoteHinnoitteluTiles(form);

  function renderTileContent(tileId: QuoteHinnoitteluTileId): ReactNode {
    switch (tileId) {
      case 'vilp-config':
        return <QuoteVilpConfigSection form={form} canEdit={canEdit} onChange={onChange} />;
      case 'pump-devices':
        return (
          <QuotePumpDevicesSection
            form={form}
            canEdit={canEdit}
            heatingNeedKw={pumpSizingNeedKw}
            feeMap={deliveryFeeMap}
            onChange={onChange}
          />
        );
      case 'iilp-options':
        return <QuoteIilpOptionsSection form={form} canEdit={canEdit} onChange={onChange} />;
      case 'pump-pricing':
        return (
          <QuotePumpDevicesSection
            form={form}
            canEdit={canEdit}
            heatingNeedKw={pumpSizingNeedKw}
            feeMap={deliveryFeeMap}
            onChange={onChange}
            variant="pricing"
          />
        );
      case 'optional-items':
        return <QuoteOptionalItemsSection form={form} canEdit={canEdit} onChange={onChange} />;
      case 'device-pricing':
        return (
          <QuoteManualDevicePricingSection form={form} canEdit={canEdit} onChange={onChange} hideHeader />
        );
      case 'validity':
        return (
          <div className="quote-field-grid">
            <label>
              Voimassa asti
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => onChange({ validUntil: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            {quoteUsesTravelCost(form.type) ? (
              <div className="quote-travel-km panel-inset">
                <ToggleSwitch
                  checked={form.travelKmEnabled}
                  disabled={!canEdit}
                  label="Laskuta km-korvaus"
                  onChange={(checked) =>
                    onChange({
                      travelKmEnabled: checked,
                      travelKmDistance: checked ? form.travelKmDistance || 0 : 0,
                      travelCost: 0,
                    })
                  }
                />
                {form.travelKmEnabled ? (
                  <>
                    <div className="quote-field-grid quote-field-grid-2">
                      <label>
                        Kilometrit
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.travelKmDistance}
                          onChange={(e) => onChange({ travelKmDistance: Number(e.target.value) })}
                          disabled={!canEdit}
                        />
                      </label>
                      <label>
                        Korvaus (€/km, alv 0)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.travelKmRate}
                          onChange={(e) => onChange({ travelKmRate: Number(e.target.value) })}
                          disabled={!canEdit}
                        />
                      </label>
                    </div>
                    <p className="muted">
                      Km-korvaus yhteensä:{' '}
                      <strong>
                        {computeTravelNet(form).toLocaleString('fi-FI', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </strong>{' '}
                      ({form.travelKmDistance || 0} km × {form.travelKmRate || DEFAULT_TRAVEL_KM_RATE} €/km)
                    </p>
                  </>
                ) : (
                  <p className="muted">Oletuksena ei laskuteta. Lisää km-korvaus tarvittaessa.</p>
                )}
              </div>
            ) : null}
          </div>
        );
      case 'vat-discount':
        return (
          <div className="quote-field-grid">
            <div className="quote-vat-profile-field">
              <span className="field-label">ALV / asiakastyyppi</span>
              <div className="quote-labor-mode-grid">
                <button
                  type="button"
                  className={
                    (form.quoteVatProfile ?? 'business') === 'business'
                      ? 'quote-labor-mode-btn active'
                      : 'quote-labor-mode-btn'
                  }
                  disabled={!canEdit}
                  onClick={() => onVatProfileChange('business')}
                >
                  <span className="quote-labor-mode-title">Yritysasiakas</span>
                  <span className="quote-labor-mode-desc">ALV 0 % — hinnat ilman arvonlisäveroa</span>
                </button>
                <button
                  type="button"
                  className={
                    (form.quoteVatProfile ?? 'business') === 'consumer'
                      ? 'quote-labor-mode-btn active'
                      : 'quote-labor-mode-btn'
                  }
                  disabled={!canEdit}
                  onClick={() => onVatProfileChange('consumer')}
                >
                  <span className="quote-labor-mode-title">Yksityishenkilö</span>
                  <span className="quote-labor-mode-desc">
                    ALV {form.vatRate} % — hinnat sisältävät arvonlisäveron
                  </span>
                </button>
              </div>
            </div>
            <label>
              Alennus (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.overallDiscountPercent}
                onChange={(e) => onChange({ overallDiscountPercent: Number(e.target.value) })}
                disabled={!canEdit}
              />
            </label>
          </div>
        );
      case 'terms':
        return (
          <div className="quote-field-grid">
            <label>
              Esittelyteksti
              <textarea
                rows={2}
                value={form.introText}
                onChange={(e) => onChange({ introText: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              Maksuehdot
              <input
                value={form.paymentTermsText}
                onChange={(e) => onChange({ paymentTermsText: e.target.value })}
                disabled={!canEdit}
                placeholder={
                  form.type === 'ilma-ilma'
                    ? 'Esim. 30 % ennakkomaksu tilauksesta, loppu käyttöönoton jälkeen'
                    : undefined
                }
              />
            </label>
            {form.type === 'ilma-ilma' && (
              <>
                <label>
                  Lisätyöt (€/h, alv 0)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.laborRate}
                    onChange={(e) => onChange({ laborRate: Number(e.target.value) || 0 })}
                    disabled={!canEdit}
                  />
                </label>
                <label>
                  {form.iilpPurpose === 'cooling' || form.buildingType === 'kerrostalo'
                    ? 'Jäähdytyskulutus (tuloste)'
                    : 'Säästölaskelma (tuloste)'}
                  <textarea
                    rows={2}
                    value={form.iilpEnergySavingsText}
                    onChange={(e) => onChange({ iilpEnergySavingsText: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>
              </>
            )}
            <label>
              Toimitusehdot
              <textarea
                rows={2}
                value={form.deliveryTermsText}
                onChange={(e) => onChange({ deliveryTermsText: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            {isPumpQuoteType(form.type) && (
              <QuoteTermsPrintSection form={form} canEdit={canEdit} onChange={onChange} />
            )}
            {isPumpQuoteType(form.type) && (
              <label>
                Tarjousehdot (teksti)
                <textarea
                  rows={14}
                  value={form.quoteTermsText}
                  onChange={(e) => onChange({ quoteTermsText: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
            )}
          </div>
        );
      case 'notes':
        return (
          <label>
            Huomautukset
            <textarea
              rows={5}
              value={form.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              disabled={!canEdit}
            />
          </label>
        );
      default:
        return null;
    }
  }

  return (
    <QuoteDocumentSectionView
      sectionTitle="Hinnoittelu"
      hint="Avaa osio ruudusta — kuten huoltoraportin moduuleissa."
      tiles={tiles}
      renderTileContent={renderTileContent}
      footer={summary}
    />
  );
}

export function QuotePricingSummaryBox({
  form,
  totals,
  displayDeviceNet,
  mainDevice,
  kotitalous,
}: {
  form: QuoteRequestData;
  totals: ReturnType<typeof import('../../lib/quoteRequest/calculations').computeQuoteTotals>;
  displayDeviceNet: number;
  mainDevice: HeatPumpDevice | null;
  kotitalous: ReturnType<typeof import('../../lib/quoteRequest/calculations').computeKotitalousDeduction>;
}) {
  return (
    <div className="quote-summary-box">
      <p className="quote-vat-notice">{quoteVatPrintNotice(form.vatRate)}</p>
      <div>
        {form.type === 'ilma-ilma' && resolveIilpLaborPricingMode(form) === 'urakka'
          ? 'Asennustyö (urakka)'
          : 'Työt'}
        : {totals.workNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
      </div>
      <div>
        Tarvikkeet: {totals.materialsNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
      </div>
      {quoteUsesTravelCost(form.type) && totals.travelNet > 0 && (
        <div>
          {travelCostLabel(form)}:{' '}
          {totals.travelNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
        </div>
      )}
      <div>
        Laite
        {mainDevice ? `: ${formatDeviceLabel(mainDevice)}` : ''}:{' '}
        {displayDeviceNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
        {form.vatRate > 0 && (
          <>
            {' '}
            (
            {(displayDeviceNet * (1 + form.vatRate / 100)).toLocaleString('fi-FI', {
              style: 'currency',
              currency: 'EUR',
            })}{' '}
            sis. ALV)
          </>
        )}
      </div>
      {isPumpQuoteType(form.type) && !mainDevice && (
        <p className="error">Laite puuttuu laskennasta — valitse valmistaja ja laite Työt-välilehdellä.</p>
      )}
      <div>
        Yhteensä (alv 0): {totals.discountedNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
      </div>
      {form.vatRate > 0 && (
        <div>
          ALV {form.vatRate}%: {totals.vatAmount.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
        </div>
      )}
      <strong>
        Tarjous yhteensä
        {form.vatRate > 0 ? ` (sis. ALV ${form.vatRate}%)` : ' (alv 0 %)'}:{' '}
        {(form.vatRate > 0 ? totals.grossTotal : totals.discountedNet).toLocaleString('fi-FI', {
          style: 'currency',
          currency: 'EUR',
        })}
      </strong>
      {(form.optionalItems ?? []).some((item) => item.enabled && item.description.trim()) && (
        <div className="quote-optional-summary">
          <strong>Valinnaiset lisät (ei mukana yhteensä)</strong>
          {(form.optionalItems ?? [])
            .filter((item) => item.enabled && item.description.trim())
            .map((item) => (
              <div key={item.id}>
                {item.description.trim()} — hinta +{' '}
                {item.priceGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
              </div>
            ))}
        </div>
      )}
      {quoteShowsKotitalousDeduction(form.type) && kotitalous.laborOnlyGross > 0 && (
        <div>
          {kotitalous.label}:{' '}
          {kotitalous.onePerson.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
          {kotitalous.withSpouse > kotitalous.onePerson
            ? ` (kahdella ${kotitalous.withSpouse.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })})`
            : ''}
        </div>
      )}
    </div>
  );
}
