import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scValToNative } from '@stellar/stellar-sdk';
import { CircleFi, CircleFiError, FACTORY_ERRORS, MAX_PAGE, explain } from '../../src/index.js';

/** A CircleFi whose reads are answered locally from a fake index of n circles. */
function withIndex(n) {
  const cf = new CircleFi();
  const calls = [];
  const newestFirst = Array.from({ length: n }, (_, i) => ({ address: `C${i}` })).reverse();
  cf.read = async (id, method, args = []) => {
    calls.push(method);
    if (method === 'count') return n;
    if (method === 'list') {
      const [offset, limit] = args.map((a) => Number(scValToNative(a)));
      assert.ok(limit <= MAX_PAGE, 'the SDK asked for a page the factory would refuse');
      return newestFirst.slice(offset, offset + limit);
    }
    throw new Error(`unexpected ${method}`);
  };
  return { cf, calls };
}

test('factory error #3 is about page size, not a circle that has started', () => {
  assert.equal(
    explain({ message: 'Error(Contract, #3)' }, FACTORY_ERRORS),
    'Asked for more than 50 circles in one page',
  );
});

test('the factory is the one contract that uses the factory error table', () => {
  const cf = new CircleFi();
  assert.equal(cf._errors(cf.factoryId), FACTORY_ERRORS);
  assert.notEqual(cf._errors('CBV6IG53JF7WIINUBJS27YUCPCWUJM5EUSOWQKH7FKQLENKUR6Y2MA6Y'), FACTORY_ERRORS);
});

test('list() refuses a page the factory would reject, without a network call', async () => {
  const { cf, calls } = withIndex(3);
  await assert.rejects(cf.list(0, MAX_PAGE + 1), (e) => e instanceof CircleFiError && e.code === 3);
  await assert.rejects(cf.list(0, 0), CircleFiError);
  await assert.rejects(cf.list(-1, 10), CircleFiError);
  await assert.rejects(cf.list(1.5, 10), CircleFiError);
  assert.deepEqual(calls, []);
});

test('listAll() pages through the whole index, newest first', async () => {
  const { cf, calls } = withIndex(123);
  const all = await cf.listAll();
  assert.equal(all.length, 123);
  assert.equal(all[0].address, 'C122');
  assert.equal(all.at(-1).address, 'C0');
  assert.equal(new Set(all.map((c) => c.address)).size, 123, 'no circle should appear twice');
  assert.deepEqual(calls, ['count', 'list', 'list', 'list']);
});

test('listAll() stops at max and handles an empty factory', async () => {
  assert.equal((await withIndex(123).cf.listAll({ max: 60 })).length, 60);
  assert.deepEqual(await withIndex(0).cf.listAll(), []);
});
