export default function VrfWiringGuide() {
  return (
    <div className="vrf-wiring-guide">
      <p>
        Waveshare ESP32-S3-ETH-8DI-8RO -liitännät: <strong>COM</strong>, <strong>DGND</strong>,{' '}
        <strong>DI1…DI8</strong>. Tulot ovat optoeristettyjä (5–36 V). VRF:n statusulostulot ovat
        tyypillisesti <strong>+12 V aktiivinen</strong> (PNP / korkean tason signaali).
      </p>

      <h3>FDC400KXZE2 — suositeltu DI-kytkentä</h3>
      <p>
        Mitsubishi Heavy KX / FDC400KXZE2 antaa ulostuloja <strong>DC 12 V</strong> releen ohjaukseen. Ulkoyksikön
        liitännät (CnS / CnT / CnG — tarkista P07–P10-asetus 7-segmentinäytöstä) voidaan ohjata näin:
      </p>
      <table className="vrf-wiring-table">
        <thead>
          <tr>
            <th>Monitorin DI</th>
            <th>VRF-ulostulo (tehdas/oletus)</th>
            <th>Merkitys</th>
            <th>Logiikka</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>DI4</strong></td>
            <td>Operation output (CnT-2 / ulk. käynti)</td>
            <td>Käyntitieto / laite päällä</td>
            <td>PNP (+12 V = päällä)</td>
          </tr>
          <tr>
            <td><strong>DI2</strong></td>
            <td>Compressor ON output (CnT-4 / ulk. komp.)</td>
            <td>Kompressori käy</td>
            <td>PNP (+12 V = käy)</td>
          </tr>
          <tr>
            <td><strong>DI3</strong></td>
            <td>Fail-safe OK-signaali (ei Error-ulostulo suoraan)</td>
            <td>+12 V = normaali, 0 V = hälytys</td>
            <td>INV (käänteinen)</td>
          </tr>
        </tbody>
      </table>
      <p className="muted vrf-wiring-note">
        Waveshare-optot: +12 V liitännässä → GPIO LOW. Sovellus näyttää <strong>di*_raw</strong>-kentissä
        ulkoisen jännitteen (+12 V = HIGH), ei raaka-GPIO-arvoa.
      </p>
      <p className="muted vrf-wiring-note">
        <strong>Ulk. ohjaus pois:</strong> Kun RO1 katkaisee käyntiluvan (manuaalisesti tai ulkolämpörajasta), FDC400KXZE2 voi
        ottaa status-ulostulot (DI2/DI3/DI4) virrattomiksi. Tämä on normaalia — sovellus ei tulkitse DI-lukuja hälytyksenä
        tai käyntitietona, vaan näyttää oletustilan: kompressori seis, ei hälytystä, käyntitieto pois.
      </p>
      <p className="muted vrf-wiring-note">
        <strong>Tärkeää DI3:lle:</strong> CnT-5 / Inspection (Error) -ulostulo antaa +12 V vain vian sattuessa. Jos DI3
        on kytketty siihen, vaihda Asetukset-välilehdellä DI3 → <strong>PNP</strong>. Nykyinen INV-logiikka sopii
        signaaliin joka on +12 V normaalisti ja putoaa 0 V:hun hälytyksessä.
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
  );
}
