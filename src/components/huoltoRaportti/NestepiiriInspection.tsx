import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import {
  lauhdutuspiiriSummaryRows,
  moduleSummaryComplete,
  nestepiiriSummaryRows,
} from '../../lib/huoltoRaportti/moduleSummaryRows';
import { useHuoltoInspectionDialog, HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import type { LauhdutuspiiriData, NestepiiriData } from '../../lib/huoltoRaportti/types';
import {
  lauhdutuspiiriInspectionStatus,
  nestepiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { HuoltoModuleSummaryPanel } from './HuoltoModuleSummaryPanel';
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
  /** Dokumenttinäkymä: rekisteröi moduulin popup avattavaksi otsikosta. */
  documentModuleKey?: string;
}

export function NestepiiriInspection<T extends Data>({
  title,
  data,
  onChange,
  showLauhdutinTarkistukset,
  showPiiriTarkistukset,
  documentModuleKey,
}: Props<T>) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;

  const status = showLauhdutinTarkistukset
    ? lauhdutuspiiriInspectionStatus(data as LauhdutuspiiriData)
    : nestepiiriInspectionStatus(data);

  const applyDraft = (next: T) => onChange(next);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange: applyDraft,
    canSave: (next) => {
      const nextStatus =
        normalizeHuoltoInspectionStatus(next.tarkastusTila) ??
        (showLauhdutinTarkistukset
          ? lauhdutuspiiriInspectionStatus(next as LauhdutuspiiriData)
          : nestepiiriInspectionStatus(next));
      return nextStatus !== null;
    },
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const resolvedStatus =
    normalizeHuoltoInspectionStatus(data.tarkastusTila) ?? status;
  const summaryRows = showLauhdutinTarkistukset
    ? lauhdutuspiiriSummaryRows(data as LauhdutuspiiriData)
    : nestepiiriSummaryRows(data);

  const draftStatus =
    normalizeHuoltoInspectionStatus(draft.tarkastusTila) ??
    (showLauhdutinTarkistukset
      ? lauhdutuspiiriInspectionStatus(draft as LauhdutuspiiriData)
      : nestepiiriInspectionStatus(draft));
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';

  return (
    <>
      {hideLauncher ? (
        <HuoltoModuleSummaryPanel
          rows={summaryRows}
          complete={moduleSummaryComplete(resolvedStatus)}
          onEdit={openDialog}
          editLabel={`Muokkaa ${title.toLowerCase()}`}
        />
      ) : (
        <HuoltoPartInspectionRow title={title} status={status} onInspect={openDialog} />
      )}

      <HuoltoInspectionDialogShell open={open} title={title} onClose={closeDialog}>
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
      </HuoltoInspectionDialogShell>
    </>
  );
}
