import CollapsibleSection from '../CollapsibleSection';

export default function VrfWiringGuide() {
  return (
    <CollapsibleSection title="Kytkentäohjeet (DI2–DI4, RO1, COM/DGND)" defaultOpen>
      <div className="vrf-wiring-guide">
        <p>
          Waveshare ESP32-S3-ETH-8DI-8RO -liitännät: <strong>COM</strong>, <strong>DGND</strong>,{' '}
          <strong>DI1…DI8</strong>. Tulot ovat optoeristettyjä (5–36 V). VRF:n statusulostulot ovat
          tyypillisesti <strong>+12 V aktiivinen</strong> (PNP / korkean tason signaali).
        </p>

        <h3>COM ja DGND — minne VRF:n GND?</h3>
        <p>
          <strong>COM</strong> on digitaalitulojen yhteinen liitäntä (valitaan NPN/PNP-tila).{' '}
          <strong>DGND</strong> on signaalipuolen maadoitus.
        </p>
        <p>
          VRF antaa ulos <strong>12 V + signaalijohdin</strong> ja <strong>GND (0 V)</strong>.
          Kytkentä (PNP, suositus):
        </p>
        <ul className="vrf-wiring-steps">
          <li>
            <strong>VRF GND (0 V)</strong> → moduulin <strong>COM</strong> ja <strong>DGND</strong>{' '}
            (sama referenssi; voit hyppylankalla COM–DGND tai yksi GND-jako).
          </li>
          <li>
            <strong>VRF +12 V status</strong> (kun tila ON) → <strong>DI4</strong> (käyntitieto) ja{' '}
            <strong>DI2</strong> (kompressori).
          </li>
          <li>
            <strong>DI3 hälytys</strong>: kytke sama +12 V -signaali — kun jännite on mukana, tila on{' '}
            <strong>normaali</strong>. Hälytys rekisteröidään kun signaali putoaa (0 V).
          </li>
        </ul>

        <div className="vrf-wiring-diagram">
          <pre>{`VRF-ohjain                          Waveshare DI-liitin
──────────                          ────────────────────
Käyntitieto +12 V  ───────────────►  DI4  (laite päällä)
Kompressori +12 V  ───────────────►  DI2  (käy)
Hälytys / OK +12 V ───────────────►  DI3  (normaali; 0 V = hälytys)
GND (0 V)          ───────────────►  COM
                   └──────────────►  DGND`}</pre>
        </div>

        <p className="muted vrf-wiring-note">
          <strong>Huom:</strong> Moduulin oman virtalähteen (7–36 V / RJ45) GND on eri puolella eristystä
          kuin DI-kenttäpuoli. VRF:n GND kytketään <em>vain</em> COM/DGND:hen — ei sekoiteta
          relelähtöihin (RO).
        </p>

        <h3>Signaalikartta</h3>
        <table className="vrf-wiring-table">
          <thead>
            <tr>
              <th>Liitäntä</th>
              <th>GPIO</th>
              <th>VRF-signaali</th>
              <th>Suunta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>RO1</strong></td>
              <td>Rele EXIO1</td>
              <td>Lämmityslupa (webistä ON/OFF)</td>
              <td>Monitori → VRF</td>
            </tr>
            <tr>
              <td><strong>DI4</strong></td>
              <td>GPIO7</td>
              <td>Käyntitieto / laite päällä (+12 V = ON)</td>
              <td>VRF → monitori</td>
            </tr>
            <tr>
              <td><strong>DI2</strong></td>
              <td>GPIO5</td>
              <td>Kompressori (+12 V = käy)</td>
              <td>VRF → monitori</td>
            </tr>
            <tr>
              <td><strong>DI3</strong></td>
              <td>GPIO6</td>
              <td>Hälytys (+12 V = normaali, 0 V = hälytys)</td>
              <td>VRF → monitori</td>
            </tr>
            <tr>
              <td><strong>COM + DGND</strong></td>
              <td>—</td>
              <td>VRF GND (0 V)</td>
              <td>Yhteinen paluu</td>
            </tr>
          </tbody>
        </table>

        <p className="muted">
          DI3 käyttää firmwaressa käänteistä (INV) logiikkaa. DI2 ja DI4 käyttävät PNP-logiikkaa (+12 V =
          päällä). Asetukset-välilehdeltä voi tarkistaa INV/PNP-kytkimet.
        </p>

        <h3>RO1-rele (käyntilupa)</h3>
        <ol className="vrf-wiring-steps">
          <li>RO1 on erillinen relelähtö — ei sama kuin DI-tulot.</li>
          <li>Kytke RO1 VRF:n lämmityspyyntö-/käyntilupapiiriin ohjauksena (kuiva kontakti).</li>
          <li>DI1 jätetään vapaaksi (ei sekoitu RO1-numerointiin).</li>
        </ol>
      </div>
    </CollapsibleSection>
  );
}
