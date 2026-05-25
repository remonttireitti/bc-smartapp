import type { HuoltoReportData, HuomioLuonne, HuomiotImageAttachment } from '../../lib/huoltoRaportti/types';
import { EvidencePhotoUpload } from './EvidencePhotoUpload';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string;
  userId?: string;
}

function attachmentPaths(attachments: HuomiotImageAttachment[] | undefined): string[] {
  return (attachments ?? [])
    .map((a) => a.storagePath ?? a.id)
    .filter((p) => Boolean(p && String(p).trim()));
}

function pathsToAttachments(paths: string[]): HuomiotImageAttachment[] {
  return paths.map((path) => ({
    id: path,
    url: '',
    comment: '',
    storagePath: path,
    fileName: path.split('/').pop(),
  }));
}

export function HuomiotSection({ form, onChange, reportId, userId }: Props) {
  const luonne = form.huomiotLuonne ?? 'kommentti';
  const paths = attachmentPaths(form.huomiotLiitteet);

  return (
    <HuoltoModuleSection moduleKey="huomiot" title="Huomiot">
      <div className="huolto-submodule">
        <p className="muted">Tekstin luonne</p>
        <div className="checkbox-grid">
          <label>
            <input
              type="radio"
              name="huomiotLuonne"
              checked={luonne === 'kommentti'}
              onChange={() => onChange({ huomiotLuonne: 'kommentti' as HuomioLuonne })}
            />
            Kommentti / suositus
          </label>
          <label>
            <input
              type="radio"
              name="huomiotLuonne"
              checked={luonne === 'vika'}
              onChange={() => onChange({ huomiotLuonne: 'vika' as HuomioLuonne })}
            />
            Vika (punainen tulosteissa)
          </label>
        </div>
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
          paths={paths}
          onChange={(next) => onChange({ huomiotLiitteet: pathsToAttachments(next) })}
          userId={userId}
        />
      ) : (
        <div className="huolto-submodule">
          <p className="muted">Kuvien liittäminen vaatii tallennetun raportin.</p>
          {paths.length > 0 && (
            <ul className="huolto-path-list">
              {paths.map((path) => (
                <li key={path}>{path.split('/').pop()}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </HuoltoModuleSection>
  );
}
