/**
 * A whole circle, start to finish, against live Stellar testnet.
 *
 * Generates throwaway keypairs, funds them from friendbot, then drives every
 * write the contract has: create, join, contribute, settle, withdraw. The
 * assertions are on the *contract's own balance*, which is exact - member
 * balances move by transaction fees too, so they prove less.
 *
 *   node test/e2e.mjs
 *
 * Takes a couple of minutes: every step is a real transaction on a real ledger.
 */
import assert from 'node:assert/strict';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { CircleFi, TESTNET, TESTNET_NATIVE, amount, statusOf } from '../src/index.js';

const CAPACITY = 3;
const CONTRIBUTION = 10_000_000n;   // 1 XLM, in stroops
const ROUND_SECONDS = 300;
const POT = CONTRIBUTION * BigInt(CAPACITY);

const cf = new CircleFi(TESTNET);
const log = (...a) => console.log(...a);
const xlm = (v) => amount(v, 7, 'XLM');

/** A signer is just an address and a signTransaction - here, over a Keypair. */
function signerFor(keypair) {
  return {
    address: keypair.publicKey(),
    async signTransaction(xdr, { networkPassphrase }) {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      tx.sign(keypair);
      return { signedTxXdr: tx.toXDR() };
    },
  };
}

async function fund(publicKey) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
  if (!r.ok && r.status !== 400) throw new Error(`friendbot said ${r.status}`);
}

const held = () => cf.tokenBalance(TESTNET_NATIVE, circleId);

log('funding three throwaway accounts from friendbot');
const keys = Array.from({ length: CAPACITY }, () => Keypair.random());
const signers = keys.map(signerFor);
await Promise.all(keys.map((k) => fund(k.publicKey())));
for (const s of signers) log(`  ${s.address}`);

log('\ncreating the circle');
const circleId = await cf.create(signers[0], {
  token: TESTNET_NATIVE,
  contribution: CONTRIBUTION,
  roundSeconds: ROUND_SECONDS,
  capacity: CAPACITY,
});
log(`  ${circleId}`);
log(`  ${CAPACITY} members, ${xlm(CONTRIBUTION)} a round, pot ${xlm(POT)}`);

const circle = cf.circle(circleId);
assert.equal(statusOf((await circle.state()).status), 'forming');
assert.equal(await held(), 0n, 'a fresh circle should hold nothing');

log('\njoining - each member locks one round as a deposit');
for (const [i, s] of signers.entries()) {
  await circle.join(s);
  const inside = await held();
  log(`  ${i + 1}. ${s.address.slice(0, 8)} joined, circle holds ${xlm(inside)}`);
  assert.equal(inside, CONTRIBUTION * BigInt(i + 1), 'deposits should be the only thing held');
}

const started = await circle.state();
assert.equal(statusOf(started.status), 'active', 'a full circle should start');
assert.equal(Number(started.round), 1);

const deposits = CONTRIBUTION * BigInt(CAPACITY);
const order = started.members;

for (let round = 1; round <= CAPACITY; round += 1) {
  const recipient = order[round - 1];
  log(`\nround ${round} of ${CAPACITY} - the pot goes to ${recipient.slice(0, 8)}`);

  for (const s of signers) {
    await circle.contribute(s);
    assert.equal(await circle.hasContributed(round, s.address), true);
  }
  assert.equal(
    await held(), deposits + POT,
    'after everyone pays, the circle should hold the deposits plus a whole pot',
  );

  const before = await cf.tokenBalance(TESTNET_NATIVE, recipient);
  await circle.settle(signers[round % CAPACITY]);   // anyone may settle
  const after = await cf.tokenBalance(TESTNET_NATIVE, recipient);

  assert.equal(await held(), deposits, 'settling should pay the pot out in full');
  assert.ok(after > before, 'the recipient should be better off');
  log(`  paid out ${xlm(POT)}; recipient gained ${xlm(after - before)} after fees`);

  const rec = await circle.member(recipient);
  assert.equal(rec.received, true, 'the recipient should be marked paid out');
  assert.equal(Number(rec.defaults), 0, 'nobody defaulted');
}

const finished = await circle.state();
assert.equal(statusOf(finished.status), 'complete', 'every turn taken means complete');

log('\nwithdrawing deposits');
for (const s of signers) {
  await circle.withdraw(s);
  log(`  ${s.address.slice(0, 8)} took their ${xlm(CONTRIBUTION)} deposit back`);
}

assert.equal(await held(), 0n, 'the circle should end holding nothing at all');

const finalRecords = await Promise.all(signers.map((s) => circle.member(s.address)));
for (const [i, r] of finalRecords.entries()) {
  assert.equal(r.received, true, `member ${i + 1} never got a turn`);
  assert.equal(Number(r.defaults), 0, `member ${i + 1} defaulted`);
  assert.equal(BigInt(r.deposit), 0n, `member ${i + 1} left a deposit behind`);
  assert.equal(r.delinquent, false);
}

log(`
every member paid ${CAPACITY} rounds and took the pot exactly once,
every deposit came back, and the contract ended holding nothing.

  circle   ${circleId}
  explorer https://stellar.expert/explorer/testnet/contract/${circleId}

end-to-end test passed`);
