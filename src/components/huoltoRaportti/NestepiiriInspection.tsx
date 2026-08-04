import { useEffect, useState } from 'react';
import type { LauhdutuspiiriData, NestepiiriData } from '../../lib/huoltoRaportti/types';
import {
  lauhdutuspiiriInspectionStatus,
  nestepiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { NestepiiriFields } from './NestepiiriFields';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

type Data = NestepiiriData | LauhdutuspiiriData;

interface Props<T extends Data> {
  title: string;
  data: T;
  onChange: (patch: Partial<T>) => void;
  showLauhdutinTarkistukset?: boolean;
  showPiiriTarkistukset?: boolean;
}

export function NestepiiriInspection<T extends Data>({
  title,
  data,
  onChange,
  showLauhdutinTarkistukset,
  showPiiriTarkistukset,
}: Props<T>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const status = showLauhdutinTarkistukset
    ? lauhdutuspiiriInspectionStatus(data as LauhdutuspiiriData)
    : nestepiiriInspectionStatus(data);

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus =
    normalizeHuoltoInspectionStatus(draft.tarkastusTila) ??
    (showLauhdutinTarkistukset
      ? lauhdutuspiiriInspectionStatus(draft as LauhdutuspiiriData)
      : nestepiiriInspectionStatus(draft));
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';

  return (
    <>
      <HuoltoPartInspectionRow title={title} status={status} onInspect={() => setDialogOpen(true)} />

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nestepiiri-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="nestepiiri-dialog-title">{title}</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name="nestepiiri-tila"
                value={draftStatus}
                onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
                  setDraft((prev) => ({ ...prev, tarkastusTila: next }))
                }
              />
            </div>

            {showDetails ? (
              <NestepiiriFields
                data={draft}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
                showLauhdutinTarkistukset={showLauhdutinTarkistukset}
                showPiiriTarkistukset={showPiiriTarkistukset}
              />
            ) : null}

            {draftStatus === 'faulty' ? (
              <label className="konvektori-huomio-field">
                <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                <textarea
                  rows={3}
                  value={draft.tarkastusHuomio ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
                />
              </label>
            ) : null}

            <div className="leave-draft-actions konvektori-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>
                Peruuta
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={draftStatus === null}
                onClick={() => {
                  onChange(draft);
                  setDialogOpen(false);
                }}
              >
                Tallenna
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
