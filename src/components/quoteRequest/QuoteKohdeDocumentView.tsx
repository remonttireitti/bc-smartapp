import type { ReactNode } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import QuoteIilpSiteSection from './QuoteIilpSiteSection';
import QuoteBulletListSection from './QuoteBulletListSection';
import QuoteOptionalItemsSection from './QuoteOptionalItemsSection';
import QuoteTermsPrintSection from './QuoteTermsPrintSection';
import QuoteVilpSiteSection from './QuoteVilpSiteSection';
import { isRepairQuoteType } from '../../lib/quoteRequest/constants';
import {
  buildQuoteKohdeTiles,
  type QuoteKohdeTileId,
} from '../../lib/quoteRequest/quoteKohdeEntries';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteKohdeDocumentView({ form, canEdit, onChange }: Props) {
  const tiles = buildQuoteKohdeTiles(form);

  function renderTileContent(tileId: QuoteKohdeTileId): ReactNode {
    switch (tileId) {
      case 'tyoraportti-otsikko':
        return (
          <label>
            {isRepairQuoteType(form.type)
              ? 'Tarjouksen otsikko (tuloste ja työraportti)'
              : 'Otsikko (tuloste / tiedostonimi)'}
            <input
              type="text"
              value={form.introText}
              onChange={(e) => onChange({ introText: e.target.value })}
              disabled={!canEdit}
              placeholder={
                isRepairQuoteType(form.type)
                  ? 'Esim. Ilmalämpöpumpun huolto'
                  : 'Esim. ILK 22A korjaukset'
              }
            />
          </label>
        );
      case 'tyoraportti-kuvaus':
        return (
          <label>
            Tehtävän kuvaus
            <textarea
              rows={6}
              value={form.faultDescription}
              onChange={(e) => onChange({ faultDescription: e.target.value })}
              disabled={!canEdit}
              placeholder="Mitä työ sisältää?"
            />
          </label>
        );
      case 'iilp-mitoitus':
        return <QuoteIilpSiteSection form={form} canEdit={canEdit} onChange={onChange} variant="mitoitus" />;
      case 'iilp-asennus':
        return <QuoteIilpSiteSection form={form} canEdit={canEdit} onChange={onChange} variant="asennus" />;
      case 'vilp-kohde':
        return <QuoteVilpSiteSection form={form} canEdit={canEdit} onChange={onChange} />;
      case 'huolto-laite':
        if (!isRepairQuoteType(form.type)) {
          return <p className="muted">Valitse tarjouksen tyyppi ylhäältä.</p>;
        }
        return (
          <div className="line-form-grid">
            <label>
              Laitteen merkki
              <input
                value={form.deviceBrand}
                onChange={(e) => onChange({ deviceBrand: e.target.value })}
                disabled={!canEdit}
                placeholder="Esim. Inventor"
              />
            </label>
            <label>
              Laitteen malli
              <input
                value={form.deviceModel}
                onChange={(e) => onChange({ deviceModel: e.target.value })}
                disabled={!canEdit}
                placeholder="Esim. LHUVI-12WFI"
              />
            </label>
          </div>
        );
      case 'huolto-ei-kuulu':
        return (
          <QuoteBulletListSection
            title="Ei kuulu tarjoukseen"
            hint="Kirjaa kohdat jotka eivät sisälly tarjouksen hintaan. Näkyvät asiakastulosteessa pisteluettelona hintatietojen jälkeen."
            items={form.excludedFromQuoteItems ?? []}
            canEdit={canEdit}
            addLabel="+ Lisää kohta"
            placeholder="Esim. Öljyn poisto ja hävitys"
            hideHeader
            onChange={(items) => onChange({ excludedFromQuoteItems: items })}
          />
        );
      case 'huolto-lisavalinnat':
        return (
          <QuoteOptionalItemsSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            hideHeader
            title="Tilattavissa lisänä"
            hint="Lisätyöt tai -tarvikkeet joita asiakas voi tilata tarjouksen päälle. Hinnat näkyvät tulosteessa erillisenä pisteluettelona."
          />
        );
      case 'huolto-tilanne':
        return (
          <>
            <ToggleSwitch
              checked={form.situationReportEnabled}
              disabled={!canEdit}
              label="Sisällytä tilanneraportti tulosteeseen"
              onChange={(checked) => onChange({ situationReportEnabled: checked })}
            />
            {form.situationReportEnabled && (
              <>
                <label>
                  Tilanneraportin otsikko
                  <input
                    value={form.situationReportTitle}
                    onChange={(e) => onChange({ situationReportTitle: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>
                <label>
                  Tilanneraportin teksti
                  <textarea
                    rows={4}
                    value={form.situationReportText}
                    onChange={(e) => onChange({ situationReportText: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>
              </>
            )}
          </>
        );
      case 'maksuehdot':
        return (
          <>
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
            )}
          </>
        );
      case 'toimitusehdot':
        return (
          <label>
            Toimitusehdot
            <textarea
              rows={4}
              value={form.deliveryTermsText}
              onChange={(e) => onChange({ deliveryTermsText: e.target.value })}
              disabled={!canEdit}
            />
          </label>
        );
      case 'iilp-tuloste':
        return (
          <label>
            {form.iilpPurpose === 'cooling' || form.buildingType === 'kerrostalo'
              ? 'Jäähdytyskulutus (tuloste)'
              : 'Säästölaskelma (tuloste)'}
            <textarea
              rows={4}
              value={form.iilpEnergySavingsText}
              onChange={(e) => onChange({ iilpEnergySavingsText: e.target.value })}
              disabled={!canEdit}
            />
          </label>
        );
      case 'tarjousehdot':
        return (
          <>
            <QuoteTermsPrintSection form={form} canEdit={canEdit} onChange={onChange} />
            <label>
              Tarjousehdot (teksti)
              <textarea
                rows={14}
                value={form.quoteTermsText}
                onChange={(e) => onChange({ quoteTermsText: e.target.value })}
                disabled={!canEdit}
              />
            </label>
          </>
        );
      default:
        return null;
    }
  }

  if (tiles.length === 0) {
    return (
      <section className="form-section">
        <h2>Kohde & laskenta</h2>
        <p className="muted">Valitse tarjouksen tyyppi ylhäältä.</p>
      </section>
    );
  }

  return (
    <QuoteDocumentSectionView
      sectionTitle="Kohde & laskenta"
      hint="Sama otsikko ja tehtävän kuvaus kuin työraportissa, sekä kohteen tiedot ja ehdot."
      tiles={tiles}
      renderTileContent={renderTileContent}
    />
  );
}
