const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Stock screener has three routes back to NIFTY 50 intraday', () => {
  const html = fs.readFileSync('public/stocks.html', 'utf8');
  assert.match(html, /class="side-link" href="\/" aria-label="Go to NIFTY 50 Intraday dashboard"/);
  assert.match(html, /<a href="\/" aria-label="Back to NIFTY 50 Intraday">/);
  assert.match(html, /class="button button-outline index-return" href="\/"/);
});

test('Index intraday workspace links to constituent stock screener', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.match(html, /href="\/stocks\.html"/);
});
