import { huomioLuonneOptions } from '../../lib/huoltoRaportti/constants';
import { ensureHuomiotLiite } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData, HuomioLuonne, HuomiotImageAttachment } from '../../lib/huoltoRaportti/types';
import {
  normalizeMaintenanceReportPhotos,
  type MaintenanceReportPhotoItem,
} from '../../lib/maintenanceReportImages';
import { EvidencePhotoUpload } from './EvidencePhotoUpload';
import { huomiotSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string;
  userId?: string;
}

function liitteetToPhotoItems(liitteet: HuomiotImageAttachment[] | undefined): MaintenanceReportPhotoItem[] {
  return normalizeMaintenanceReportPhotos(
    (liitteet ?? []).map((a) => ({
      storagePath: a.storagePath ?? a.id,
      comment: a.comment ?? '',
    })),
  );
}

function photoItemsToLiitteet(
  items: MaintenanceReportPhotoItem[],
  prev: HuomiotImageAttachment[] | undefined,
): HuomiotImageAttachment[] {
  const previous = prev ?? [];
  return items.map((item) => {
    const existing = previous.find((a) => (a.storagePath ?? a.id) === item.storagePath);
    return ensureHuomiotLiite({
      ...existing,
      id: item.storagePath,
      storagePath: item.storagePath,
      comment: item.comment,
      fileName: existing?.fileName ?? item.storagePath.split('/').pop(),
    });
  });
}

export function HuomiotSection({ form, onChange, reportId, userId }: Props) {
  const luonne = form.huomiotLuonne ?? 'kommentti';
  const photoItems = liitteetToPhotoItems(form.huomiotLiitteet);

  return (
    <HuoltoModuleSection
      moduleKey="huomiot"
      title={huomiotSectionTitle(form.laiteTyyppi)}
    >
      <div className="huolto-submodule">
        <label style={{ maxWidth: '360px' }}>
          Tekstin luonne
          <select
            value={luonne}
            onChange={(e) => onChange({ huomiotLuonne: e.target.value as HuomioLuonne })}
          >
            {huomioLuonneOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="huolto-span-all">
          Huomiot ja suositukset
          <textarea
            value={form.huomiot}
            onChange={(e) => onChange({ huomiot: e.target.value })}
            rows={5}
            placeholder="Kirjoita huomiot…"
          />
        </label>
      </div>

      {reportId && userId ? (
        <EvidencePhotoUpload
          reportId={reportId}
          section="huomiot"
          items={photoItems}
          onChange={(next) =>
            onChange({ huomiotLiitteet: photoItemsToLiitteet(next, form.huomiotLiitteet) })
          }
          userId={userId}
        />
      ) : (
        <div className="huolto-submodule">
          <p className="muted">Kuvien liittäminen vaatii tallennetun raportin.</p>
          {photoItems.length > 0 && (
            <ul className="huolto-evidence-photo-list">
              {photoItems.map((item) => (
                <li key={item.storagePath}>
                  {item.comment.trim() || <span className="muted">(ei kommenttia)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </HuoltoModuleSection>
  );
}
