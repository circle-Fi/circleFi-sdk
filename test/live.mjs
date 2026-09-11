/**
 * A smoke test against the deployed testnet factory. Reads only - no wallet,
 * no account, no fee - so it is safe to run in CI on every push.
 */
import assert from 'node:assert/strict';
import { CircleFi, TESTNET, amount, statusOf } from '../src/index.js';

const cf = new CircleFi(TESTNET);

const count = Number(await cf.count());
console.log(`factory ${TESTNET.factoryId}`);
console.log(`circles opened: ${count}`);
assert.ok(count >= 1, 'the factory should have opened at least one circle');

const listings = await cf.list(0, 5);
assert.ok(Array.isArray(listings) && listings.length > 0, 'list() returned nothing');

const first = listings[0];
for (const key of ['address', 'creator', 'token', 'contribution', 'round_seconds', 'capacity']) {
  assert.ok(key in first, `listing is missing ${key}`);
}

const snap = await cf.snapshot(first.address);
const { decimals, symbol } = snap.token;
console.log(
  `${snap.id}\n  ${amount(snap.config.contribution, decimals, symbol)} every ` +
  `${Number(snap.config.round_seconds)}s, ${snap.members.length}/${Number(snap.config.capacity)} seats, ` +
  `${statusOf(snap.state.status)}`,
);

assert.equal(snap.members.length, snap.state.members.length);
assert.ok(Number(snap.config.capacity) >= 3);
assert.ok(BigInt(snap.config.contribution) > 0n);

// The bound view should agree with the unbound calls.
const bound = cf.circle(first.address);
assert.deepEqual(await bound.config(), snap.config);

// Test lazy async iterator over all circles
const iterated = [];
for await (const circle of cf.circles({ pageSize: 1 })) {
  iterated.push(circle);
}
assert.equal(iterated.length, count, 'circles iterator should yield all circles');
assert.equal(iterated[0].address, first.address, 'first iterated circle should match first list entry');

console.log('\nlive read test passed');
