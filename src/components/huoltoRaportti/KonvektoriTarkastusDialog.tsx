import { useCallback, useEffect, useState } from 'react';
import type { HuomioLuonne, KonvektoriRowData } from '../../lib/huoltoRaportti/types';
import {
  KONVEKTORI_TARKASTUS_ITEMS,
  type KonvektoriTarkastusField,
} from '../../lib/huoltoRaportti/konvektoriTarkastus';
import { KONVEKTORI_JAAHDYTYSNESTE_OPTIONS } from '../../lib/huoltoRaportti/konvektoriTypes';
import { getKonvektoriCalculationLines } from '../../lib/huoltoRaportti/konvektoriTeho';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { RichCommentEditor } from './RichCommentEditor';

interface Props {
  open: boolean;
  row: KonvektoriRowData;
  rowLabel: string;
  onClose: () => void;
  onSave: (row: KonvektoriRowData) => void;
}

function YesNoToggle({
  value,
  onChange,
  name,
}: {
  value: boolean | null;
  onChange: (next: boolean) => void;
  name: string;
}) {
  return (
    <div className="konvektori-yesno" role="group" aria-label={name}>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === true ? ' konvektori-yesno-btn--active konvektori-yesno-btn--yes' : ''}`}
        aria-pressed={value === true}
        onClick={() => onChange(true)}
      >
        Kyllä
      </button>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === false ? ' konvektori-yesno-btn--active konvektori-yesno-btn--no' : ''}`}
        aria-pressed={value === false}
        onClick={() => onChange(false)}
      >
        Ei
      </button>
    </div>
  );
}

export function KonvektoriTarkastusDialog({ open, row, rowLabel, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(row);

  useEffect(() => {
    if (open) setDraft(row);
  }, [open, row]);

  const handleClose = useCallback(() => {
    onSave(draft);
    onClose();
  }, [draft, onClose, onSave]);

  const patchCheck = (field: KonvektoriTarkastusField, value: boolean) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const calcLines = getKonvektoriCalculationLines(draft);
  const ilmaLaskenta = draft.ilmaTehoMittaus === 'laskenta';

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title={`Tarkastus: ${rowLabel}`}
      titleId="konvektori-tarkastus-title"
      onClose={handleClose}
    >
      <p className="muted konvektori-dialog-help">
        Täytä mittaukset ja vastaa jokaiseen kohtaan Kyllä tai Ei.
      </p>

      <div className="konvektori-mittaukset">
        <h3 className="konvektori-mittaukset-title">Mittaukset</h3>
        <div className="konvektori-mittaukset-grid">
          <label className="konvektori-mittaus-field">
            Jäähdytysneste
            <select
              value={draft.jaahdytysNeste ?? ''}
              onChange={(e) => setDraft((prev) => ({
                ...prev,
                jaahdytysNeste: e.target.value,
                jaahdytysNesteMuu: e.target.value === 'muu' ? prev.jaahdytysNesteMuu : '',
              }))}
            >
              {KONVEKTORI_JAAHDYTYSNESTE_OPTIONS.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {draft.jaahdytysNeste === 'muu' && (
            <label className="konvektori-mittaus-field">
              Neste (muu)
              <input
                type="text"
                value={draft.jaahdytysNesteMuu ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, jaahdytysNesteMuu: e.target.value }))}
                placeholder="Kirjoita neste"
              />
            </label>
          )}
          <label className="konvektori-mittaus-field">
            Vesivirtaus l/s
            <input
              type="text"
              inputMode="decimal"
              value={draft.virtausLs ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, virtausLs: e.target.value }))}
              placeholder="esim. 0,8"
            />
          </label>
          <label className="konvektori-mittaus-field">
            Huone °C (imuilma)
            <input
              type="text"
              inputMode="decimal"
              value={draft.huoneLampotila ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, huoneLampotila: e.target.value }))}
              placeholder="esim. 24"
            />
          </label>
          {ilmaLaskenta && (
            <label className="konvektori-mittaus-field">
              Imu-RH %
              <input
                type="text"
                inputMode="decimal"
                value={draft.huoneKosteusRh ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, huoneKosteusRh: e.target.value }))}
                placeholder="esim. 45"
              />
            </label>
          )}
          <label className="konvektori-mittaus-field">
            Tulo °C
            <input
              type="text"
              inputMode="decimal"
              value={draft.tuloLampotila ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, tuloLampotila: e.target.value }))}
              placeholder="esim. 7"
            />
          </label>
          <label className="konvektori-mittaus-field">
            Meno °C
            <input
              type="text"
              inputMode="decimal"
              value={draft.menoLampotila ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, menoLampotila: e.target.value }))}
              placeholder="esim. 12"
            />
          </label>
          <label className="konvektori-mittaus-field">
            Ilmavirtaus m³/h
            <input
              type="text"
              inputMode="decimal"
              value={draft.ilmanVirtausM3h ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, ilmanVirtausM3h: e.target.value }))}
              placeholder="esim. 120"
            />
          </label>
          <label className="konvektori-mittaus-field">
            Puhallus °C
            <input
              type="text"
              inputMode="decimal"
              value={draft.puhallusLampotila ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, puhallusLampotila: e.target.value }))}
              placeholder="esim. 16"
            />
          </label>
          {ilmaLaskenta && (
            <label className="konvektori-mittaus-field">
              Puhallus-RH %
              <input
                type="text"
                inputMode="decimal"
                value={draft.puhallusKosteusRh ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, puhallusKosteusRh: e.target.value }))}
                placeholder="esim. 90"
              />
            </label>
          )}
          <label className="konvektori-mittaus-field">
            Ilman teho
            <select
              value={draft.ilmaTehoMittaus === 'laskenta' ? 'laskenta' : 'mittari'}
              onChange={(e) => setDraft((prev) => ({
                ...prev,
                ilmaTehoMittaus: e.target.value === 'laskenta' ? 'laskenta' : 'mittari',
              }))}
            >
              <option value="mittari">Mittarista (entalpia)</option>
              <option value="laskenta">Sovellus laskee (T + RH)</option>
            </select>
          </label>
          {!ilmaLaskenta && (
          <label className="konvektori-mittaus-field">
            Mitattu teho
            <input
              type="text"
              inputMode="decimal"
              value={draft.mitattuTeho ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, mitattuTeho: e.target.value }))}
              placeholder="esim. 1,2 kW"
            />
          </label>
          )}
          {ilmaLaskenta && (
          <label className="konvektori-mittaus-field">
            Mittari (vertailu, valinnainen)
            <input
              type="text"
              inputMode="decimal"
              value={draft.mitattuTeho ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, mitattuTeho: e.target.value }))}
              placeholder="esim. 1,4 kW"
            />
          </label>
          )}
        </div>
        {calcLines.length > 0 ? (
          <div className="konvektori-laskettu-teho-list">
            {calcLines.map((line) => (
              <p key={line} className="konvektori-laskettu-teho">{line}</p>
            ))}
          </div>
        ) : null}
        <p className="muted konvektori-mittaukset-hint">
          {ilmaLaskenta
            ? 'T+RH-tila: syötä imu- ja puhalluslämpötila, RH % ja ilmavirtaus — sovellus laskee kokonais-, näyttöhyöty- ja latenttitehon. Mittari-kenttä on valinnainen vertailuun. Vaatii paluu- ja menoveden lämpötilat.'
            : 'Mittari-tila: syötä mitattu kokonaisteho. Vesi/ilma-rivit ovat näyttöhyötyä (ΔT). Latentti erotetaan eroksi. Virtaus arvioidaan näyttöhyödystä. Vaatii Tulo + Meno °C.'}
        </p>
      </div>

      <div className="konvektori-tarkastus-list">
        {KONVEKTORI_TARKASTUS_ITEMS.map((item) => (
          <div key={item.field} className="konvektori-tarkastus-item">
            <span className="konvektori-tarkastus-label">{item.label}</span>
            <YesNoToggle
              name={item.label}
              value={
                draft[item.field] === true || draft[item.field] === false
                  ? (draft[item.field] as boolean)
                  : null
              }
              onChange={(value) => patchCheck(item.field, value)}
            />
          </div>
        ))}
      </div>

      <div className="konvektori-huomio-type">
        <span className="konvektori-tarkastus-label">Huomion tyyppi</span>
        <div className="konvektori-huomio-type-toggle" role="group" aria-label="Huomion tyyppi">
          <button
            type="button"
            className={`konvektori-huomio-type-btn${draft.huomioTyyppi !== 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
            aria-pressed={draft.huomioTyyppi !== 'vika'}
            onClick={() => setDraft((prev) => ({ ...prev, huomioTyyppi: 'kommentti' satisfies HuomioLuonne }))}
          >
            Kommentti
          </button>
          <button
            type="button"
            className={`konvektori-huomio-type-btn konvektori-huomio-type-btn--vika${draft.huomioTyyppi === 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
            aria-pressed={draft.huomioTyyppi === 'vika'}
            onClick={() => setDraft((prev) => ({ ...prev, huomioTyyppi: 'vika' satisfies HuomioLuonne }))}
          >
            Vika (punainen)
          </button>
        </div>
      </div>

      <label className="konvektori-huomio-field">
        Kommentti / huomio
        <RichCommentEditor
          rows={4}
          value={draft.huomio}
          onChange={(huomio) => setDraft((prev) => ({ ...prev, huomio }))}
          placeholder="Kirjoita huomio tähän…"
        />
      </label>
    </HuoltoInspectionDialogShell>
  );
}
