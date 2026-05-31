import CollapsibleSection from '../CollapsibleSection';

export default function VrfWiringGuide() {
  return (
    <CollapsibleSection title="Kytkentäohjeet (DI1–DI3)" defaultOpen={false}>
      <div className="vrf-wiring-guide">
        <p>
          VRF-ohjain antaa ulos <strong>12 V DC</strong> -signaalit. Waveshare ESP32-S3-ETH-8DI-8RO -moduulin
          digitaalitulot (DI) ovat optoeristettyjä: kun 12 V syötetään tuloon, firmware lukee signaalin
          aktiiviseksi.
        </p>

        <table className="vrf-wiring-table">
          <thead>
            <tr>
              <th>Tulo</th>
              <th>GPIO</th>
              <th>Signaali VRF:stä</th>
              <th>Merkitys UI:ssa</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>DI1</strong></td>
              <td>GPIO4</td>
              <td>Laite päällä / valmiustilassa</td>
              <td>12 V = laite käynnissä tai valmiustilassa</td>
            </tr>
            <tr>
              <td><strong>DI2</strong></td>
              <td>GPIO5</td>
              <td>Kompressorin tila</td>
              <td>12 V = kompressori käynnissä</td>
            </tr>
            <tr>
              <td><strong>DI3</strong></td>
              <td>GPIO6</td>
              <td>Hälytys</td>
              <td>12 V = ulkoinen hälytys aktiivinen (sammuttaa lämmityksen)</td>
            </tr>
          </tbody>
        </table>

        <h3>Kytkentä Waveshare-moduuliin</h3>
        <ol className="vrf-wiring-steps">
          <li>
            Kytke VRF-ohjaimen <strong>12 V+</strong> ja <strong>GND</strong> vastaavasti Waveshare DI -liittimen
            <strong> +</strong> ja <strong>−</strong> -nappeihin (DI1, DI2 tai DI3).
          </li>
          <li>
            Käytä erillistä johdinta kullekin signaalille — älä jaa samaa DI-tuloa usealle signaalille.
          </li>
          <li>
            Varmista yhteinen massa (GND) VRF-ohjaimen ja monitorointimoduulin välillä.
          </li>
          <li>
            Lämmityksen käyntilupa (rele RO1) on erillinen ohjaus: se sallii lämmityksen, kun käyttäjä kytkee
            <strong> Käyntiluvan ON</strong> web-käyttöliittymässä.
          </li>
        </ol>

        <p className="muted vrf-wiring-note">
          DI-signaalit ovat vain lukutilaa (VRF → monitori). Käyntilupa ohjaa relettä monitorista VRF:ään päin.
          Tarkista VRF-ohjaimen dokumentaatiosta, mitkä liitännät antavat 12 V valmiustila-, kompressori- ja
          hälytystiedot.
        </p>
      </div>
    </CollapsibleSection>
  );
}
