import { formatEur, type PriceEstimate } from '../lib/companySignup';

/** Kuukausihinta riveittäin + yhteensä alv 0 % ja sis. alv 25,5 %. */
export default function PriceEstimateTable({ estimate, title = 'Kuukausihinta' }: { estimate: PriceEstimate; title?: string }) {
  return (
    <table className="price-estimate-table">
      <caption>{title}</caption>
      <tbody>
        {estimate.lines.map((l) => (
          <tr key={l.key}>
            <td>{l.label}{l.qty > 1 ? ` × ${l.qty}` : ''}</td>
            <td className="num">{formatEur(l.total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th>Yhteensä alv 0 %</th>
          <th className="num">{formatEur(estimate.net)}/kk</th>
        </tr>
        <tr className="muted">
          <td>Sis. alv 25,5 %</td>
          <td className="num">{formatEur(estimate.gross)}/kk</td>
        </tr>
      </tfoot>
    </table>
  );
}
