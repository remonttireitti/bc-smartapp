import type { HuoltoReportData, MlpData } from '../../lib/huoltoRaportti/types';
import {
  isChillerLikeDevice,
  showChillerPropertySubsections,
  showMlpKeruupiiriSubsection,
  showMlpLatauspiiriSubsection,
  showMlpMaalampoSubsections,
} from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  energiatehokkuusSectionTitle,
  kiinteistoPiiriSectionTitle,
  mlpJaahdytyspiiriSectionTitle,
  mlpKeruupiiriSectionTitle,
} from '../../lib/huoltoRaportti/sectionTitles';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { MlpKeruupiiriInspection } from './MlpKeruupiiriInspection';
import { MlpLatauspiiriInspection } from './MlpLatauspiiriInspection';
import { MlpLampopiiritInspection } from './MlpLampopiiritInspection';
import { MlpJaahdytyspiiriInspection } from './MlpJaahdytyspiiriInspection';
import { MlpKayttovesiInspection } from './MlpKayttovesiInspection';
import { MlpEnergiaInspection } from './MlpEnergiaInspection';
interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  /** VJ/VAK: näytä vain yksi osio omalla välilehdellä. */
  part?: 'kiinteisto' | 'energia';
}

function calcPower(virtaus: string, meno: string, tulo: string, c: number): string | null {
  const v = parseFloat(virtaus) || 0;
  const m = parseFloat(meno) || 0;
  const t = parseFloat(tulo) || 0;
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return (c * v * deltaT).toFixed(2);
  return null;
}

export function MlpSection({ form, onChange, part }: Props) {
  const mlp = form.mlpData;
  if (!mlp) return null;

  const patchMlp = (patch: Partial<MlpData>) => onChange({ mlpData: { ...mlp, ...patch } });

  const showMaalampoOnly = showMlpMaalampoSubsections(form.laiteTyyppi);
  const showKeruupiiri = showMlpKeruupiiriSubsection(form.laiteTyyppi);
  const showChillerParts = showChillerPropertySubsections(form.laiteTyyppi);
  const showLatauspiiri = showMlpLatauspiiriSubsection(
    form.laiteTyyppi,
    form.lauhdutinTyyppiLaite ?? form.condenserData[0]?.tyyppi,
  );
  const showHeatPumpCircuits = !isChillerLikeDevice(form.laiteTyyppi);
  const keruuPower = calcPower(mlp.keruupiiriVirtaus, mlp.keruupiiriMeno, mlp.keruupiiriTulo, parseFloat(mlp.keruupiiriNeste) || 0);
  const latausPower = calcPower(mlp.latausVirtaus, mlp.latausMeno, mlp.latausTulo, parseFloat(mlp.latausNeste) || 0);

  const showKiinteistoBlock = (showHeatPumpCircuits || showChillerParts) && (!part || part === 'kiinteisto');
  const showEnergyBlock = (showMaalampoOnly || showChillerParts) && (!part || part === 'energia');

  return (
    <>
      {showKeruupiiri && !part && (
      <HuoltoModuleSection moduleKey="mlpKeruupiiri" title={mlpKeruupiiriSectionTitle(form.laiteTyyppi)}>
        <div className="huolto-part-inspection-list">
          <MlpKeruupiiriInspection
            title={mlpKeruupiiriSectionTitle(form.laiteTyyppi)}
            mlp={mlp}
            onChange={patchMlp}
            keruuPower={keruuPower}
          />
        </div>
      </HuoltoModuleSection>
      )}

      {showMaalampoOnly && !part && (
      <HuoltoModuleSection moduleKey="mlpJaahdytyspiiri" title={mlpJaahdytyspiiriSectionTitle(form.laiteTyyppi)}>
        <div className="huolto-part-inspection-list">
          <MlpJaahdytyspiiriInspection
            title={mlpJaahdytyspiiriSectionTitle(form.laiteTyyppi)}
            mlp={mlp}
            onChange={patchMlp}
          />
        </div>
      </HuoltoModuleSection>
      )}

      {showLatauspiiri && showHeatPumpCircuits && !part && (
      <HuoltoModuleSection moduleKey="mlpLatauspiiri" title="5.2 Latauspiiri">
        <div className="huolto-part-inspection-list">
          <MlpLatauspiiriInspection mlp={mlp} onChange={patchMlp} latausPower={latausPower} />
        </div>
      </HuoltoModuleSection>
      )}

      {showHeatPumpCircuits && !part && (
      <HuoltoModuleSection moduleKey="mlpKayttovesi" title="5.3 Käyttöveden lämmitys">
        <div className="huolto-part-inspection-list">
          <MlpKayttovesiInspection title="Käyttöveden lämmitys" mlp={mlp} onChange={patchMlp} />
        </div>
      </HuoltoModuleSection>
      )}

      {showKiinteistoBlock && (
      <HuoltoModuleSection moduleKey="mlpLampopiirit" title={kiinteistoPiiriSectionTitle(form.laiteTyyppi)}>
        <div className="huolto-part-inspection-list">
          <MlpLampopiiritInspection
            title={kiinteistoPiiriSectionTitle(form.laiteTyyppi)}
            mlp={mlp}
            onChange={patchMlp}
            laiteTyyppi={form.laiteTyyppi}
          />
        </div>
      </HuoltoModuleSection>
      )}

      {showEnergyBlock && (
      <HuoltoModuleSection moduleKey="mlpEnergia" title={energiatehokkuusSectionTitle(form.laiteTyyppi)}>
        <div className="huolto-part-inspection-list">
          <MlpEnergiaInspection
            title={energiatehokkuusSectionTitle(form.laiteTyyppi)}
            form={form}
            onChange={onChange}
          />
        </div>
      </HuoltoModuleSection>
      )}
    </>
  );
}
