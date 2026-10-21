import { EXAMPLE_PRINTS, examplePrintHref } from '../lib/examplePrints';

/** Staattiset esittelysivut (public/esittely, scripts/generate-esittely.mjs). */
const DEMO_PAGES = [
  { href: '/esittely/tyoraportti/', title: 'Työraportti', line: 'Kirjaukset, tunnit ja tarvikkeet', color: '#F0810F' },
  { href: '/esittely/huoltopoytakirja/', title: 'Huoltopöytäkirja', line: 'Ilmalämpöpumpun huolto', color: '#0ea5e9' },
  { href: '/esittely/laitekortti/', title: 'Laitekortti', line: 'Laitetiedot ja huoltohistoria', color: '#14b8a6' },
  { href: '/esittely/asiakasportaali/', title: 'Asiakasportaali', line: 'Asiakkaan oma näkymä', color: '#8b5cf6' },
  { href: '/esittely/tarjoukset/', title: 'Tarjoukset ja laskennat', line: 'Tarjous ja mitoituslaskenta', color: '#22c55e' },
] as const;

/** Etusivun "Esimerkkitulosteet": avautuvat uuteen välilehteen. */
export default function LandingExamplePrints() {
  return (
    <section id="esimerkit" className="landing-section">
      <h2>Esimerkkitulosteet</h2>
      <p className="landing-section-lead muted">Kaikki lomakkeet ja raporttien tulosteet voidaan räätälöidä tilaajan toiveiden mukaan.</p>
      <div className="grid hub-grid landing-prints">
        {EXAMPLE_PRINTS.map((p) => (
          <a
            key={p.key}
            href={examplePrintHref(p.key)}
            target="_blank"
            rel="noopener"
            className="tile tile-calm hub-tile"
            style={{ borderLeftColor: p.color }}
          >
            <span className="hub-tile-head">
              <strong>{p.title}</strong>
            </span>
            <ul className="hub-tile-lines">
              {p.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </a>
        ))}
      </div>
      <h3>Esittely</h3>
      <div className="grid hub-grid landing-prints">
        {DEMO_PAGES.map((p) => (
          <a key={p.href} href={p.href} className="tile tile-calm hub-tile" style={{ borderLeftColor: p.color }}>
            <span className="hub-tile-head">
              <strong>{p.title}</strong>
            </span>
            <ul className="hub-tile-lines">
              <li>{p.line}</li>
            </ul>
          </a>
        ))}
      </div>
    </section>
  );
}
