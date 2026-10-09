import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amount, duration, remaining, short, statusOf, toUnits } from '../../src/format.js';

test('amount() prints integer token units without float drift', () => {
  assert.equal(amount(10_000_000n, 7, 'XLM'), '1 XLM');
  assert.equal(amount(12_345_678n, 7, 'XLM'), '1.2345678 XLM');
  assert.equal(amount(5n, 7, 'XLM'), '0.0000005 XLM');
  assert.equal(amount(-15_000_000n, 7, 'XLM'), '-1.5 XLM');
  assert.equal(amount('2500000', 6, 'USDC'), '2.5 USDC');
  assert.equal(amount(42n, 0, 'PTS'), '42 PTS');
  assert.equal(amount(undefined, 7, 'XLM'), '0 XLM');
});

test('toUnits() parses what a person typed into exact units', () => {
  assert.equal(toUnits('1', 7), 10_000_000n);
  assert.equal(toUnits('0.1', 7), 1_000_000n);
  assert.equal(toUnits(' 2.5 ', 7), 25_000_000n);
  assert.equal(toUnits('.5', 7), 5_000_000n);
  assert.equal(toUnits('3.', 7), 30_000_000n);
  assert.equal(toUnits('0.0000001', 7), 1n);
  assert.equal(toUnits('7', 0), 7n);
});

test('toUnits() rejects input it cannot represent exactly', () => {
  for (const bad of ['', '.', 'abc', '-1', '1e3', '1.2.3', '0.00000001']) {
    assert.equal(toUnits(bad, 7), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('amount() and toUnits() round-trip', () => {
  for (const text of ['1', '0.5', '123.4567891', '0.0000001']) {
    assert.equal(amount(toUnits(text, 7), 7, 'XLM'), `${text} XLM`);
  }
});

test('duration() picks the largest whole unit', () => {
  assert.equal(duration(86400), 'a day');
  assert.equal(duration(604800), '7 days');
  assert.equal(duration(3600), 'an hour');
  assert.equal(duration(7200), '2 hours');
  assert.equal(duration(300), '5 min');
  assert.equal(duration(90), '90s');
});

test('remaining() counts down to the end of a round', () => {
  const now = 1_000_000;
  assert.equal(remaining(now, now), 'the window has closed');
  assert.equal(remaining(now - 5, now), 'the window has closed');
  assert.equal(remaining(now + 61, now), '2 min left');
  assert.equal(remaining(now + 3 * 3600 + 5, now), '3 h left');
  assert.equal(remaining(BigInt(now + 2 * 86400 + 1), now), '2 d left');
});

test('short() abbreviates addresses', () => {
  assert.equal(short('GAVBYMCRSQOJANSUSLWCGY3WJWO7Z3WWBXSFA3RPITK2WAYMMI3I7FCZ'), 'GAVBY...I7FCZ');
  assert.equal(short(''), '');
  assert.equal(short(undefined), '');
});

test('statusOf() maps the contract enum and defaults to forming', () => {
  assert.equal(statusOf(0), 'forming');
  assert.equal(statusOf(1), 'active');
  assert.equal(statusOf(2n), 'complete');
  assert.equal(statusOf(9), 'forming');
});
