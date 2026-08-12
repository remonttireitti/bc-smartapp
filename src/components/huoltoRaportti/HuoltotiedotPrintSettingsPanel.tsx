import ToggleSwitch from '../ToggleSwitch';
import { showHuoltoVsKayttoonottoSelector } from '../../lib/huoltoRaportti/constants';
import { usesRefrigerantServiceExtras } from '../../lib/huoltoRaportti/deviceModuleLogic';
import { hideMaintenancePrintWarnings } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';

type Props = {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  onPersist?: () => void;
};

export function HuoltotiedotPrintSettingsPanel({ form, onChange, onPersist }: Props) {
  return (
    <div className="maintenance-section-settings-panel">
      {showHuoltoVsKayttoonottoSelector(form.laiteTyyppi) ? (
        <label className="maintenance-section-settings-field">
          Raportin tyyppi
          <select
            value={form.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto'}
            onChange={(e) =>
              onChange({
                huoltoReportDocumentKind: e.target.value as HuoltoReportData['huoltoReportDocumentKind'],
              })
            }
          >
            <option value="huolto">Huolto</option>
            <option value="kayttoonotto">Käyttöönotto</option>
          </select>
        </label>
      ) : null}

      <div className="toggle-grid">
        <ToggleSwitch
          label="Huolto suoritettu"
          checked={form.huoltoSuoritettu}
          onChange={(checked) => onChange({ huoltoSuoritettu: checked })}
        />
        {usesRefrigerantServiceExtras(form.laiteTyyppi) ? (
          <>
            <ToggleSwitch
              label="Kylmäaine / vuototarkastus"
              checked={form.huoltoKylmaaineVuotoTarkastus}
              onChange={(checked) => onChange({ huoltoKylmaaineVuotoTarkastus: checked })}
            />
            <ToggleSwitch
              label="Piilota varoitukset tulosteessa (HUOMIOITAVAA, COP-ohjeet)"
              checked={hideMaintenancePrintWarnings(form)}
              onChange={(checked) => {
                onChange({ piilotaVaroitukset: checked });
                onPersist?.();
              }}
            />
          </>
        ) : null}
        <ToggleSwitch
          label="Laitteessa vika / puutteita"
          checked={form.huoltoLaiteessaVika}
          onChange={(checked) => onChange({ huoltoLaiteessaVika: checked })}
        />
      </div>
    </div>
  );
}
