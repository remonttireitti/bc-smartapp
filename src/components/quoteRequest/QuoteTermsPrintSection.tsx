import ToggleSwitch from '../ToggleSwitch';
import {
  DEFAULT_QUOTE_TERMS_PRINT,
  QUOTE_TERMS_PRINT_LABELS,
} from '../../lib/quoteRequest/termatekDefaultTerms';
import type { QuoteRequestData, QuoteTermsPrintFlags } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

const SECTION_ORDER: Array<keyof QuoteTermsPrintFlags> = [
  'baseInstall',
  'warranty',
  'commissioning',
  'operationMaintenance',
  'extraWork',
  'general',
];

export default function QuoteTermsPrintSection({ form, canEdit, onChange }: Props) {
  const flags = form.quoteTermsPrint ?? DEFAULT_QUOTE_TERMS_PRINT;

  function setFlag(key: keyof QuoteTermsPrintFlags, value: boolean) {
    onChange({ quoteTermsPrint: { ...flags, [key]: value } });
  }

  const visibleSections = SECTION_ORDER.filter(
    (key) => key !== 'baseInstall' || form.type === 'ilma-ilma',
  );

  return (
    <section className="form-section">
      <h2>Ehtosivun tuloste</h2>
      <p className="muted">
        Valitse mitkä ehto-osiot sisällytetään tarjouksen ehtosivulle. Kaikki osiot voidaan jättää
        pois — silloin ehtosivua ei tulosteta.
      </p>
      <div className="form-toggle-row quote-terms-print-toggles">
        {visibleSections.map((key) => (
          <ToggleSwitch
            key={key}
            checked={flags[key]}
            onChange={(value) => setFlag(key, value)}
            label={QUOTE_TERMS_PRINT_LABELS[key]}
            disabled={!canEdit}
          />
        ))}
      </div>
    </section>
  );
}
