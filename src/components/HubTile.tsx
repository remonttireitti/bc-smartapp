import { Link } from 'react-router-dom';

export type HubTileData = {
  title: string;
  /** 1–3 lyhyttä riviä */
  lines: string[];
  href: string;
  color: string;
  icon?: string;
  menuPath?: string;
};

/** Rauhallinen ruutu: valkoinen kortti, värillinen vasen reuna, otsikko + lyhyet rivit. */
export default function HubTile({ tile }: { tile: HubTileData }) {
  return (
    <Link to={tile.href} className="tile tile-calm hub-tile" style={{ borderLeftColor: tile.color }}>
      {tile.menuPath ? <span className="tile-menu-path">{tile.menuPath}</span> : null}
      <span className="hub-tile-head">
        {tile.icon ? <span className="hub-tile-icon" aria-hidden="true" style={{ color: tile.color }}>{tile.icon}</span> : null}
        <strong>{tile.title}</strong>
      </span>
      <ul className="hub-tile-lines">
        {tile.lines.slice(0, 3).map((l) => <li key={l}>{l}</li>)}
      </ul>
    </Link>
  );
}

export function HubTileGrid({ tiles }: { tiles: HubTileData[] }) {
  return (
    <section className="grid hub-grid">
      {tiles.map((t) => <HubTile key={t.title} tile={t} />)}
    </section>
  );
}
