import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircleFi, CircleFiError, TESTNET_NATIVE, checkTerms } from '../../src/index.js';

const G = 'GAVBYMCRSQOJANSUSLWCGY3WJWO7Z3WWBXSFA3RPITK2WAYMMI3I7FCZ';
const good = { token: TESTNET_NATIVE, contribution: 10_000_000n, roundSeconds: 604800, capacity: 6 };

test('checkTerms() accepts what the factory accepts', () => {
  assert.deepEqual(checkTerms(good), []);
  assert.deepEqual(checkTerms({ ...good, capacity: 3 }), []);
  assert.deepEqual(checkTerms({ ...good, capacity: 24 }), []);
  assert.deepEqual(checkTerms({ ...good, contribution: '1', roundSeconds: '1' }), []);
});

test('checkTerms() names each problem the factory would reject', () => {
  assert.match(checkTerms({ ...good, capacity: 2 })[0], /between 3 and 24/);
  assert.match(checkTerms({ ...good, capacity: 25 })[0], /between 3 and 24/);
  assert.match(checkTerms({ ...good, capacity: 4.5 })[0], /between 3 and 24/);
  assert.match(checkTerms({ ...good, contribution: 0 })[0], /Contribution/);
  assert.match(checkTerms({ ...good, contribution: -5n })[0], /Contribution/);
  assert.match(checkTerms({ ...good, contribution: 1.5 })[0], /Contribution/);
  assert.match(checkTerms({ ...good, contribution: 'ten' })[0], /Contribution/);
  assert.match(checkTerms({ ...good, contribution: 1n << 127n })[0], /Contribution/);
  assert.match(checkTerms({ ...good, roundSeconds: 0 })[0], /Round length/);
  assert.match(checkTerms({ ...good, roundSeconds: 1n << 64n })[0], /Round length/);
  assert.match(checkTerms({ ...good, token: G })[0], /token contract/);
  assert.equal(checkTerms({}).length, 4);
});

test('create() stops bad terms before the wallet is asked', async () => {
  const cf = new CircleFi();
  let invoked = false;
  cf.invoke = async () => { invoked = true; return { value: 'C...' }; };
  const signer = { address: G, signTransaction: async () => ({ signedTxXdr: '' }) };

  await assert.rejects(cf.create(signer, { ...good, capacity: 2 }), (e) => e instanceof CircleFiError && e.code === 2);
  await assert.rejects(cf.create(signer, { ...good, roundSeconds: 0 }), (e) => e instanceof CircleFiError && e.code === 1);
  assert.equal(invoked, false);

  assert.equal(await cf.create(signer, good), 'C...');
  assert.equal(invoked, true);
});
