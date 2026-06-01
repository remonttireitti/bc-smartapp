export default function VrfWiringGuide() {
  return (
    <div className="vrf-wiring-guide">
      <p>
        Waveshare ESP32-S3-ETH-8DI-8RO -liitännät: <strong>COM</strong>, <strong>DGND</strong>,{' '}
        <strong>DI1…DI8</strong>. Tulot ovat optoeristettyjä (5–36 V). Mitsubishi Heavy FDC400KXZE2
        käyttää status-ulostuloissaan tyypillisesti <strong>+12 V -kiskoa</strong> ja ohjaa signaalia{' '}
        <strong>GND-puolella</strong> sisäisillä mikroreleillä (sink / NPN-tyyppi).
      </p>

      <h3>Miten opto näkee signaalin</h3>
      <p>
        Opto ei mittaa jännitettä vaan <strong>virtaa</strong>. Virtapiiri:{' '}
        <strong>COM (+12 V)</strong> → opto → <strong>DIx</strong> → VRF:n rele → <strong>GND</strong>.
        Kun rele <strong>sulkee DIx:n GND:hen</strong>, virta kulkee ja tulo on aktiivinen. Kun rele on
        auki, virtaa ei kulje — mittari voi silti näyttää ~12 V DIx–GND välillä, mutta paluu on katkennut.
      </p>
      <p className="muted vrf-wiring-note">
        Sovelluksessa <strong>di*_raw = 1</strong> = virtapiiri suljettu (GND-paluu).{' '}
        <strong>di*_raw = 0</strong> = virtapiiri auki. Tämä ei ole sama kuin “+12 V mittarilla”.
      </p>

      <h3>FDC400KXZE2 — suositeltu DI-kytkentä (GND-suljettu)</h3>
      <p>
        KX / FDC400KXZE2 antaa ulostuloja <strong>DC 12 V</strong> releen ohjaukseen (CnS / CnT / CnG —
        tarkista P07–P10). Kytkentä:
      </p>
      <table className="vrf-wiring-table">
        <thead>
          <tr>
            <th>Monitorin DI</th>
            <th>VRF-ulostulo (tehdas/oletus)</th>
            <th>Merkitys</th>
            <th>Logiikka (asetukset)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>DI4</strong></td>
            <td>Operation output (CnT-2 / ulk. käynti)</td>
            <td>Käyntitieto / laite päällä</td>
            <td>PNP (suljettu = päällä)</td>
          </tr>
          <tr>
            <td><strong>DI2</strong></td>
            <td>Compressor ON output (CnT-4 / ulk. komp.)</td>
            <td>Kompressori käy</td>
            <td>PNP (suljettu = käy)</td>
          </tr>
          <tr>
            <td><strong>DI3</strong></td>
            <td>Fail-safe OK-signaali (ei Error-ulostulo suoraan)</td>
            <td>GND-paluu suljettu = normaali</td>
            <td>INV (auki = hälytys)</td>
          </tr>
        </tbody>
      </table>

      <h3>COM ja DGND</h3>
      <ul className="vrf-wiring-steps">
        <li>
          <strong>VRF +12 V</strong> (yhteinen status-kisko) → moduulin <strong>COM</strong>
        </li>
        <li>
          <strong>VRF GND</strong> → moduulin <strong>DGND</strong> (yhteinen paluu; COM ja DGND sama
          referenssi VRF:n kanssa)
        </li>
        <li>
          Jokainen status-releen <strong>NO-kontakti</strong>: yksi pää <strong>DIx</strong>:ään, toinen
          VRF:n GND-puolelle (tai sisäinen GND-sulku releellä). Kun tila ON, rele vetää{' '}
          <strong>DIx → GND</strong>.
        </li>
        <li>
          <strong>DI3 hälytys</strong>: fail-safe — normaalisti GND-paluu suljettu (raw=1). Hälytys kun
          paluu katkeaa (raw=0).
        </li>
      </ul>

      <div className="vrf-wiring-diagram">
        <pre>{`VRF-ohjain (MH)                    Waveshare DI
──────────────                    ──────────────
+12 V (yhteinen kisko)  ───────►  COM
GND                     ───────►  DGND

Käyntitieto-rele  ──► DI4 ──► GND  (kun ON: sulku)
Kompressori-rele  ──► DI2 ──► GND  (kun käy: sulku)
Hälytys/OK-rele   ──► DI3 ──► GND  (normaali: sulku; auki = hälytys)`}</pre>
      </div>

      <p className="muted vrf-wiring-note">
        <strong>Käyntilupa pois (RO1):</strong> Lämmitysrele katkaistaan, mutta DI2/DI3/DI4 luetaan aina
        sellaisenaan kuin VRF antaa (status-releet). Jos kaikki optot ovat auki, kisko on todennäköisesti
        irrallaan.
      </p>
      <p className="muted vrf-wiring-note">
        <strong>DI3 ja Error-ulostulo:</strong> CnT-5 / Inspection (Error) sulkee GND vain vian sattuessa.
        Jos DI3 on kytketty siihen, vaihda Asetuksissa DI3 → <strong>PNP</strong> (suljettu = hälytys).
        INV sopii fail-safe -signaaliin (suljettu = normaali).
      </p>
      <p className="muted vrf-wiring-note">
        <strong>Huom:</strong> Moduulin oman virtalähteen GND on eristetty DI-kenttäpuolesta. VRF:n GND
        kytketään vain COM/DGND:hen — ei sekoiteta RO-releisiin.
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
            <td>Lämmityslupa (kuiva kontakti, GND-puoli)</td>
            <td>Monitori → VRF</td>
          </tr>
          <tr>
            <td><strong>DI4</strong></td>
            <td>GPIO7</td>
            <td>Käyntitieto (GND suljettu = ON)</td>
            <td>VRF → monitori</td>
          </tr>
          <tr>
            <td><strong>DI2</strong></td>
            <td>GPIO5</td>
            <td>Kompressori (GND suljettu = käy)</td>
            <td>VRF → monitori</td>
          </tr>
          <tr>
            <td><strong>DI3</strong></td>
            <td>GPIO6</td>
            <td>Hälytys (INV: auki = hälytys)</td>
            <td>VRF → monitori</td>
          </tr>
          <tr>
            <td><strong>COM</strong></td>
            <td>—</td>
            <td>VRF +12 V</td>
            <td>Yhteinen plus</td>
          </tr>
          <tr>
            <td><strong>DGND</strong></td>
            <td>—</td>
            <td>VRF GND</td>
            <td>Yhteinen paluu</td>
          </tr>
        </tbody>
      </table>

      <p className="muted">
        Oletusasetukset: DI2 ja DI4 <strong>PNP</strong> (di_raw=1 = päällä), DI3 <strong>INV</strong>{' '}
        (di_raw=0 = hälytys). Tarkista INV/PNP Asetukset-välilehdeltä kytkentämuutoksen jälkeen.
      </p>

      <h3>RO1-rele (käyntilupa)</h3>
      <ol className="vrf-wiring-steps">
        <li>RO1 on erillinen relelähtö — sama periaate: kuiva kontakti VRF:n käyntilupa-piirissä.</li>
        <li>Usein VRF odottaa, että ulkoinen ohjaus <strong>sulkee GND-puolen</strong> (tai katkaisee sen).</li>
        <li>Kytke RO1 VRF:n lämmityspyyntö-/käyntilupapiiriin ohjauksena.</li>
        <li>DI1 jätetään vapaaksi (ei sekoitu RO1-numerointiin).</li>
      </ol>

      <h3>Mittaus vianetsintään</h3>
      <ul className="vrf-wiring-steps">
        <li>
          <strong>COM–DGND</strong>: ~12 V (aina, kun VRF syöttää kiskoa)
        </li>
        <li>
          <strong>DIx–DGND</strong>, rele auki: usein ~12 V, <em>ei virtaa optoon</em> → di_raw=0
        </li>
        <li>
          <strong>DIx–DGND</strong>, rele sulkenut GND: lähellä 0 V, virta kulkee → di_raw=1
        </li>
      </ul>
    </div>
  );
}
