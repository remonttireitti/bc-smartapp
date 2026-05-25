import type { ReactNode } from 'react';
import type { CondenserData, EvaporatorData, NestelauhdutinUnitData } from '../../lib/huoltoRaportti/types';
import {
  LAUHDUTIN_TYYPIT,
  MLP_LAITEKORTTI_ROWS,
  NESTE_VJ_OHJAUS_LAHDE,
  NESTE_VJ_OHJAUS_TAPA,
  circuitCompressorDisplayCount,
  circuitHasStaticRefrigerantFields,
  condenserRowShowsAirLauhdutinSection,
  evapTyyppiLabel,
  evaporatorSnapshotRowIsMeaningful,
  formatPumpSyottoReadout,
  huoltoTechnicalSnapshotShowsEvaporatorHeading,
  kompressoriSnapshotRowMeaningful,
  mlpSnapshotSectionHasContent,
  nestelauhdutinRegistryUnitIsMeaningful,
  nonEmpty,
  showSisayksikotInSnapshot,
  snapVal,
  type ParsedEquipmentSnapshot,
} from '../../lib/huoltoRaportti/equipmentSnapshotDisplay';

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const empty = value == null || value === '';
  return (
    <div className="equipment-snapshot-row">
      <dt>{label}</dt>
      <dd>{empty ? '—' : value}</dd>
    </div>
  );
}

function OptionalRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '' || (typeof value === 'string' && !value.trim())) return null;
  return <DetailRow label={label} value={value} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="equipment-snapshot-section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

function SubCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="equipment-snapshot-subcard">
      <h4>{title}</h4>
      <dl>{children}</dl>
    </div>
  );
}

export default function EquipmentSnapshotReadOnly({ snapshot }: { snapshot: ParsedEquipmentSnapshot }) {
  const ulko = snapshot.ulkoyksikko as Record<string, unknown>;
  const piirejaCount = Math.max(1, parseInt(String(snapshot.kylmaainePiireja || '1').trim(), 10) || 1);
  const compressorCircuitSlots = Math.min(3, piirejaCount);
  const circuits = [
    { label: 'Piiri 1', data: (snapshot.kp1Data ?? {}) as Record<string, unknown> },
    { label: 'Piiri 2', data: (snapshot.kp2Data ?? {}) as Record<string, unknown> },
    { label: 'Piiri 3', data: (snapshot.kp3Data ?? {}) as Record<string, unknown> },
  ].slice(0, compressorCircuitSlots);

  let sumCompressors = 0;
  for (const { data } of circuits) {
    if (data.onKaytossa === false) continue;
    sumCompressors += circuitCompressorDisplayCount(data);
  }

  const kylmaaineYksiRivi = String(
    snapshot.kylmaaineTyyppi || snapshot.kylmaaineLaatu || '',
  ).trim();

  const piiriMaarat = [
    { label: 'Määrä piiri 1', value: snapshot.kylmaaineMaaraPiiri1 },
    { label: 'Määrä piiri 2', value: snapshot.kylmaaineMaaraPiiri2 },
    { label: 'Määrä piiri 3', value: snapshot.kylmaaineMaaraPiiri3 },
    { label: 'Määrä piiri 4', value: snapshot.kylmaaineMaaraPiiri4 },
  ].slice(0, Math.min(4, piirejaCount));

  if (snapshot.laiteTyyppi === 'konvektorit') {
    const rows = snapshot.konvektorit ?? [];
    if (rows.length === 0) {
      return <p className="muted">Ei tallennettuja konvektoritietoja huoltopöytäkirjasta.</p>;
    }
    return (
      <div className="equipment-snapshot-root">
        <Section title="Konvektorit">
          {rows.map((row, index) => (
            <SubCard key={index} title={`Konvektori ${index + 1}`}>
              <DetailRow label="Tunnus" value={row.tunnus} />
              <DetailRow label="Valmistaja" value={row.valmistaja} />
              <DetailRow label="Malli" value={row.malli} />
              <DetailRow label="Sarjanumero" value={row.sarjanumero} />
            </SubCard>
          ))}
        </Section>
      </div>
    );
  }

  return (
    <div className="equipment-snapshot-root">
      <Section title="Käyttötarkoitus ja kylmäaine">
        <OptionalRow label="Käyttötarkoitus" value={snapshot.laiteKayttotarkoitus} />
        <OptionalRow label="Kylmäainepiirejä" value={snapshot.kylmaainePiireja} />
        {kylmaaineYksiRivi ? <DetailRow label="Kylmäaine" value={kylmaaineYksiRivi} /> : null}
        <OptionalRow label="Valmistajan täyttömäärä" value={snapshot.kylmaaineValmistajaMaara} />
        <OptionalRow label="Lisätty määrä" value={snapshot.kylmaaineLisattyMaara} />
        <OptionalRow label="Putkimatka / huomio" value={snapshot.kylmaainePutkimatka} />
        {piiriMaarat.map(({ label, value }) => (
          <OptionalRow key={label} label={label} value={value} />
        ))}
        <OptionalRow label="Kylmäainetta yhteensä" value={snapshot.kylmaaineMaaraYhteensa} />
        <OptionalRow label="Laskettu CO₂-ekvivalentti (t)" value={snapshot.kylmaaineCO2Ekv} />
      </Section>

      <Section title="Piirit ja kompressorit">
        {sumCompressors > 0 ? <DetailRow label="Kompressoreita yhteensä" value={`${sumCompressors} kpl`} /> : null}
        {circuits.map(({ label, data }) => {
          if (data.onKaytossa === false) return null;
          const nComp = circuitCompressorDisplayCount(data);
          const hasStatic = circuitHasStaticRefrigerantFields(data);
          const hasAnyKomp = [1, 2, 3, 4, 5, 6].some((i) =>
            kompressoriSnapshotRowMeaningful(data[`kompressori${i}`]),
          );
          if (nComp <= 0 && !hasStatic && !hasAnyKomp) return null;
          return (
            <SubCard key={label} title={label}>
              {nComp > 0 ? <DetailRow label="Kompressoreita (ilmoitettu)" value={`${nComp} kpl`} /> : null}
              <OptionalRow label="Piirin ohjaustapa" value={snapVal(data.ohjaustapa)} />
              <OptionalRow label="Paisuntaventtiili (tyyppi)" value={snapVal(data.paisuntaventtiiliTyyppi)} />
              <OptionalRow label="Paisuntaventtiili (muu)" value={snapVal(data.paisuntaventtiiliMuu)} />
              <OptionalRow label="Paisuntaventtiilin valmistaja" value={snapVal(data.paisuntaventtiiliValmistaja)} />
              <OptionalRow label="Paisuntaventtiilin malli" value={snapVal(data.paisuntaventtiiliMalli)} />
              <OptionalRow label="Magneettiventtiilin valmistaja" value={snapVal(data.magneettiventtiiliValmistaja)} />
              <OptionalRow label="Magneettiventtiilin malli" value={snapVal(data.magneettiventtiiliMalli)} />
              <OptionalRow label="Kuivain · valmistaja" value={snapVal(data.kuivainValmistaja)} />
              <OptionalRow label="Kuivain · malli" value={snapVal(data.kuivainMalli)} />
              <OptionalRow label="Kuivain · kivien määrä" value={snapVal(data.kuivainKivienMaara)} />
              {[1, 2, 3, 4, 5, 6].map((i) => {
                const raw = data[`kompressori${i}`];
                if (!kompressoriSnapshotRowMeaningful(raw)) return null;
                const k = raw as Record<string, unknown>;
                return (
                  <SubCard key={`${label}-k${i}`} title={`Kompressori ${i}`}>
                    <OptionalRow label="Valmistaja" value={snapVal(k.valmistaja)} />
                    <OptionalRow label="Malli" value={snapVal(k.malli)} />
                    <OptionalRow label="Tyyppi (yhdistelmä / vanha)" value={snapVal(k.tyyppi)} />
                    <OptionalRow label="Ohjaustapa" value={snapVal(k.ohjaustapa)} />
                    <OptionalRow label="Kontaktori" value={snapVal(k.kontaktoriTyyppi)} />
                    <OptionalRow label="Pehmökäynnistin" value={snapVal(k.pehmokaynnistinTyyppi)} />
                    <OptionalRow label="Taajuusmuuttaja" value={snapVal(k.taajuusmuuttajaTyyppi)} />
                    <OptionalRow label="Ohjaustapa (muu)" value={snapVal(k.ohjaustapaMuu)} />
                  </SubCard>
                );
              })}
            </SubCard>
          );
        })}
        {sumCompressors <= 0 &&
        !circuits.some(({ data }) => circuitHasStaticRefrigerantFields(data) || circuitCompressorDisplayCount(data) > 0) ? (
          <p className="muted">Ei täytettyjä tietoja</p>
        ) : null}
      </Section>

      <Section title="Ulkoyksikkö">
        <OptionalRow label="Malli" value={snapVal(ulko.ulkoyksikkoMalli)} />
        <OptionalRow label="Sarjanumero" value={snapVal(ulko.ulkoyksikkoSarjanumero)} />
        <OptionalRow label="Jäähdytysteho" value={snapVal(ulko.ulkoyksikkoJaahdytysTeho)} />
        <OptionalRow label="Lämmitysteho" value={snapVal(ulko.ulkoyksikkoLammitysTeho)} />
        <OptionalRow label="Asennustapa" value={snapVal(ulko.ulkoyksikkoAsennustapa)} />
        <OptionalRow label="Asennustapa (muu)" value={snapVal(ulko.ulkoyksikkoAsennustapaMuu)} />
      </Section>

      {huoltoTechnicalSnapshotShowsEvaporatorHeading(snapshot.laiteTyyppi) ? (
        <Section title="Höyrystimet">
          {(() => {
            const evs = (snapshot.evaporatorData || []).filter((row) =>
              evaporatorSnapshotRowIsMeaningful(row),
            );
            if (evs.length === 0) return <p className="muted">Ei täytettyjä tietoja</p>;
            return evs.map((ev: Partial<EvaporatorData>, index: number) => (
              <SubCard key={index} title={`Höyrystin ${index + 1}`}>
                <OptionalRow
                  label="Tyyppi"
                  value={nonEmpty(ev.tyyppi) ? evapTyyppiLabel(String(ev.tyyppi)) : undefined}
                />
                <OptionalRow label="Huoneen tunnus" value={ev.huoneenTunnus} />
                <OptionalRow label="Valmistaja" value={ev.valmistaja} />
                <OptionalRow label="Malli" value={ev.malli} />
                <OptionalRow label="Sarjanumero" value={ev.sarjanumero} />
              </SubCard>
            ));
          })()}
        </Section>
      ) : null}

      <Section title="Lauhduttimet">
        {(() => {
          const nestSnapshot = (snapshot.nestelauhduttimetVj || []).filter((unit) =>
            nestelauhdutinRegistryUnitIsMeaningful(unit as NestelauhdutinUnitData),
          );
          const cds = (snapshot.condenserData || []).filter((co) =>
            condenserRowShowsAirLauhdutinSection(co as CondenserData, snapshot.laiteTyyppi),
          );
          const anyNestShell = (snapshot.condenserData || []).some((co) => co.tyyppi === 'nestekiertoinen');
          if (nestSnapshot.length === 0 && cds.length === 0 && !anyNestShell) {
            return <p className="muted">Ei täytettyjä tietoja</p>;
          }
          return (
            <>
              {anyNestShell ? (
                <DetailRow
                  label="Lauhdetapa (laite)"
                  value={LAUHDUTIN_TYYPIT.nestekiertoinen}
                />
              ) : null}
              {nestSnapshot.map((unit: Partial<NestelauhdutinUnitData>, index: number) => (
                <SubCard key={index} title={`Nestelauhdutin ${index + 1}`}>
                  <OptionalRow label="Valmistaja" value={unit.valmistaja} />
                  <OptionalRow label="Malli" value={unit.malli} />
                  <OptionalRow label="Sarjanumero" value={unit.sarjanumero} />
                  <OptionalRow label="Puhaltimien määrä" value={snapVal(unit.puhaltimienMaara)} />
                  <OptionalRow
                    label="Puhaltimien syöttö"
                    value={
                      unit.puhallinSyotto === '230'
                        ? '230 V'
                        : unit.puhallinSyotto === '400'
                          ? '400 V'
                          : undefined
                    }
                  />
                  <OptionalRow label="Puhaltimien valmistaja" value={unit.puhaltimienValmistaja} />
                  <OptionalRow label="Puhaltimien malli" value={unit.puhaltimienMalli} />
                  <OptionalRow
                    label="Puhaltimen ohjaustapa"
                    value={
                      NESTE_VJ_OHJAUS_TAPA[String(unit.puhallinOhjausTapa || '')] ||
                      snapVal(unit.puhallinOhjausTapa)
                    }
                  />
                  <OptionalRow
                    label="Ohjaus tulee"
                    value={
                      NESTE_VJ_OHJAUS_LAHDE[String(unit.ohjausLahde || '')] || snapVal(unit.ohjausLahde)
                    }
                  />
                </SubCard>
              ))}
              {cds.map((co: Partial<CondenserData>, index: number) => (
                <SubCard key={index} title={`Lauhdutin (ilma) ${index + 1}`}>
                  <OptionalRow
                    label="Tyyppi"
                    value={LAUHDUTIN_TYYPIT[String(co.tyyppi || '')] || snapVal(co.tyyppi)}
                  />
                  <OptionalRow label="Valmistaja" value={(co as { valmistaja?: string }).valmistaja} />
                  <OptionalRow label="Malli" value={(co as { malli?: string }).malli} />
                  <OptionalRow label="Puhaltimien määrä" value={snapVal(co.puhaltimienMaara)} />
                  <OptionalRow label="Puhallimen ohjaus" value={snapVal(co.puhallinOhjaus)} />
                  <OptionalRow label="Nopeussäätimen malli" value={co.nopeussäädinMalli} />
                  <OptionalRow label="Taajuusmuuntajan malli" value={co.taajusmuuntajaMalli} />
                  <OptionalRow label="KP-painestatin malli" value={co.kpPressostaattiMalli} />
                  <OptionalRow label="Painesäätimen malli" value={co.painesäätimenMalli} />
                </SubCard>
              ))}
            </>
          );
        })()}
      </Section>

      {snapshot.isMLP && snapshot.mlpData && mlpSnapshotSectionHasContent(snapshot.mlpData as Record<string, unknown>) ? (
        <Section title="Lämpöpumppu / kiertovedet (MLP)">
          {(() => {
            const m = snapshot.mlpData as Record<string, unknown>;
            return (
              <>
                {m.keruuJaahdytysPiiri === true ? (
                  <DetailRow label="Erillinen keruu/jäähdytyspiiri" value="Kyllä" />
                ) : null}
                {m.keruuJaahdytysPiiriPumppu === true ? (
                  <DetailRow label="Erill. piirissä pumppu" value="Kyllä" />
                ) : null}
                {m.latausTulistuspiiri === true ? <DetailRow label="Tulistuspiiri" value="Kyllä" /> : null}
                {m.latausTulistuspiiriPumppu === true ? (
                  <DetailRow label="Tulistuspiirissä pumppu" value="Kyllä" />
                ) : null}
                {MLP_LAITEKORTTI_ROWS.map(({ key, label }) => {
                  const raw = m[key];
                  const value =
                    String(key).includes('SyottoValinta') || String(key).includes('PumpunSyottoValinta')
                      ? formatPumpSyottoReadout(raw)
                      : snapVal(raw);
                  return <OptionalRow key={key} label={label} value={value} />;
                })}
                {m.kiinteistoPiiritSisallytetaan === false ? (
                  <DetailRow label="Kiinteistön piirit laitekortissa" value="Ei sisällä — täytetty vain pöytäkirjaan" />
                ) : null}
                {Array.isArray(m.lampoPiirit)
                  ? (m.lampoPiirit as Record<string, unknown>[]).map((row, idx) => {
                      const show =
                        nonEmpty(row.pumppuValmistaja) ||
                        nonEmpty(row.pumppuMalli) ||
                        nonEmpty(row.pumppuTyyppi) ||
                        nonEmpty(row.jakotapa) ||
                        nonEmpty(row.jakotapaMuu) ||
                        nonEmpty(row.pumppuSyottoValinta);
                      if (!show) return null;
                      return (
                        <SubCard key={`lp-${idx}`} title={`Kiinteistön lämpöpiiri ${idx + 1}`}>
                          <OptionalRow label="Jakotapa" value={snapVal(row.jakotapa)} />
                          <OptionalRow label="Jakotapa (muu)" value={snapVal(row.jakotapaMuu)} />
                          <OptionalRow label="Pumpun valmistaja" value={snapVal(row.pumppuValmistaja)} />
                          <OptionalRow label="Pumpun malli" value={snapVal(row.pumppuMalli)} />
                          <OptionalRow label="Pumpun tyyppi (vanha)" value={snapVal(row.pumppuTyyppi)} />
                          <OptionalRow
                            label="Pumpun syöttö"
                            value={formatPumpSyottoReadout(row.pumppuSyottoValinta)}
                          />
                        </SubCard>
                      );
                    })
                  : null}
              </>
            );
          })()}
        </Section>
      ) : null}

      {showSisayksikotInSnapshot(snapshot) ? (
        <Section title="Sisäyksiköt">
          <OptionalRow label="Määrä" value={snapshot.sisayksikko?.maara} />
          {(() => {
            const rows = (snapshot.sisayksikko?.data || []) as {
              tyyppi?: string;
              malli?: string;
              sarjanumero?: string;
            }[];
            const filled = rows
              .map((row, idx) => ({ row, idx }))
              .filter(({ row }) => nonEmpty(row.tyyppi) || nonEmpty(row.malli) || nonEmpty(row.sarjanumero));
            if (filled.length === 0) return null;
            return filled.map(({ row, idx }, n) => (
              <SubCard key={idx} title={`Sisäyksikkö ${n + 1}`}>
                <OptionalRow label="Tyyppi" value={row.tyyppi} />
                <OptionalRow label="Malli" value={row.malli} />
                <OptionalRow label="Sarjanumero" value={row.sarjanumero} />
              </SubCard>
            ));
          })()}
        </Section>
      ) : null}
    </div>
  );
}
