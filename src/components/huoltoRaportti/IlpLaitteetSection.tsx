import { useRef, useState } from 'react';
import {
  addIlpDevice,
  ilpDeviceLabel,
  ilpDevicePhotoTag,
  ilpDeviceStateLabel,
  ilpDeviceTestEnabled,
  ilpDeviceView,
  ilpDeviceViews,
  ilpDevicesCompletion,
  ilpLaitteetSummaryRows,
  ilpLisaLaitteet,
  patchIlpDevice,
  removeIlpDevice,
  setIlpDeviceTestEnabled,
  type IlpDeviceTestKey,
} from '../../lib/huoltoRaportti/ilpLaitteet';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { LampopumppuSection } from './LampopumppuSection';
import { FormCheckbox } from './FormCheckbox';
import { RefrigerantChargeDialogFields } from './RefrigerantChargeDialog';
import { TiiveyskoeFields } from './TiiveyskoeInspection';
import { TyhjiointiFields } from './TyhjiointiInspection';

type Parts = { ulkoyksikko: boolean; sisayksikko: boolean; mittaukset: boolean };

type PhotoProps = { reportId?: string | null; userId?: string };

type ListProps = PhotoProps & {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  parts: Parts;
};

const IDENTITY_FIELDS = [
  { key: 'laiteTunnus', label: 'Tunnus' },
  { key: 'laiteSijainti', label: 'Sijainti' },
  { key: 'laiteValmistaja', label: 'Valmistaja' },
  { key: 'ulkoyksikkoMalli', label: 'Ulkoyksikön malli' },
  { key: 'ulkoyksikkoSarjanumero', label: 'Sarjanumero' },
] as const;

/** Ilmalämpöpumppujen laitelista (kuten konvektorilista): yksi rivi per laite + Tarkastus-popup. */
export function IlpLaitteetSection({ form, onChange, parts, reportId, userId }: ListProps) {
  const latestRef = useRef(form);
  latestRef.current = form;
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);
  const views = ilpDeviceViews(form);

  const patchDevice = (index: number, patch: Partial<HuoltoReportData>) => {
    const next = patchIlpDevice(latestRef.current, index, patch);
    latestRef.current = { ...latestRef.current, ...next };
    onChange(next);
  };

  const commit = (patch: Partial<HuoltoReportData>) => {
    latestRef.current = { ...latestRef.current, ...patch };
    onChange(patch);
  };

  const dialogView = dialogIndex != null ? views[dialogIndex] ?? null : null;

  return (
    <div className="konvektorit-section konvektorit-section--embedded ilp-laitteet-section">
      <div className="btn-group konvektori-list-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => commit(addIlpDevice(form, views.length - 1))}>
          Kopioi laite
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => commit(addIlpDevice(form))}>
          + Lisää laite
        </button>
      </div>

      <div className="konvektori-compact-list">
        {views.map((view, index) => {
          const status = ilpDeviceStateLabel(view);
          const rowKey = index === 0 ? 'ilp-0' : ilpLisaLaitteet(form)[index - 1]?.id ?? `ilp-${index}`;
          return (
            <div key={rowKey} className="konvektori-compact-row ilp-compact-row">
              <span className="konvektori-compact-num">{index + 1}</span>
              {IDENTITY_FIELDS.map((field) => (
                <label key={field.key} className="konvektori-compact-field">
                  <span className="konvektori-compact-label">{field.label}</span>
                  <input
                    value={String(view[field.key] ?? '')}
                    onChange={(e) => patchDevice(index, { [field.key]: e.target.value })}
                    placeholder={field.label}
                  />
                </label>
              ))}
              <span className={`konvektori-compact-status ${status.className}`} title={status.text}>
                {status.text}
              </span>
              <div className="konvektori-compact-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialogIndex(index)}>
                  Tarkastus
                </button>
                {views.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (!window.confirm(`Poistetaanko laite ${ilpDeviceLabel(view, index)}?`)) return;
                      commit(removeIlpDevice(latestRef.current, index));
                    }}
                  >
                    Poista
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {dialogView && dialogIndex != null ? (
        <HuoltoInspectionDialogShell
          open
          title={`${dialogIndex + 1}. ${ilpDeviceLabel(dialogView, dialogIndex)}`}
          titleId="ilp-laite-dialog-title"
          dialogClassName="konvektori-list-dialog"
          onClose={() => setDialogIndex(null)}
        >
          <IlpLaiteFields
            view={dialogView}
            parts={parts}
            onChange={(patch) => patchDevice(dialogIndex, patch)}
          />
          <IlpLaiteTests
            view={dialogView}
            photoTag={ilpDevicePhotoTag(form, dialogIndex)}
            reportId={reportId}
            userId={userId}
            onToggle={(key, enabled) => commit(setIlpDeviceTestEnabled(latestRef.current, dialogIndex, key, enabled))}
            onPatch={(patch) => {
              const current = ilpDeviceView(latestRef.current, dialogIndex);
              patchDevice(dialogIndex, {
                ...(patch.tiiveyskoeData ? { tiiveyskoeData: { ...current.tiiveyskoeData, ...patch.tiiveyskoeData } } : {}),
                ...(patch.tyhjiointiData ? { tyhjiointiData: { ...current.tyhjiointiData, ...patch.tyhjiointiData } } : {}),
              });
            }}
          />
        </HuoltoInspectionDialogShell>
      ) : null}
    </div>
  );
}

function IlpLaiteFields({
  view,
  parts,
  onChange,
}: {
  view: HuoltoReportData;
  parts: Parts;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}) {
  return (
    <div className="ilp-laite-fields">
      {parts.ulkoyksikko ? (
        <section>
          <h3 className="ilp-laite-heading">Ulkoyksikkö</h3>
          <LampopumppuSection form={view} onChange={onChange} part="ulkoyksikko" omitUlkoyksikkoIdentity />
        </section>
      ) : null}
      {parts.sisayksikko ? (
        <section>
          <h3 className="ilp-laite-heading">Sisäyksiköt</h3>
          <LampopumppuSection form={view} onChange={onChange} part="sisayksikko" />
        </section>
      ) : null}
      {parts.mittaukset ? (
        <section>
          <h3 className="ilp-laite-heading">Mittaukset</h3>
          <LampopumppuSection form={view} onChange={onChange} part="mittaukset" />
        </section>
      ) : null}
      <section>
        <h3 className="ilp-laite-heading">Kylmäaine</h3>
        <RefrigerantChargeDialogFields form={view} onChange={onChange} />
      </section>
    </div>
  );
}

/** Laitekohtainen tiiveyskoe ja tyhjiöinti. */
function IlpLaiteTests({
  view,
  photoTag,
  reportId,
  userId,
  onToggle,
  onPatch,
}: PhotoProps & {
  view: HuoltoReportData;
  photoTag?: string;
  onToggle: (key: IlpDeviceTestKey, enabled: boolean) => void;
  onPatch: (patch: {
    tiiveyskoeData?: Partial<HuoltoReportData['tiiveyskoeData']>;
    tyhjiointiData?: Partial<HuoltoReportData['tyhjiointiData']>;
  }) => void;
}) {
  const tiiveyskoe = ilpDeviceTestEnabled(view, 'tiiveyskoe');
  const tyhjiointi = ilpDeviceTestEnabled(view, 'tyhjiointi');
  return (
    <div className="ilp-laite-fields ilp-laite-tests">
      <section>
        <div className="checkbox-grid huolto-toggle-grid">
          <FormCheckbox label="Tiiveyskoe" checked={tiiveyskoe} onChange={(v) => onToggle('tiiveyskoe', v)} />
          <FormCheckbox label="Tyhjiöinti" checked={tyhjiointi} onChange={(v) => onToggle('tyhjiointi', v)} />
        </div>
      </section>
      {tiiveyskoe ? (
        <section>
          <h3 className="ilp-laite-heading">Tiiveyskoe</h3>
          <TiiveyskoeFields
            data={view.tiiveyskoeData}
            huoltoPaivamaara={view.huoltoPaivamaara}
            onPatch={(patch) => onPatch({ tiiveyskoeData: patch })}
            reportId={reportId}
            userId={userId}
            photoTag={photoTag}
          />
        </section>
      ) : null}
      {tyhjiointi ? (
        <section>
          <h3 className="ilp-laite-heading">Tyhjiöinti</h3>
          <TyhjiointiFields
            data={view.tyhjiointiData}
            huoltoPaivamaara={view.huoltoPaivamaara}
            onPatch={(patch) => onPatch({ tyhjiointiData: patch })}
            reportId={reportId}
            userId={userId}
            photoTag={photoTag}
          />
        </section>
      ) : null}
    </div>
  );
}

type TabProps = PhotoProps & {
  form: HuoltoReportData;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  parts: Parts;
};

/** ILP-välilehti / dokumenttinäkymän laatta: yksi pöytäkirja, useita laitteita. */
export function IlpLaitteetTabSection({ form, onPatchForm, parts, reportId, userId }: TabProps) {
  const documentLayout = useMaintenanceDocumentLayout();
  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onPatchForm(next)}
      documentModuleKey={documentLayout ? 'lampopumppu' : undefined}
      title="Ilmalämpöpumput"
      titleId="ilp-laitteet-dialog-title"
      dialogClassName="konvektori-list-dialog"
      summaryRows={ilpLaitteetSummaryRows(form)}
      complete={ilpDevicesCompletion(form) === 'ok'}
      editLabel="Muokkaa laitteita"
      emptyHint="Lisää laitteet painamalla Muokkaa."
    >
      {(draft, patchDraft) => (
        <IlpLaitteetSection form={draft} onChange={patchDraft} parts={parts} reportId={reportId} userId={userId} />
      )}
    </DocumentModuleInspection>
  );
}
