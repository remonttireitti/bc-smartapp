import { EXAMPLE_PRINTS, examplePrintHref } from '../lib/examplePrints';

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
    </section>
  );
}
