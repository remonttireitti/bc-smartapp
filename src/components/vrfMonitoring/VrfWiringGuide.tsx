import CollapsibleSection from '../CollapsibleSection';

export default function VrfWiringGuide() {
  return (
    <CollapsibleSection title="Kytkentäohjeet (DI2–DI4, RO1)" defaultOpen={false}>
      <div className="vrf-wiring-guide">
        <p>
          <strong>RO1</strong> (relelähtö 1) = monitorin lämmityslupa VRF:ään (ohjaus ulos).{' '}
          <strong>DI4/DI2/DI3</strong> = VRF:n 12 V -palaute monitoriin (lukutila). Nämä eivät ole sama
          signaali — RO1 voi olla päällä ja DI4 pois, jos VRF on pysähtynyt hälytyksestä.
        </p>

        <table className="vrf-wiring-table">
          <thead>
            <tr>
              <th>Liitäntä</th>
              <th>GPIO</th>
              <th>Signaali</th>
              <th>Suunta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>RO1</strong></td>
              <td>TCA9554 EXIO1</td>
              <td>Lämmityslupa (käyntilupa webistä)</td>
              <td>Monitori → VRF</td>
            </tr>
            <tr>
              <td><strong>DI4</strong></td>
              <td>GPIO7</td>
              <td>Laite päällä / valmiustila</td>
              <td>VRF → monitori</td>
            </tr>
            <tr>
              <td><strong>DI2</strong></td>
              <td>GPIO5</td>
              <td>Kompressori käynnissä</td>
              <td>VRF → monitori</td>
            </tr>
            <tr>
              <td><strong>DI3</strong></td>
              <td>GPIO6</td>
              <td>Hälytys</td>
              <td>VRF → monitori</td>
            </tr>
          </tbody>
        </table>

        <h3>Kytkentä Waveshare-moduuliin</h3>
        <ol className="vrf-wiring-steps">
          <li>
            Kytke VRF-ohjaimen 12 V -palautesignaalit DI4, DI2 ja DI3 -tuloihin (+ ja −).
          </li>
          <li>RO1-rele kytketään VRF:n lämmityspyyntö-/käyntilupapiiriin erikseen (ohjaus, ei palaute).</li>
          <li>Yhteinen GND VRF:n ja monitorin välillä.</li>
          <li>DI1 jätetään vapaaksi — ei sekoitu RO1-releen kanssa.</li>
        </ol>
      </div>
    </CollapsibleSection>
  );
}
