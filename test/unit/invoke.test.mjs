import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account } from '@stellar/stellar-sdk';
import { CircleFi, CircleFiError } from '../../src/index.js';

const G = 'GAVBYMCRSQOJANSUSLWCGY3WJWO7Z3WWBXSFA3RPITK2WAYMMI3I7FCZ';
const CIRCLE = 'CBV6IG53JF7WIINUBJS27YUCPCWUJM5EUSOWQKH7FKQLENKUR6Y2MA6Y';

/** A CircleFi whose RPC server is a stub, so no network is touched. */
function offline(server) {
  const cf = new CircleFi();
  cf.server = server;
  return cf;
}

function recordingSigner() {
  const signer = {
    address: G,
    calls: 0,
    async signTransaction() { signer.calls += 1; return { signedTxXdr: '' }; },
  };
  return signer;
}

test('a call the contract would reject fails before the wallet is asked', async () => {
  const signer = recordingSigner();
  const cf = offline({
    getAccount: async () => new Account(G, '1'),
    prepareTransaction: async () => { throw new Error('HostError: Error(Contract, #7)'); },
  });
  await assert.rejects(cf.join(CIRCLE, signer), (err) => {
    assert.ok(err instanceof CircleFiError);
    assert.equal(err.code, 7);
    assert.equal(err.message, 'You have already joined this circle');
    return true;
  });
  assert.equal(signer.calls, 0, 'the wallet should never have been prompted');
});

test('an unfunded account is explained, not thrown raw', async () => {
  const cf = offline({
    getAccount: async () => { throw new Error('Account not found: ' + G); },
  });
  await assert.rejects(cf.contribute(CIRCLE, recordingSigner()), (err) => {
    assert.ok(err instanceof CircleFiError);
    assert.match(err.message, /does not exist on this network/);
    return true;
  });
});

test('invoke() refuses to run without a signer', async () => {
  await assert.rejects(offline({}).settle(CIRCLE, undefined), /No signer/);
});

test('a wallet that declines surfaces its own reason', async () => {
  const cf = offline({
    getAccount: async () => new Account(G, '1'),
    prepareTransaction: async (tx) => tx,
  });
  const signer = { address: G, signTransaction: async () => ({ error: 'User declined access' }) };
  await assert.rejects(cf.settle(CIRCLE, signer), /User declined access/);
});
