import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import {
  energiatehokkuusSectionTitle,
  kiinteistoPiiriSectionTitle,
  mlpJaahdytyspiiriSectionTitle,
  mlpKeruupiiriSectionTitle,
} from '../../lib/huoltoRaportti/sectionTitles';
import type { MlpDocumentUnitId } from '../../lib/huoltoRaportti/mlpDocumentHelpers';
import { MlpEnergiaInspection } from './MlpEnergiaInspection';
import { MlpJaahdytyspiiriInspection } from './MlpJaahdytyspiiriInspection';
import { MlpKayttovesiInspection } from './MlpKayttovesiInspection';
import { MlpKeruupiiriInspection } from './MlpKeruupiiriInspection';
import { MlpLampopiiritInspection } from './MlpLampopiiritInspection';
import { MlpLatauspiiriInspection } from './MlpLatauspiiriInspection';

interface Props {
  form: HuoltoReportData;
  unitId: MlpDocumentUnitId;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

function calcPower(virtaus: string, meno: string, tulo: string, c: number): string | null {
  const v = parseFloat(virtaus) || 0;
  const m = parseFloat(meno) || 0;
  const t = parseFloat(tulo) || 0;
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return (c * v * deltaT).toFixed(2);
  return null;
}

export function MlpDocumentUnit({
  form,
  unitId,
  onChange,
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const mlp = form.mlpData;
  if (!mlp) return null;

  const patchMlp = (patch: Partial<typeof mlp>) => onChange({ mlpData: { ...mlp, ...patch } });
  const keruuPower = calcPower(mlp.keruupiiriVirtaus, mlp.keruupiiriMeno, mlp.keruupiiriTulo, parseFloat(mlp.keruupiiriNeste) || 0);
  const latausPower = calcPower(mlp.latausVirtaus, mlp.latausMeno, mlp.latausTulo, parseFloat(mlp.latausNeste) || 0);

  if (unitId === 'keruupiiri') {
    return (
      <MlpKeruupiiriInspection
        title={mlpKeruupiiriSectionTitle(form.laiteTyyppi)}
        mlp={mlp}
        onChange={patchMlp}
        keruuPower={keruuPower}
        documentUnitKey={documentUnitKey}
        hidePartRow={hidePartRow}
      />
    );
  }

  if (unitId === 'jaahdytyspiiri') {
    return (
      <MlpJaahdytyspiiriInspection
        title={mlpJaahdytyspiiriSectionTitle(form.laiteTyyppi)}
        mlp={mlp}
        onChange={patchMlp}
        documentUnitKey={documentUnitKey}
        hidePartRow={hidePartRow}
      />
    );
  }

  if (unitId === 'latauspiiri') {
    return (
      <MlpLatauspiiriInspection
        mlp={mlp}
        onChange={patchMlp}
        latausPower={latausPower}
        documentUnitKey={documentUnitKey}
        hidePartRow={hidePartRow}
      />
    );
  }

  if (unitId === 'kayttovesi') {
    return (
      <MlpKayttovesiInspection
        title="Käyttöveden lämmitys"
        mlp={mlp}
        onChange={patchMlp}
        documentUnitKey={documentUnitKey}
        hidePartRow={hidePartRow}
      />
    );
  }

  if (unitId === 'lampopiirit') {
    return (
      <MlpLampopiiritInspection
        title={kiinteistoPiiriSectionTitle(form.laiteTyyppi)}
        mlp={mlp}
        onChange={patchMlp}
        laiteTyyppi={form.laiteTyyppi}
        documentUnitKey={documentUnitKey}
        hidePartRow={hidePartRow}
      />
    );
  }

  if (unitId === 'energia') {
    return (
      <MlpEnergiaInspection
        title={energiatehokkuusSectionTitle(form.laiteTyyppi)}
        form={form}
        onChange={onChange}
        documentUnitKey={documentUnitKey}
        hidePartRow={hidePartRow}
      />
    );
  }

  return null;
}
