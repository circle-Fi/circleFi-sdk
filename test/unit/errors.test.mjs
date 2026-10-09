import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CIRCLE_ERRORS, CircleFiError, contractErrorCode, explain } from '../../src/index.js';

test('every contract error code has a sentence', () => {
  for (let code = 1; code <= 11; code++) {
    assert.equal(typeof CIRCLE_ERRORS[code], 'string', `missing text for #${code}`);
  }
});

test('explain() turns a contract error into its sentence', () => {
  const sim = { message: 'HostError: Error(Contract, #8)\n\nEvent log (newest first): ...' };
  assert.equal(explain(sim), 'You have already contributed to this round');
  assert.equal(explain({ message: 'Error(Contract, #2)' }), 'Circle size must be between 3 and 24');
});

test('explain() finds the code inside a nested object too', () => {
  const nested = { status: 'FAILED', diagnostic: { error: 'Error(Contract, #6)' } };
  assert.equal(explain(nested), 'You are not a member of this circle');
});

test('explain() recognises balance, trustline and missing-account failures', () => {
  assert.match(explain(new Error('balance is not sufficient to spend')), /Not enough of that token/);
  assert.match(explain(new Error('trustline entry is missing for account')), /add a trustline/);
  assert.match(explain(new Error('Account not found: GABC')), /does not exist on this network/);
});

test('explain() passes an unknown error through and keeps a CircleFiError as is', () => {
  assert.equal(explain(new Error('socket hang up')), 'socket hang up');
  assert.equal(explain('plain string'), 'plain string');
  assert.equal(explain(new CircleFiError('already friendly')), 'already friendly');
});

test('explain() survives values that cannot be serialised', () => {
  const loop = { message: 'Error(Contract, #4)' };
  loop.self = loop;
  assert.equal(explain(loop), 'This circle is not running');
});

test('contractErrorCode() pulls out the number so callers can branch on it', () => {
  assert.equal(contractErrorCode({ message: 'HostError: Error(Contract, #9)' }), 9);
  assert.equal(contractErrorCode({ result: { error: 'Error(Contract, #11)' } }), 11);
  assert.equal(contractErrorCode(new Error('timeout')), undefined);
  assert.equal(contractErrorCode(new CircleFiError('x', 3)), 3);
});
