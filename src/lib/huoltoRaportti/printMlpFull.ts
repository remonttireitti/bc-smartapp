import type {
  CompressorData,
  HeatingCircuitData,
  HeatingElementData,
  HuoltoReportData,
  MlpData,
  RefrigerantCircuitData,
} from './types';
import { getCompressorVaiheValinta, getKokoLaiteSahkoVaiheValinta, getMlpPumpSyottoValinta } from './sahkoVaiheUtils';
import { getSpecificHeatCapacity, renderCheckbox } from './utils';
import { hasPrintableValue, normalizePrintText, pumpSupplyHtmlBlock } from './printPhaseHelpers';
import { isChillerLikeDevice } from './deviceModuleLogic';

function kiinteistoPiiritPrintSectionHtml(m: MlpData, laiteTyyppi: string): string {
  if (!m.lampoPiirit?.length) return '';

  let section = `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">${laiteTyyppi === 'Vedenjäähdytyskone' ? '5.4 KIINTEISTÖN JÄÄHDYTYSPIIRI' : '5.4 LÄMMITYSPIIRIT'}</strong>
    </div>`;

  m.lampoPiirit.forEach((piiri: HeatingCircuitData & { nimi?: string }, index: number) => {
    const virtausLS = parseFloat(piiri.virtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(piiri.meno) || 0;
    const tulo = parseFloat(piiri.tulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(piiri.neste);
    const power = virtausLS > 0 && deltaT > 0 && c > 0 ? c * virtausLS * deltaT : 0;
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    const missingFields: string[] = [];
    if (!hasPrintableValue(piiri.virtaus)) missingFields.push('virtaus');
    if (!hasPrintableValue(piiri.meno)) missingFields.push('menolämpötila');
    if (!hasPrintableValue(piiri.tulo)) missingFields.push('paluu-/tulolämpötila');
    if (!hasPrintableValue(piiri.neste)) missingFields.push('neste');

    section += `
    <div style="padding: 10px; background: #fafafa; border-radius: 4px; border: 1px solid #e0e0e0; margin-bottom: 8px;">
      <div style="font-size: 12px; font-weight: bold; color: #7B1FA2; margin-bottom: 6px;">Piiri ${index + 1}: ${piiri.nimi || '-'}</div>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; font-size: 11px; margin-bottom: 6px;">
        <div>
          <div style="color: #666; margin-bottom: 2px;">Virtaus</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)} m³/h</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Meno</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${piiri.meno || '-'} °C</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Paluu</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${piiri.tulo || '-'} °C</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Neste</div>
          <div style="padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">${piiri.neste || '-'} kW/(l/s·K)</div>
        </div>
        <div>
          <div style="color: #666; margin-bottom: 2px;">Teho</div>
          <div style="padding: 4px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${power.toFixed(2)} kW</div>
        </div>
      </div>
      <div style="font-size: 10px; color: #666;">Kaava: ${formula}</div>
      ${
        power === 0
          ? `<div style="margin-top: 6px; font-size: 10px; color: #666; background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px; padding: 6px;">
        <strong>Ei tarpeeksi dataa laskentaan.</strong>
        ${
          missingFields.length > 0
            ? `Puuttuu: ${missingFields.join(', ')}.`
            : 'Tarkista, että virtaus ja lämpötilaero (delta-T) ovat > 0.'
        }
      </div>`
          : ''
      }
      ${
        piiri.pumppuTarkastettu &&
        (hasPrintableValue(piiri.pumppuValmistaja) ||
          hasPrintableValue(piiri.pumppuMalli) ||
          hasPrintableValue(piiri.pumppuTyyppi))
          ? `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px; margin-bottom: 8px;">
        ${
          hasPrintableValue(piiri.pumppuValmistaja)
            ? `<div><div style="color:#666;">Pumpun valmistaja</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(piiri.pumppuValmistaja)}</div></div>`
            : ''
        }
        ${
          hasPrintableValue(piiri.pumppuMalli)
            ? `<div><div style="color:#666;">Pumpun malli</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(piiri.pumppuMalli)}</div></div>`
            : ''
        }
        ${
          !hasPrintableValue(piiri.pumppuValmistaja) &&
          !hasPrintableValue(piiri.pumppuMalli) &&
          hasPrintableValue(piiri.pumppuTyyppi)
            ? `<div style="grid-column:1/-1;"><div style="color:#666;">Pumpun tyyppi (vanha)</div><div style="padding:4px;background:#fff;border:1px solid #ddd;border-radius:4px;">${normalizePrintText(piiri.pumppuTyyppi)}</div></div>`
            : ''
        }
      </div>`
          : ''
      }
      ${piiri.pumppuTarkastettu ? pumpSupplyHtmlBlock(
        piiri.pumppuSyottoValinta,
        piiri.pumppuKolmeVaihetta,
        piiri.pumppuVirta1vaihe || '',
        piiri.pumppuVirtaL1 || '',
        piiri.pumppuVirtaL2 || '',
        piiri.pumppuVirtaL3 || ''
      ) : ''}
    </div>`;
  });

  section += `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.lampoToimilaitteetOK, 'Toimilaitteet kunnossa')}</div>
    <div>${renderCheckbox(m.lampoAutomaattinenIlmausTarkistettu, 'Automaattinen ilmaus tarkistettu')}</div>
    <div>${renderCheckbox(m.lampoMutapussiPuhdistettu, 'Mutasihi puhdistettu')}</div>
    </div>
  </div>`;
  return section;
}

function generateMLPPrintHtml(
  m: MlpData,
  kp1Data: RefrigerantCircuitData,
  laiteTyyppi: string,
  _hasAirCondenserSelected: boolean = false,
): string {
  const includeKiinteistoPiirit = m.kiinteistoPiiritSisallytetaan !== false;
  const showLauhdutuspiiri = true;
  const getNestekiertoMissingLine = (
    label: string,
    virtaus: unknown,
    meno: unknown,
    tulo: unknown,
    neste: unknown
  ): string | null => {
    const missing: string[] = [];
    if (!hasPrintableValue(virtaus)) missing.push('virtaus');
    if (!hasPrintableValue(meno)) missing.push('menolämpötila');
    if (!hasPrintableValue(tulo)) missing.push('paluu-/tulolämpötila');
    if (!hasPrintableValue(neste)) missing.push('neste');
    if (missing.length > 0) return `${label}: puuttuu ${missing.join(', ')}.`;
    const virtausNum = parseFloat(String(virtaus ?? '')) || 0;
    const menoNum = parseFloat(String(meno ?? '')) || 0;
    const tuloNum = parseFloat(String(tulo ?? '')) || 0;
    const deltaT = Math.abs(menoNum - tuloNum);
    if (virtausNum <= 0 || deltaT <= 0) return `${label}: tarkista että virtaus ja delta-T ovat > 0.`;
    return null;
  };
  // === MLP (MAALÄMPÖPUMPPU) CALCULATIONS ===
  // Lasketaan energiatehokkuus
  const keruupiiriPower = (() => {
    const virtaus = parseFloat(m.keruupiiriVirtaus) || 0;
    const meno = parseFloat(m.keruupiiriMeno) || 0;
    const tulo = parseFloat(m.keruupiiriTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.keruupiiriNeste);
    // Virtaus on l/s, ei jaeta 60:llä
    return virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0;
  })();
  
  const kompressoriPowerResult = (() => {
    if (m.mittaaKokoLaiteSahko) {
      const kv = getKokoLaiteSahkoVaiheValinta(m);
      if (kv === '3' && m.kokoLaiteVirtaL1 && m.kokoLaiteVirtaL2 && m.kokoLaiteVirtaL3) {
        const l1 = parseFloat(m.kokoLaiteVirtaL1) || 0;
        const l2 = parseFloat(m.kokoLaiteVirtaL2) || 0;
        const l3 = parseFloat(m.kokoLaiteVirtaL3) || 0;
        const avgVirta = (l1 + l2 + l3) / 3;
        return { value: 0.591 * avgVirta, hasEnoughData: true };
      }
      if (kv === '1' && m.kokoLaiteVirta1vaihe) {
        const virta = parseFloat(m.kokoLaiteVirta1vaihe) || 0;
        return { value: 0.23 * virta, hasEnoughData: true };
      }
      return { value: 0, hasEnoughData: false };
    }
    const compCount = parseInt(String(kp1Data.kompressorienMaara ?? '')) || 1;
    let totalPower = 0;
    for (let i = 1; i <= compCount; i++) {
      const compKey = `kompressori${i}` as keyof RefrigerantCircuitData;
      const compRaw = kp1Data[compKey];
      if (!compRaw || typeof compRaw !== 'object') return { value: 0, hasEnoughData: false };
      const comp = compRaw as Partial<CompressorData>;
      const cv = getCompressorVaiheValinta(comp);
      if (cv === '1') {
        if (!hasPrintableValue(comp.virta1vaihe)) return { value: 0, hasEnoughData: false };
        const virta = parseFloat(String(comp.virta1vaihe ?? '')) || 0;
        totalPower += 0.23 * virta;
        continue;
      }
      if (cv === '3') {
        if (!hasPrintableValue(comp.virtaL1) || !hasPrintableValue(comp.virtaL2) || !hasPrintableValue(comp.virtaL3)) {
          return { value: 0, hasEnoughData: false };
        }
        const l1 = parseFloat(String(comp.virtaL1 ?? '')) || 0;
        const l2 = parseFloat(String(comp.virtaL2 ?? '')) || 0;
        const l3 = parseFloat(String(comp.virtaL3 ?? '')) || 0;
        totalPower += 0.591 * ((l1 + l2 + l3) / 3);
        continue;
      }
      return { value: 0, hasEnoughData: false };
    }
    return { value: totalPower, hasEnoughData: totalPower > 0 };
  })();
  const kompressoriPower = kompressoriPowerResult.value;
  
  const tulistuspiiriPower = (() => {
    const virtaus = parseFloat(m.latausTulistusVirtaus) || 0;
    const meno = parseFloat(m.latausTulistusMeno) || 0;
    const tulo = parseFloat(m.latausTulistusTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausTulistusNeste);
    // Virtaus on l/s, ei jaeta 60:llä
    return virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0;
  })();
  
  const latauspiiriPower = (() => {
    const virtaus = parseFloat(m.latausVirtaus) || 0;
    const meno = parseFloat(m.latausMeno) || 0;
    const tulo = parseFloat(m.latausTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausNeste);
    // Virtaus on l/s, ei jaeta 60:llä
    return virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0;
  })();
  
  const hasLatausForCop = getNestekiertoMissingLine('Latauspiiri', m.latausVirtaus, m.latausMeno, m.latausTulo, m.latausNeste) === null;
  const hasTulistusForCop = !m.latausTulistuspiiri
    || getNestekiertoMissingLine('Lauhdutus-/tulistuspiiri', m.latausTulistusVirtaus, m.latausTulistusMeno, m.latausTulistusTulo, m.latausTulistusNeste) === null;
  const hasEnoughOutputForCop = hasLatausForCop && hasTulistusForCop;
  const deviceOutputPower = tulistuspiiriPower + latauspiiriPower;
  const lampoPiiritPower = includeKiinteistoPiirit
    ? m.lampoPiirit.reduce((sum: number, piiri: HeatingCircuitData) => {
        const virtaus = parseFloat(piiri.virtaus) || 0;
        const meno = parseFloat(piiri.meno) || 0;
        const tulo = parseFloat(piiri.tulo) || 0;
        const deltaT = Math.abs(meno - tulo);
        const c = getSpecificHeatCapacity(piiri.neste);
        // Virtaus on l/s, ei jaeta 60:llä
        return sum + (virtaus > 0 && deltaT > 0 && c > 0 ? c * virtaus * deltaT : 0);
      }, 0)
    : 0;
  
  const canCalculateCop = kompressoriPowerResult.hasEnoughData && hasEnoughOutputForCop && kompressoriPower > 0 && deviceOutputPower > 0;
  const cop = canCalculateCop ? deviceOutputPower / kompressoriPower : 0;

  // Pre-compute COP-based colors to avoid nested ternaries in template literals
  const copBgColor = cop >= 4 ? '#e8f5e9' : cop >= 3 ? '#fffde7' : cop >= 2 ? '#fff3e0' : '#ffebee';
  const copBorderColor = cop >= 4 ? '#4caf50' : cop >= 3 ? '#ffc107' : cop >= 2 ? '#ff9800' : '#f44336';
  const copTextColor = cop >= 4 ? '#2e7d32' : cop >= 3 ? '#f9a825' : cop >= 2 ? '#e65100' : '#c62828';
  const copEfficiencyLabel = cop >= 4 ? 'Erinomainen' : cop >= 3 ? 'Hyvä' : cop >= 2 ? 'Tyydyttävä' : cop > 0 ? 'Heikko' : 'Ei voida laskea';

  // Maaperästä saatava energia = TUOTANTO - Sähkösyöte
  // Tämä on energiatasapainon mukainen laskenta: Q_maaperä = Q_tuotanto - Q_sähkö
  const maaperastaEnergy = deviceOutputPower > 0 && kompressoriPower > 0 ? deviceOutputPower - kompressoriPower : keruupiiriPower;
  const totalEnergyInput = maaperastaEnergy + kompressoriPower;
  void totalEnergyInput;
  
  // Varoitukset ja parannusehdotukset
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Tarkista onko tulistuspiirin mittaukset syötetty
  const tulistuspiiriPuuttuu = m.latausTulistuspiiri && tulistuspiiriPower === 0;
  if (tulistuspiiriPuuttuu) {
    warnings.push('Tulistuspiirin mittauksia ei ole syötetty - energiatase ei ole täydellinen');
    suggestions.push('Syötä tulistuspiirin virtaus ja lämpötilat täydellisen energiataseen saavuttamiseksi');
    suggestions.push('Tulistuspiiri edustaa tyypillisesti 5-15% kokonaislämmitystehosta');
  }
  
  // Tarkista energiataseen johdonmukaisuus
  if (deviceOutputPower > 0 && maaperastaEnergy < 0) {
    warnings.push('Energiatase negatiivinen - sähkönkulutus ylittää tuotannon, tarkista mittaukset');
  }
  
  // Tarkista onko keruupiirin teho realistinen suhteessa tuotantoon
  if (deviceOutputPower > 0 && maaperastaEnergy > 0) {
    const maaperanOsuus = (maaperastaEnergy / deviceOutputPower) * 100;
    if (maaperanOsuus > 90) {
      warnings.push(`Maaperän osuus energiatuotannosta erittäin korkea (${maaperanOsuus.toFixed(0)}%) - tarkista mittaukset`);
    } else if (maaperanOsuus < 50 && deviceOutputPower > 10) {
      warnings.push(`Maaperän osuus energiatuotannosta matala (${maaperanOsuus.toFixed(0)}%), voi olla normaalia matalilla lämpötiloilla`);
    }
  }
  
  // Tarkista onko laskennallinen maaperäenergia merkittävästi eri kuin mitattu keruupiirin teho
  // Tämä voi indikoida tulistuspiirin puuttumista tai mittausvirheitä
  if (keruupiiriPower > 0 && deviceOutputPower > kompressoriPower) {
    const erotus = Math.abs(keruupiiriPower - maaperastaEnergy);
    const suhteellinenErotus = erotus / keruupiiriPower;
    if (suhteellinenErotus > 0.3 && tulistuspiiriPower === 0) {
      const tulistuksenOsus = (deviceOutputPower > 0) ? ((tulistuspiiriPower / deviceOutputPower) * 100) : 0;
      if (tulistuksenOsus === 0 && m.latausTulistuspiiri) {
        suggestions.push(`Laskennallinen ja mitattu keruupiirin teho eroavat merkittävästi (${(suhteellinenErotus * 100).toFixed(0)}%)`);
        suggestions.push(`Ero voi johtua puuttuvasta tulistuspiirin mittauksesta (tyypillisesti 5-15% tuotannosta)`);
      }
    }
  }
  
  // Tarkista onko COP fysikaalisesti realistinen maalämpöpumpulle
  if (cop > 0) {
    // Maalämpöpumpun tyypillinen COP on 3-5, poikkeuksellisesti 2-6
    if (cop > 6) {
      warnings.push(`COP erittäin korkea (${cop.toFixed(2)}) - varmista mittausten oikeellisuus`);
    }
    // Erittäin matala COP voi indikoida vikaa tai epänormaaleja olosuhteita
    if (cop < 2 && deviceOutputPower > 5) {
      warnings.push(`COP matala (${cop.toFixed(2)}) - tarkista kylmäaineen määrä ja lauhduttimen toiminta`);
    }
  }
  
  // Tarkista onko sähköteho syötetty mutta ei mittauksia tuotannosta
  if (kompressoriPower > 0 && deviceOutputPower === 0) {
    warnings.push('Sähkönkulutus syötetty mutta ei tuotantotehoa - tarkista lämpötila- ja virtausmittaukset');
  }
  
  // Tarkista onko virtausmittaus syötetty mutta teho ei laskeudu
  const virtausMuttaEiTehoa = (parseFloat(m.keruupiiriVirtaus) || 0) > 0 && keruupiiriPower === 0;
  if (virtausMuttaEiTehoa) {
    warnings.push('Keruupiirin virtaus syötetty mutta tehoa ei voida laskea - tarkista lämpötilat ja nesteen valinta');
  }
  
  if (keruupiiriPower > 0) {
    const keruuDeltaT = Math.abs(parseFloat(m.keruupiiriMeno) - parseFloat(m.keruupiiriTulo)) || 0;
    if (keruuDeltaT > 5) {
      warnings.push('Keruupiirin lämpötilaero on suuri (>5°C), voi indikoida riittämätöntä virtausta');
      suggestions.push('Tarkista keruupiirin pumpun toiminta ja virtaus');
    }
    if (keruuDeltaT < 2 && keruupiiriPower > 5) {
      warnings.push('Keruupiirin lämpötilaero on pieni (<2°C) suurella teholla');
    }
  }
  
  if (latauspiiriPower > 0) {
    const latausDeltaT = Math.abs(parseFloat(m.latausMeno) - parseFloat(m.latausTulo)) || 0;
    if (latausDeltaT > 10) {
      warnings.push('Latauspiirin lämpötilaero on suuri (>10°C)');
      suggestions.push('Voit optimoida virtausta parantamaan lämmönsiirtoa');
    }
  }
  
  if (cop > 0 && cop < 2.5) {
    warnings.push(`COP on alhainen (${cop.toFixed(2)}), normaali maalämpöpumppu tulisi olla > 3`);
    suggestions.push('Tarkista kylmäaineen määrä ja paineet');
    suggestions.push('Tarkista lauhduttimen ja höyrystimen toiminta');
  } else if (cop > 5) {
    warnings.push(`COP on erittäin korkea (${cop.toFixed(2)}), varmista mittauksien oikeellisuus`);
  }
  
  if (kp1Data.kompressori1.virtaL1 && kp1Data.kompressori1.virtaL2 && kp1Data.kompressori1.virtaL3) {
    const l1 = parseFloat(kp1Data.kompressori1.virtaL1) || 0;
    const l2 = parseFloat(kp1Data.kompressori1.virtaL2) || 0;
    const l3 = parseFloat(kp1Data.kompressori1.virtaL3) || 0;
    const avg = (l1 + l2 + l3) / 3;
    const deviations = [Math.abs(l1 - avg), Math.abs(l2 - avg), Math.abs(l3 - avg)];
    const maxDev = Math.max(...deviations);
    const imbalance = avg > 0 ? (maxDev / avg) * 100 : 0;
    if (imbalance > 10) {
      warnings.push(`Vaihe-epätasapaino ${imbalance.toFixed(1)}% - vaarallinen moottorille!`);
      suggestions.push('Tarkista jännitteet ja liitokset');
    } else if (imbalance > 5) {
      warnings.push(`Vaihe-epätasapaino ${imbalance.toFixed(1)}%`);
    }
  }
  
  if (deviceOutputPower > 20 && kompressoriPower < 3) {
    warnings.push('Tehokkuus vaikuttaa epärealistisen hyvältä, tarkista mittaukset');
  }
  
  if (keruupiiriPower > 5 && parseFloat(m.keruupiiriVirtaus) < 0.5) {
    suggestions.push('Keruupiirin virtaus voi olla riittämätön, tarkista pumpun säätö');
  }
  
  let mlpHtml = '';
  
  // Keruupiiri - form style
  if (m.keruupiirinPaineTarkastettu || m.keruupiiriPaineBar || m.keruupiirissaMutapussiPuhdistettu || 
      m.keruupiirinPumppuTarkastettu || m.keruupiirinEristeetKunnossa || m.keruupiirissaAutomaattinenIlmausTarkistettu ||
      m.keruupiiriVirtaus || m.keruupiiriMeno || m.keruupiiriTulo || m.keruupiiriNeste || m.keruupiirinPumpunTyyppi ||
      m.keruupiiriPumpunValmistaja || m.keruupiiriPumpunMalli || 
      getMlpPumpSyottoValinta(m.keruupiiriPumpunSyottoValinta, m.keruupiiriPumppuKolmeVaihetta) ||
      m.keruuPaisuntaAstiaTarkistettu === true) {
    const virtausLS = parseFloat(m.keruupiiriVirtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(m.keruupiiriMeno) || 0;
    const tulo = parseFloat(m.keruupiiriTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.keruupiiriNeste);
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    void formula;
    
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">${laiteTyyppi === 'Vedenjäähdytyskone' ? '5.1 JÄÄHDYTYSPIRII' : '5.1 KERUUPIRII (MAA/VESI)'}</strong>
    </div>
    
    <!-- Tarkastukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.keruupiirinPaineTarkastettu, 'Paine tarkastettu')}${m.keruupiiriPaineBar ? ' (' + m.keruupiiriPaineBar + ' bar)' : ''}</div>
      <div>${renderCheckbox(m.keruupiirissaMutapussiPuhdistettu, 'Mutasihi puhdistettu')}</div>
      <div>${renderCheckbox(m.keruupiirinPumppuTarkastettu, 'Pumppu tarkastettu')}</div>
      <div>${renderCheckbox(m.keruupiirinEristeetKunnossa, 'Eristeet kunnossa')}</div>
      <div>${renderCheckbox(m.keruupiirissaAutomaattinenIlmausTarkistettu, 'Automaattinen ilmaus tarkistettu')}</div>
      <div>${renderCheckbox(m.keruuPaisuntaAstiaTarkistettu, 'Paisunta-astia tarkistettu')}</div>
    </div>
    
    <!-- Paine mittaus -->
    ${m.keruupiiriPaineBar ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paine (bar)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriPaineBar || '-'}</div>
      </div>
    </div>` : ''}
    
    <!-- Paisunta-astia tiedot -->
    ${m.keruuPaisuntaAstiaTarkistettu ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paisunta-astia koko (l)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuPaisuntaAstiaKoko || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Esipaine (bar)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuPaisuntaAstiaEsipaine || '-'}</div>
      </div>
    </div>` : ''}
    
    ${
      m.keruupiirinPumppuTarkastettu &&
      (hasPrintableValue(m.keruupiiriPumpunValmistaja) ||
        hasPrintableValue(m.keruupiiriPumpunMalli) ||
        hasPrintableValue(m.keruupiirinPumpunTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.keruupiiriPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruupiiriPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.keruupiiriPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruupiiriPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.keruupiiriPumpunValmistaja) &&
        !hasPrintableValue(m.keruupiiriPumpunMalli) &&
        hasPrintableValue(m.keruupiirinPumpunTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruupiirinPumpunTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${m.keruupiirinPumppuTarkastettu ? pumpSupplyHtmlBlock(
      m.keruupiiriPumpunSyottoValinta,
      m.keruupiiriPumppuKolmeVaihetta,
      m.keruupiiriPumppuVirta1vaihe || '',
      m.keruupiiriPumppuVirtaL1 || '',
      m.keruupiiriPumppuVirtaL2 || '',
      m.keruupiiriPumppuVirtaL3 || ''
    ) : ''}
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriMeno || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriTulo || '-'}</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Neste (kW/(l/s·K))</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruupiiriNeste || '-'}</div>
      </div>
    </div>
    
    <!-- Teho -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Teho (kW)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${keruupiiriPower.toFixed(2)} kW</div>
      </div>
    </div>
  </div>`;
  }

  // Erillinen keruu- / jäähdytyspiiri (MLP)
  const keruuJaahdytysNayta =
    m.keruuJaahdytysPiiri ||
    m.keruuJaahdytysPiiriPumppu ||
    hasPrintableValue(m.keruuJaahdytysPumppuTyyppi) ||
    hasPrintableValue(m.keruuJaahdytysPumpunValmistaja) ||
    hasPrintableValue(m.keruuJaahdytysPumpunMalli) ||
    getMlpPumpSyottoValinta(m.keruuJaahdytysPumpunSyottoValinta, m.keruuJaahdytysPumppuKolmeVaihetta) ||
    hasPrintableValue(m.keruuJaahdytysVirtaus) ||
    hasPrintableValue(m.keruuJaahdytysKayntivirta) ||
    hasPrintableValue(m.keruuJaahdytysMenoLampotila) ||
    hasPrintableValue(m.keruuJaahdytysPaluuLampotila);
  if (keruuJaahdytysNayta) {
    const vls = parseFloat(m.keruuJaahdytysVirtaus) || 0;
    const vM3h = vls * 3.6;
    const jMeno = parseFloat(m.keruuJaahdytysMenoLampotila) || 0;
    const jPaluu = parseFloat(m.keruuJaahdytysPaluuLampotila) || 0;
    const jDt = Math.abs(jMeno - jPaluu);
    const cVesi = 4.18;
    const keruuJaaTeho = vls > 0 && jDt > 0 ? cVesi * vls * jDt : 0;
    mlpHtml += `
  <div class="box-content" style="border-color: #5E35B1; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #5E35B1; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #5E35B1; text-decoration: underline;">5.1b KERUU- / JÄÄHDYTYSPIIRI (ERILLINEN)</strong>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.keruuJaahdytysPiiri, 'Erillinen keruu- / jäähdytyspiiri')}</div>
      <div>${renderCheckbox(m.keruuJaahdytysPiiriPumppu, 'Piirissä pumppu')}</div>
    </div>
    ${
      m.keruuJaahdytysPiiriPumppu &&
      (hasPrintableValue(m.keruuJaahdytysPumpunValmistaja) ||
        hasPrintableValue(m.keruuJaahdytysPumpunMalli) ||
        hasPrintableValue(m.keruuJaahdytysPumppuTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.keruuJaahdytysPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruuJaahdytysPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.keruuJaahdytysPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruuJaahdytysPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.keruuJaahdytysPumpunValmistaja) &&
        !hasPrintableValue(m.keruuJaahdytysPumpunMalli) &&
        hasPrintableValue(m.keruuJaahdytysPumppuTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.keruuJaahdytysPumppuTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${m.keruuJaahdytysPiiriPumppu ? pumpSupplyHtmlBlock(
      m.keruuJaahdytysPumpunSyottoValinta,
      m.keruuJaahdytysPumppuKolmeVaihetta,
      m.keruuJaahdytysPumppuVirta1vaihe || '',
      m.keruuJaahdytysPumppuVirtaL1 || '',
      m.keruuJaahdytysPumppuVirtaL2 || '',
      m.keruuJaahdytysPumppuVirtaL3 || ''
    ) : ''}
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${vM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysMenoLampotila || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysPaluuLampotila || '-'}</div>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Käyntivirta</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.keruuJaahdytysKayntivirta || '-'}</div>
      </div>
    </div>
    ${
      keruuJaaTeho > 0
        ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Laskennallinen teho (kW, vesi c=4,18)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${keruuJaaTeho.toFixed(2)} kW</div>
      </div>
    </div>`
        : ''
    }
  </div>`;
  }

  // Latauspiiri - form style
  if (showLauhdutuspiiri && (m.latausPaineTarkastettu || m.latausPaineBar || m.latausMutapussiPuhdistettu || m.latausPumppuTarkastettu || 
      m.latausEristeetKunnossa || m.latausAutomaattinenIlmausTarkistettu ||
      m.latausVirtaus || m.latausMeno || m.latausTulo || m.latausNeste || m.latausPumpunTyyppi ||
      m.latausPumpunValmistaja || m.latausPumpunMalli ||
      m.latausPaisuntaAstiaTarkistettu)) {
    const virtausLS = parseFloat(m.latausVirtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(m.latausMeno) || 0;
    const tulo = parseFloat(m.latausTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausNeste);
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    void formula;
    
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">${laiteTyyppi === 'Vedenjäähdytyskone' ? '5.2 LAUHDUTUSPIRII' : '5.2 LATAUSPIRII'}</strong>
    </div>
    
    <!-- Tarkastukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.latausPaineTarkastettu, 'Paine tarkastettu')}${m.latausPaineBar ? ' (' + m.latausPaineBar + ' bar)' : ''}</div>
      <div>${renderCheckbox(m.latausMutapussiPuhdistettu, 'Mutasihi puhdistettu')}</div>
      <div>${renderCheckbox(m.latausPumppuTarkastettu, 'Pumppu tarkastettu')}</div>
      <div>${renderCheckbox(m.latausEristeetKunnossa, 'Eristeet kunnossa')}</div>
    </div>
    
    ${m.latausPaineBar ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Mitattu paine (bar)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausPaineBar || '-'}</div>
      </div>
    </div>` : ''}
    
    ${
      m.latausPumppuTarkastettu &&
      (hasPrintableValue(m.latausPumpunValmistaja) ||
        hasPrintableValue(m.latausPumpunMalli) ||
        hasPrintableValue(m.latausPumpunTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.latausPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.latausPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.latausPumpunValmistaja) &&
        !hasPrintableValue(m.latausPumpunMalli) &&
        hasPrintableValue(m.latausPumpunTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausPumpunTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${m.latausPumppuTarkastettu ? pumpSupplyHtmlBlock(
      m.latausPumpunSyottoValinta,
      m.latausPumppuKolmeVaihetta,
      m.latausPumppuVirta1vaihe || '',
      m.latausPumppuVirtaL1 || '',
      m.latausPumppuVirtaL2 || '',
      m.latausPumppuVirtaL3 || ''
    ) : ''}
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausMeno || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulo || '-'}</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Neste (kW/(l/s·K))</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausNeste || '-'}</div>
      </div>
    </div>
    
    <!-- Teho -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Teho (kW)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${latauspiiriPower.toFixed(2)} kW</div>
      </div>
    </div>
  </div>`;
  }
  
  // Latauspiirin tulistuspiiri - form style
  if (showLauhdutuspiiri && (m.latausTulistuspiiri || m.latausTulistuspiiriPumppu) && (m.latausTulistusVirtaus || m.latausTulistusMeno || m.latausTulistusTulo || m.latausTulistusPumppuTyyppi || m.latausTulistusPumpunValmistaja || m.latausTulistusPumpunMalli || m.latausTulistusNeste)) {
    const virtausLS = parseFloat(m.latausTulistusVirtaus) || 0;
    const virtausM3h = virtausLS * 3.6;
    const meno = parseFloat(m.latausTulistusMeno) || 0;
    const tulo = parseFloat(m.latausTulistusTulo) || 0;
    const deltaT = Math.abs(meno - tulo);
    const c = getSpecificHeatCapacity(m.latausTulistusNeste);
    const formula = virtausLS > 0 && deltaT > 0 && c > 0 ? `${c} × ${virtausLS} × ${deltaT}` : '';
    void formula;
    const power = virtausLS > 0 && deltaT > 0 && c > 0 ? c * virtausLS * deltaT : 0;
    
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">5.2b TULISTUSPIRII</strong>
    </div>
    
    <!-- Pumppu tiedot -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Tulistuspiiri</div>
        <div>${renderCheckbox(m.latausTulistuspiiriPumppu, 'Pumppu käytössä')}</div>
      </div>
    </div>
    
    ${
      m.latausTulistuspiiriPumppu &&
      (hasPrintableValue(m.latausTulistusPumpunValmistaja) ||
        hasPrintableValue(m.latausTulistusPumpunMalli) ||
        hasPrintableValue(m.latausTulistusPumppuTyyppi))
        ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      ${
        hasPrintableValue(m.latausTulistusPumpunValmistaja)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun valmistaja</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausTulistusPumpunValmistaja)}</div>
      </div>`
          : ''
      }
      ${
        hasPrintableValue(m.latausTulistusPumpunMalli)
          ? `<div>
        <div style="color: #666; margin-bottom: 2px;">Pumpun malli</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausTulistusPumpunMalli)}</div>
      </div>`
          : ''
      }
      ${
        !hasPrintableValue(m.latausTulistusPumpunValmistaja) &&
        !hasPrintableValue(m.latausTulistusPumpunMalli) &&
        hasPrintableValue(m.latausTulistusPumppuTyyppi)
          ? `<div style="grid-column: 1 / -1;">
        <div style="color: #666; margin-bottom: 2px;">Pumpun tyyppi (vanha)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${normalizePrintText(m.latausTulistusPumppuTyyppi)}</div>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    
    ${m.latausTulistuspiiriPumppu ? pumpSupplyHtmlBlock(
      m.latausTulistusPumpunSyottoValinta,
      m.latausTulistusPumppuKolmeVaihetta,
      m.latausTulistusPumppuVirta1vaihe || '',
      m.latausTulistusPumppuVirtaL1 || '',
      m.latausTulistusPumppuVirtaL2 || '',
      m.latausTulistusPumppuVirtaL3 || ''
    ) : ''}
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (l/s)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusVirtaus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Virtaus (m³/h)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${virtausM3h.toFixed(2)}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Meno (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusMeno || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Paluu (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusTulo || '-'}</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Neste (kW/(l/s·K))</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.latausTulistusNeste || '-'}</div>
      </div>
    </div>
    
    <!-- Teho -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Teho (kW)</div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; font-weight: bold;">${power.toFixed(2)} kW</div>
      </div>
    </div>
  </div>`;
  }
  
  // Käyttövesi - form style - only for MLP, not for Vedenjäähdytyskone
  if (laiteTyyppi !== 'Vedenjäähdytyskone' && m.kayttovesiEnabled && (m.kayttovesiTilavuus || m.kayttovesiLampotilaAsetus || m.kayttovesiLampotilaNykyinen || m.kayttovesiSahkoVastuksetEnabled)) {
    mlpHtml += `
  <div class="box-content" style="border-color: #7B1FA2; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #7B1FA2; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #7B1FA2; text-decoration: underline;">5.3 KÄYTTÖVESI</strong>
    </div>
    
    <!-- Mittaukset -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; font-size: 11px;">
      <div>
        <div style="color: #666; margin-bottom: 2px;">Tilavuus (l)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.kayttovesiTilavuus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Lämpötila asetus (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.kayttovesiLampotilaAsetus || '-'}</div>
      </div>
      <div>
        <div style="color: #666; margin-bottom: 2px;">Nykyinen lämpötila (°C)</div>
        <div style="padding: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">${m.kayttovesiLampotilaNykyinen || '-'}</div>
      </div>
    </div>
    
    <!-- Sähkövastukset -->
    ${m.kayttovesiSahkoVastuksetEnabled && m.kayttovesiSahkoVastukset && m.kayttovesiSahkoVastukset.length > 0 ? `
    <div style="margin-bottom: 8px;">
      <div style="font-size: 12px; font-weight: bold; color: #7B1FA2; margin-bottom: 6px;">Sähkövastukset</div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 11px;">
        ${m.kayttovesiSahkoVastukset.map((v: HeatingElementData, idx: number) => `
          <div style="padding: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">
            <div style="font-weight: bold; margin-bottom: 4px;">Vastus ${idx + 1}: ${v.tunnus || '-'}</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
              <div>Teho: <strong>${v.teho || '-'} kW</strong></div>
              <div>Jännite: <strong>${v.jannite || '-'} V</strong></div>
              <div>Asetus: <strong>${v.asetusarvo || '-'} °C</strong></div>
              <div>${renderCheckbox(v.toimintaTestattu, 'Toiminta testattu')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- Laitteet -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px;">
      <div>${renderCheckbox(m.kayttovesiSahkoVastuksetEnabled, 'Sähkövastukset käytössä')}${m.kayttovesiSahkoVastuksetMaara ? ' (' + m.kayttovesiSahkoVastuksetMaara + ' kpl)' : ''}</div>
    <div>${renderCheckbox(m.kayttovesiToimilaitteetOK, 'Toimilaitteet kunnossa')}</div>
    <div>${renderCheckbox(m.kayttovesiKiertoEnabled, 'Kiertopumppu käytössä')}</div>
    </div>
  </div>`;
  }
  
  // Lämpöpiirit / Kiinteistön jäähdytyspiiri - form style
  if (includeKiinteistoPiirit) {
    mlpHtml += kiinteistoPiiritPrintSectionHtml(m, laiteTyyppi);
  }
  
  // Energia tehokkuus - form style
  mlpHtml += `
  <div class="box-content" style="border-color: #FF6D00; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #FF6D00; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #FF6D00; text-decoration: underline;">5.5 ENERGIATEHOKKUUS</strong>
    </div>
    
    <!-- Energian SYÖTE -->
    <div style="padding: 10px; background: #e3f2fd; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #1976D2;">
      <div style="font-size: 11px; font-weight: bold; color: #1976D2; margin-bottom: 4px;">ENERGIATASE</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 11px;">
        <div>
          <div style="color: #666;">Maaperästä/kaivosta</div>
          <div style="font-size: 14px; font-weight: bold; color: #1976D2;">${maaperastaEnergy.toFixed(2)} kW</div>
          <div style="font-size: 9px; color: #666;">${deviceOutputPower > 0 ? ((maaperastaEnergy / deviceOutputPower) * 100).toFixed(0) + '%' : '-'}</div>
        </div>
        <div>
          <div style="color: #666;">Sähköverkosta</div>
          <div style="font-size: 14px; font-weight: bold; color: #f9a825;">${kompressoriPower.toFixed(2)} kW</div>
          <div style="font-size: 9px; color: #666;">${m.mittaaKokoLaiteSahko ? '(koko laite)' : '(kompressorin 1)'}</div>
        </div>
        <div>
          <div style="color: #666;">Tuotanto yhteensä</div>
          <div style="font-size: 14px; font-weight: bold; color: #388E3C;">${deviceOutputPower.toFixed(2)} kW</div>
          ${tulistuspiiriPower > 0 ? `<div style="font-size: 9px; color: #666;">Lataus: ${latauspiiriPower.toFixed(1)} kW + Tulistus: ${tulistuspiiriPower.toFixed(1)} kW</div>` : `<div style="font-size: 9px; color: #666;">Latauspiiri: ${latauspiiriPower.toFixed(1)} kW</div>`}
        </div>
      </div>
    </div>
    
    <!-- Energian TUOTANTO -->
    <div style="padding: 10px; background: #e8f5e9; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #388E3C;">
      <div style="font-size: 11px; font-weight: bold; color: #388E3C; margin-bottom: 4px;">TUOTANTO (mitä laite työntää järjestelmään)</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 11px;">
        ${tulistuspiiriPower > 0 ? `
        <div>
          <div style="color: #666;">Tulistuspiiri (varastoon)</div>
          <div style="font-size: 14px; font-weight: bold; color: #388E3C;">${tulistuspiiriPower.toFixed(2)} kW</div>
        </div>` : ''}
        <div>
          <div style="color: #666;">Latauspiiri (varastoon/jakeluun)</div>
          <div style="font-size: 14px; font-weight: bold; color: #388E3C;">${latauspiiriPower.toFixed(2)} kW</div>
        </div>
        <div>
          <div style="color: #666;">Yhteensä tuotanto</div>
          <div style="font-size: 14px; font-weight: bold; color: #333;">${deviceOutputPower.toFixed(2)} kW</div>
        </div>
      </div>
    </div>
    
    <!-- Energian KULUTUS -->
    ${includeKiinteistoPiirit ? `
    <div style="padding: 10px; background: #f3e5f5; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #7B1FA2;">
      <div style="font-size: 11px; font-weight: bold; color: #7B1FA2; margin-bottom: 4px;">KULUTUS (mitä kiinteistö kuluttaa varaajasta - poistaa sen varaajasta)</div>
      <div style="font-size: 14px; font-weight: bold; color: #7B1FA2;">${lampoPiiritPower.toFixed(2)} kW</div>
      <div style="font-size: 10px; color: #666;">Lämmitys (varaajasta)</div>
    </div>` : ''}
    
    <!-- COP -->
    <div style="padding: 12px; background: ${copBgColor}; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid ${copBorderColor};">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 11px; color: #666;">Laskennallinen COP</div>
          <div style="font-size: 24px; font-weight: bold; color: ${copTextColor};">${canCalculateCop ? cop.toFixed(2) : '-'}</div>
          <div style="font-size: 10px; color: #666;">tuotanto / sähkönkulutus</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: bold; color: ${copTextColor};">
            ${copEfficiencyLabel}
          </div>
          <div style="font-size: 10px; color: #666;">energiatehokkuus</div>
        </div>
      </div>
    </div>`;
  
  if (warnings.length > 0) {
    mlpHtml += `
    <div style="padding: 10px; background: #ffebee; border-radius: 4px; border-left: 4px solid #d32f2f; margin-bottom: 8px;">
      <div style="font-size: 11px; font-weight: bold; color: #d32f2f; margin-bottom: 4px;">HUOMIOITAVAA</div>
      <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #c62828;">
        ${warnings.map((w: string) => `<li style="margin-bottom: 2px;">${w}</li>`).join('')}
      </ul>
    </div>`;
  }
  
  if (suggestions.length > 0) {
    // PARANNUSEHDOTUKSIA - Removed as requested
  }
  
  if (warnings.length === 0 && cop > 0) {
    mlpHtml += `
    <div style="padding: 10px; background: #e8f5e9; border-radius: 4px; border-left: 4px solid #388E3C;">
      <div style="font-size: 11px; color: #2e7d32;">✓ Mittaukset vaikuttavat normaaleilta, ei havaittu poikkeamia</div>
    </div>`;
  }
  
  if (!canCalculateCop) {
    const missingCopMeasurements: string[] = [];
    if (m.mittaaKokoLaiteSahko) {
      const kv = getKokoLaiteSahkoVaiheValinta(m);
      if (kv === '3') {
        const missingPhases: string[] = [];
        if (!hasPrintableValue(m.kokoLaiteVirtaL1)) missingPhases.push('L1');
        if (!hasPrintableValue(m.kokoLaiteVirtaL2)) missingPhases.push('L2');
        if (!hasPrintableValue(m.kokoLaiteVirtaL3)) missingPhases.push('L3');
        if (missingPhases.length > 0) {
          missingCopMeasurements.push(`Koko laitteiston 3-vaihevirrat puuttuvat (${missingPhases.join(', ')}).`);
        }
      } else if (kv === '1') {
        if (!hasPrintableValue(m.kokoLaiteVirta1vaihe)) {
          missingCopMeasurements.push('Koko laitteiston 1-vaihevirta (A) puuttuu.');
        }
      } else {
        missingCopMeasurements.push('Sähköteholle pitää valita 1-vaihe/3-vaihe ja syöttää virrat.');
      }
    } else {
      const compCount = parseInt(String(kp1Data.kompressorienMaara ?? '')) || 1;
      for (let i = 1; i <= compCount; i++) {
        const compKey = `kompressori${i}` as keyof RefrigerantCircuitData;
        const compRaw = kp1Data[compKey];
        if (!compRaw || typeof compRaw !== 'object') {
          missingCopMeasurements.push(`Kompressori ${i}: virranmittaus puuttuu.`);
          continue;
        }
        const comp = compRaw as Partial<CompressorData>;
        const cv = getCompressorVaiheValinta(comp);
        if (cv === '1' && !hasPrintableValue(comp.virta1vaihe)) {
          missingCopMeasurements.push(`Kompressori ${i}: 1-vaihevirta (A) puuttuu.`);
        } else if (cv === '3') {
          const missingPhases: string[] = [];
          if (!hasPrintableValue(comp.virtaL1)) missingPhases.push('L1');
          if (!hasPrintableValue(comp.virtaL2)) missingPhases.push('L2');
          if (!hasPrintableValue(comp.virtaL3)) missingPhases.push('L3');
          if (missingPhases.length > 0) {
            missingCopMeasurements.push(`Kompressori ${i}: 3-vaihevirroista puuttuu ${missingPhases.join(', ')}.`);
          }
        } else {
          missingCopMeasurements.push(`Kompressori ${i}: vaihetieto tai virranmittaus puuttuu.`);
        }
      }
    }
    if (keruupiiriPower === 0) {
      const keruuMissing = getNestekiertoMissingLine('Keruupiiri', m.keruupiiriVirtaus, m.keruupiiriMeno, m.keruupiiriTulo, m.keruupiiriNeste);
      if (keruuMissing) missingCopMeasurements.push(keruuMissing);
    }
    if (latauspiiriPower === 0) {
      const latausMissing = getNestekiertoMissingLine('Jäähdytys-/latauspiiri', m.latausVirtaus, m.latausMeno, m.latausTulo, m.latausNeste);
      if (latausMissing) missingCopMeasurements.push(latausMissing);
    }
    if (showLauhdutuspiiri && m.latausTulistuspiiri && tulistuspiiriPower === 0) {
      const tulistusMissing = getNestekiertoMissingLine(
        'Lauhdutus-/tulistuspiiri',
        m.latausTulistusVirtaus,
        m.latausTulistusMeno,
        m.latausTulistusTulo,
        m.latausTulistusNeste
      );
      if (tulistusMissing) missingCopMeasurements.push(tulistusMissing);
    }
    const tulistusPiiriPuuttuuHtml = m.latausTulistuspiiri && tulistuspiiriPower === 0 ? `
      <div style="margin-top: 8px; padding: 8px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px;">
        <div style="font-size: 11px; font-weight: bold; color: #f57c00; margin-bottom: 2px;">Tulistuspiiri käytössä mutta mittaukset puuttuvat</div>
        <div style="font-size: 10px; color: #f57c00;">Tulistuspiiri edustaa tyypillisesti 5-15% kokonaislämmitystehosta. Ilman mittauksia energiatase jää vajaaksi.</div>
      </div>
    ` : '';
    
    mlpHtml += `
    <div style="padding: 10px; background: #fafafa; border-radius: 4px; border-left: 4px solid #9e9e9e;">
      <div style="font-size: 11px; font-weight: bold; color: #666; margin-bottom: 4px;">COP:N LASKEMISEKSI TARVITAAN:</div>
      <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #666;">
        ${missingCopMeasurements.length > 0 ? missingCopMeasurements.map((item) => `<li>${item}</li>`).join('') : '<li>Ei yksilöityä puutetta: tarkista mittausarvojen yksiköt ja että arvot ovat > 0.</li>'}
      </ul>
      <div style="margin-top: 6px; font-size: 10px; color: #666;">Oikea COP-laskenta vaatii sähkötehon + tuotantopiirin mittaukset. Energiataseen tarkennukseen suositellaan lisäksi keruupiirin mittaukset (virtaus, meno, paluu, neste).</div>
      ${tulistusPiiriPuuttuuHtml}
    </div>`;
  }
  
  // Subcooling (Alijäähdytys)
  if (m.kylmaaineKyllaestymisLampotila && m.kylmaaineNestePutkiLampotila) {
    const kyllaestymis = parseFloat(m.kylmaaineKyllaestymisLampotila) || 0;
    const neste = parseFloat(m.kylmaaineNestePutkiLampotila) || 0;
    const alijaahdytys = (kyllaestymis - neste).toFixed(1);
    const alijaahdytysNum = parseFloat(alijaahdytys);
    const onkoNormaali = alijaahdytysNum >= 4 && alijaahdytysNum <= 6;
    
    // Add warnings for abnormal subcooling
    if (alijaahdytysNum > 0) {
      if (alijaahdytysNum < 4) {
        warnings.push(`Alijäähdytys matala (${alijaahdytysNum} K < 4 K) - lauhdutus voi olla tehoton`);
      } else if (alijaahdytysNum > 6) {
        warnings.push(`Alijäähdytys korkea (${alijaahdytysNum} K > 6 K) - nesteen alijohtumisriski kompressoriin`);
      }
    }
    
    mlpHtml += `
  <div class="box-content" style="border-color: #0288D1; margin-top: 12px; page-break-inside: avoid; break-inside: avoid;">
    <div style="border-bottom: 2px solid #0288D1; padding-bottom: 4px; margin-bottom: 8px;">
      <strong style="font-size: 18px; color: #0288D1; text-decoration: underline;">5.6 ALIJÄÄHDYTYS (SUBCOOLING)</strong>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 11px; margin-bottom: 8px;">
      <div style="padding: 8px; background: #e1f5fe; border-radius: 4px; text-align: center;">
        <div style="color: #0277BD; margin-bottom: 4px;">Kyllästymislämpötila</div>
        <div style="font-size: 16px; font-weight: bold; color: #01579B;">${m.kylmaaineKyllaestymisLampotila} °C</div>
      </div>
      <div style="padding: 8px; background: #e1f5fe; border-radius: 4px; text-align: center;">
        <div style="color: #0277BD; margin-bottom: 4px;">Nesteputken lämpötila</div>
        <div style="font-size: 16px; font-weight: bold; color: #01579B;">${m.kylmaaineNestePutkiLampotila} °C</div>
      </div>
      <div style="padding: 8px; background: ${onkoNormaali ? '#e8f5e9' : '#fffde7'}; border-radius: 4px; text-align: center;">
        <div style="color: ${onkoNormaali ? '#2E7D32' : '#F57F17'}; margin-bottom: 4px;">Alijäähdytys</div>
        <div style="font-size: 16px; font-weight: bold; color: ${onkoNormaali ? '#1B5E20' : '#E65100'};">${alijaahdytys} K</div>
      </div>
    </div>
    
    <div style="font-size: 10px; color: #666; padding: 6px; background: #f5f5f5; border-radius: 4px;">
      <strong>Kaava:</strong> Alijäähdytys = Kyllästymislämpötila − Nesteputken lämpötila<br/>
      <strong>Normaali (R-410A):</strong> +4…6 K
    </div>
  </div>`;
  }
  
  mlpHtml += `
  </div>`;
  
  return mlpHtml;
}

export function generateMlpFullPrintHtml(data: HuoltoReportData, hasAirCondenserSelected = false): string {
  const m = data.mlpData;
  if (!m) return '';
  if (isChillerLikeDevice(data.laiteTyyppi)) return '';
  if (
    !data.selectedModules.mlpPiirit
    && data.laiteTyyppi !== 'mlp'
    && data.laiteTyyppi !== 'vesiilmalampopumppu'
  ) {
    return '';
  }
  return generateMLPPrintHtml(m, data.kylmaainePiiri1, data.laiteTyyppi, hasAirCondenserSelected);
}
