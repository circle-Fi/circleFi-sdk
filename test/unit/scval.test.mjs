import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scValToNative } from '@stellar/stellar-sdk';
import { addr, i128, u32, u64 } from '../../src/index.js';

const G = 'GAVBYMCRSQOJANSUSLWCGY3WJWO7Z3WWBXSFA3RPITK2WAYMMI3I7FCZ';
const C = 'CCJRXTYIEFE6Z7DGTAKRGBLOGYBZNOONHI7FWZUDXEKZ7LGEGZNXKG3M';

test('addr() encodes account and contract addresses', () => {
  assert.equal(addr(G).type, 'scvAddress');
  assert.equal(scValToNative(addr(G)), G);
  assert.equal(scValToNative(addr(C)), C);
  assert.throws(() => addr('not-an-address'));
});

test('integer encoders use the types the contract expects', () => {
  assert.equal(u32(3).type, 'scvU32');
  assert.equal(u64(604800).type, 'scvU64');
  assert.equal(i128(5n).type, 'scvI128');
});

test('integer encoders round-trip, including values past 2^53', () => {
  assert.equal(scValToNative(u32('24')), 24);
  assert.equal(scValToNative(u64(2n ** 60n)), 2n ** 60n);
  assert.equal(scValToNative(i128(10n ** 30n)), 10n ** 30n);
  assert.equal(scValToNative(i128('10000000')), 10_000_000n);
});
