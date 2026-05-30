interface Props {
  deviceKey?: string | null;
  compact?: boolean;
}

export default function TempApSetupGuide({ deviceKey, compact = false }: Props) {
  return (
    <div className="temp-ap-guide">
      <p className="muted">
        Käytä kenttäasennuksessa, kun laitteessa ei ole vielä tallennettua WiFi-verkkoa tai yhteys asiakkaan
        verkkoon epäonnistuu.
      </p>
      <ol className="temp-ap-steps">
        <li>Pyyhkäise laitteen näytöllä WiFi-sivulle.</li>
        <li>
          Paina <strong>Asennus AP</strong>. Laite avaa verkon <code>TempMon-XXXX</code> — tarkka nimi näkyy
          näytöllä.
        </li>
        <li>Yhdistä puhelimella tai tabletilla avoimeen verkkoon.</li>
        <li>
          Avaa selaimessa osoite <strong>192.168.4.1</strong> (captive portal voi avata sivun automaattisesti).
        </li>
        <li>
          Valitse asiakkaan WiFi, syötä salasana
          {deviceKey ? (
            <>
              {' '}
              ja pilviavain <code className="temp-device-key temp-device-key--inline">{deviceKey}</code>
            </>
          ) : (
            <> ja 12-numeroinen pilviavain (web-sovelluksesta)</>
          )}
          .
        </li>
        <li>Tallenna — laite yhdistää verkkoon ja sulkee AP-tilan.</li>
      </ol>
      {!compact && (
        <p className="muted temp-ap-note">
          Jos tallennettuja verkkoja ei ole, laite käynnistää AP-asennuksen automaattisesti. Jos automaattinen
          yhteys epäonnistuu, AP avautuu uudelleen.
        </p>
      )}
    </div>
  );
}
