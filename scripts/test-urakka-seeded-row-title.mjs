import assert from 'node:assert/strict';
import { emptyExpense, expenseRowSectionTitle } from '../src/lib/dailyLogExpenseDraft.ts';
const row = { ...emptyExpense(), expense_type: 'material', description: 'Huoltotarvikkeet', qty: '30', unit_price: '0', bill_to_partner: false, bill_to_customer: false };
for (const ctx of [{ linkedQuoteRequest: true }, { linkedQuoteRequest: false }, null]) {
  const title = expenseRowSectionTitle(row, true, true, ctx);
  const n = (title.match(/kuuluu urakkaan · suora kulu/g) ?? []).length;
  assert.ok(n <= 1, `teksti toistuu (${JSON.stringify(ctx)}): ${title}`);
  if (ctx?.linkedQuoteRequest) assert.ok(n === 1, `puuttuu: ${title}`);
}
console.log(expenseRowSectionTitle(row, true, true, { linkedQuoteRequest: true }));
console.log('urakka-seeded-row-title: ok');
