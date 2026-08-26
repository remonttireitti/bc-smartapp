import type { ReactNode } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import QuoteIilpSiteSection from './QuoteIilpSiteSection';
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
              />
            </label>
            <label>
              Laitteen malli
              <input
                value={form.deviceModel}
                onChange={(e) => onChange({ deviceModel: e.target.value })}
                disabled={!canEdit}
              />
            </label>
          </div>
        );
      case 'huolto-kuvaus':
        return (
          <label>
            Vikakuvaus / työnkuvaus
            <textarea
              rows={6}
              value={form.faultDescription}
              onChange={(e) => onChange({ faultDescription: e.target.value })}
              disabled={!canEdit}
            />
          </label>
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
      hint="Kohteen tiedot, mitoitus ja asennus — avaa ruudusta."
      tiles={tiles}
      renderTileContent={renderTileContent}
    />
  );
}
