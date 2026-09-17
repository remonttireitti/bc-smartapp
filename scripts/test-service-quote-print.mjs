import assert from 'node:assert/strict';
import {
  serviceQuoteExpensesSellTotal,
  serviceQuoteSuppliesSellTotal,
} from '../src/lib/quoteRequest/servicePrintRows.ts';
import {
  excludedFromQuotePrintHtml,
  serviceOptionalItemsPrintHtml,
} from '../src/lib/quoteRequest/serviceQuotePrintExtras.ts';
import { createEmptyBulletItem } from '../src/lib/quoteRequest/defaults.ts';
import { buildWorkReportPayloadFromQuote } from '../src/lib/quoteRequest/createWorkReportFromQuote.ts';

const baseData = {
  type: 'huolto',
  quoteVatProfile: 'business',
  vatRate: 0,
  introText: 'Ilmalämpöpumpun huolto',
  faultDescription: 'Vuosihuolto',
  workItems: [
    {
      id: 'w1',
      description: 'Huolto',
      hours: 2,
      pricePerHour: 60,
      materials: [
        {
          id: 'm1',
          name: 'Suodatin',
          quantity: 1,
          purchasePrice: 10,
          marginPercent: 20,
          sellPrice: 12,
        },
      ],
    },
  ],
  installationSupplies: [
    {
      id: 's1',
      name: 'Putki',
      quantity: 2,
      purchasePrice: 5,
      marginPercent: 20,
      sellPrice: 6,
      rowKind: 'supply',
    },
    {
      id: 'e1',
      name: 'Matka',
      quantity: 1,
      purchasePrice: 40,
      marginPercent: 0,
      sellPrice: 50,
      rowKind: 'expense',
    },
  ],
  materials: [],
  optionalItems: [
    { id: 'o1', description: 'Desinfiointi', priceGross: 80, enabled: true },
  ],
  excludedFromQuoteItems: [createEmptyBulletItem({ text: 'Öljyn hävitys' })],
};

assert.equal(serviceQuoteSuppliesSellTotal(baseData), 24);
assert.equal(serviceQuoteExpensesSellTotal(baseData), 50);

assert.match(excludedFromQuotePrintHtml(baseData), /Ei kuulu tarjoukseen/);
assert.match(excludedFromQuotePrintHtml(baseData), /Öljyn hävitys/);
assert.match(serviceOptionalItemsPrintHtml(baseData), /Tilattavissa lisänä/);
assert.match(serviceOptionalItemsPrintHtml(baseData), /Desinfiointi/);

const payload = buildWorkReportPayloadFromQuote({
  quote: {
    id: 'q1',
    title: 'Vanha otsikko',
    data: baseData,
    customer_id: null,
    owner_company_id: 'c1',
    created_by_company_id: 'c1',
    branding_company_id: 'c1',
    partnership_id: null,
    subscriber_id: null,
  },
  customer: { name: 'Testi Oy' },
  sessionUserId: 'u1',
});
assert.equal(payload.title, 'Ilmalämpöpumpun huolto');
assert.equal(payload.heading, 'Ilmalämpöpumpun huolto');

console.log('test-service-quote-print: ok');
