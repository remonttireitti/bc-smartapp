import assert from 'node:assert/strict';
import { QUOTE_DRAFT_DELETE_DENIED_MESSAGE } from '../src/lib/deleteQuoteRequest.ts';

assert.equal(
  QUOTE_DRAFT_DELETE_DENIED_MESSAGE,
  'Luonnoksen poisto epäonnistui — tarkista oikeudet.',
);

console.log('test-delete-quote-request: ok');
