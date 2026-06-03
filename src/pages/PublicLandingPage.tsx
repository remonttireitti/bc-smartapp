import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '📋',
    title: 'Työraportit ja kalenteri',
    desc: 'Työtilaukset, päiväkirjat, kuvat ja aikataulu yhdessä näkymässä. Kumppanille tai omalle tekijälle — selkeästi.',
    color: '#0ea5e9',
  },
  {
    icon: '🔧',
    title: 'Huoltoraportit',
    desc: 'Huoltopöytäkirjat, mittaukset ja laiterekisteri. Valmis raportti asiakkaalle tai tilaajalle hetkessä.',
    color: '#22c55e',
  },
  {
    icon: '🌡️',
    title: 'Lämpötilojen etäseuranta ja etäohjaus',
    desc: 'Reaaliaikaiset mittaukset, hälytykset ja trendit kohteittain. Etäohjaus ja lämpötilaraportit linkitettynä asiakkaaseen ja laiterekisteriin.',
    color: '#06b6d4',
  },
  {
    icon: '💶',
    title: 'Tarjoukset ja laskutus',
    desc: 'Tarjouspyynnöt, pumpputarjoukset ja kumppani-/asiakaslaskutus samassa järjestelmässä.',
    color: '#f97316',
  },
  {
    icon: '🏢',
    title: 'Moniyritys ja kumppanuudet',
    desc: 'Usea yritys, jaetut asiakkaat ja toimeksiannot kumppaneille — ilman sekavaa sähköpostiketjua.',
    color: '#6366f1',
  },
  {
    icon: '👥',
    title: 'Tilaaja- ja asiakasportaali',
    desc: 'Tilaaja lähettää työtilauksen, näkee valmiit raportit ja kohteet. Palveluyritys hallitsee kaiken.',
    color: '#3b82f6',
  },
  {
    icon: '📦',
    title: 'Varasto ja työkalut',
    desc: 'Materiaalit, kylmäaine ja työkaluinventaario linkitettynä työhön ja laskutukseen.',
    color: '#a855f7',
  },
];

const BENEFITS = [
  'Vähemmän kadotettua tietoa — luonnokset tallentuvat automaattisesti',
  'Lämpötilahälytykset, trendit ja etäohjaus samassa rekisterissä kuin työt',
  'Selkeä ketju: tilaus → työ → raportti → lasku',
  'Yksi paikka koko tiimille ja kumppaneille',
  'Toimii puhelimella ja tietokoneella selaimessa',
  'Suomenkielinen käyttöliittymä LV- ja kiinteistöpalveluille',
];

const PRAISE = [
  {
    quote: 'Työtilaukset tilaajalta tulevat suoraan kalenteriin — ei enää viestejä eri kanavissa.',
    who: 'Palveluyrityksen työnjohto',
  },
  {
    quote: 'Kumppanille lähetetty toimeksianto ja laskutus samassa järjestelmässä säästää tunteja viikossa.',
    who: 'LV-alan yrittäjä',
  },
  {
    quote: 'Huoltoraportti ja tarjous samassa rekisterissä — asiakas saa ammattimaisen tulosteen.',
    who: 'Huolto- ja asennustiimi',
  },
];

export default function PublicLandingPage() {
  return (
    <div className="public-landing">
      <header className="landing-header">
        <Link to="/" className="landing-brand">
          <span className="landing-brand-icon" aria-hidden="true">
            🏢
          </span>
          <span>BC Smartapp</span>
        </Link>
        <Link to="/login" className="btn btn-primary landing-header-cta">
          Kirjaudu sisään
        </Link>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <p className="landing-eyebrow">LV- ja kiinteistöpalveluiden työnhallinta</p>
          <h1>
            Kaikki työt, raportit ja laskutus
            <span className="landing-hero-accent"> yhdessä sovelluksessa</span>
          </h1>
          <p className="landing-hero-lead">
            BC Smartapp on rakennettu yrityksille, jotka tekevät työtä usealle asiakkaalle — omilla
            tekijöillä, kumppaneiden kanssa ja tilaajien kautta. Työt, raportit, laskutus sekä
            lämpötilojen etäseuranta ja etäohjaus samassa järjestelmässä. Selkeämpi arki, vähemmän
            välikäsiä, enemmän billableaikaa.
          </p>
          <div className="landing-hero-actions">
            <Link to="/login" className="btn btn-primary landing-btn-lg">
              Aloita kirjautumalla
            </Link>
            <a href="#ominaisuudet" className="btn btn-secondary landing-btn-lg">
              Katso ominaisuudet
            </a>
          </div>
        </div>
      </section>

      <section id="ominaisuudet" className="landing-section">
        <h2>Miksi BC Smartapp?</h2>
        <p className="landing-section-lead muted">
          Ei irrallisia Excel-taulukoita, viestiketjuja ja paperilappuja — vaan yksi totuus koko
          organisaatiolle.
        </p>
        <div className="landing-features">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="landing-feature-card"
              style={{ borderTopColor: feature.color }}
            >
              <span className="landing-feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h3>{feature.title}</h3>
              <p className="muted">{feature.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-benefits">
        <div className="landing-benefits-grid">
          <div>
            <h2>Mitä hyötyä liittymisestä?</h2>
            <p className="muted">
              Kun koko ketju on samassa järjestelmässä, vähenee virheitä ja viiveitä. Asiakas ja
              tilaaja näkevät valmiin työn — sinä hallitset keskeneräiset luonnokset ja aikataulun.
            </p>
          </div>
          <ul className="landing-benefit-list">
            {BENEFITS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-section">
        <h2>Mitä käyttäjät sanovat</h2>
        <div className="landing-praise">
          {PRAISE.map((item) => (
            <blockquote key={item.who} className="landing-praise-card">
              <p>“{item.quote}”</p>
              <footer className="muted">— {item.who}</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="landing-section landing-cta-panel">
        <h2>Kannattaa liittyä — koko tiimi samalle linjalle</h2>
        <p className="muted landing-cta-text">
          Palveluyritys, kumppani, tilaaja tai asiakas: jokaisella on oma näkymänsä, mutta data on
          yhteistä. Liity mukaan ja vie työnhallinta seuraavalle tasolle.
        </p>
        <Link to="/login" className="btn btn-primary landing-btn-lg">
          Kirjaudu ja aloita
        </Link>
      </section>

      <footer className="landing-footer muted">
        BC Smartapp — moniyritys, kumppanuudet ja portaalit
      </footer>
    </div>
  );
}
