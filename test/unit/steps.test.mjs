import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircleFi, nextStep } from '../../src/index.js';

const A = 'GA_ALICE';
const B = 'GA_BOLA';
const C = 'GA_CHIDI';
const NOW = 1_000_000;

function snap({ status, members = [], round = 0, endsAt = NOW + 600, capacity = 3 }) {
  return {
    config: { capacity, contribution: 100n },
    state: { status, round_ends_at: BigInt(endsAt) },
    round,
    members: members.map(([address, paid = false, deposit = 100n]) => ({
      address, paidThisRound: paid, record: { deposit, defaults: 0, received: false, delinquent: false },
    })),
  };
}

test('forming: a stranger can join, a member waits, a full circle is closed', () => {
  assert.equal(nextStep(snap({ status: 0, members: [[A]] }), B, NOW).action, 'join');
  assert.equal(nextStep(snap({ status: 0, members: [[A]] }), undefined, NOW).action, 'join');
  assert.equal(nextStep(snap({ status: 0, members: [[A]] }), A, NOW).action, 'wait');
  assert.equal(nextStep(snap({ status: 0, members: [[A], [B], [C]] }), 'GA_OTHER', NOW).action, 'none');
});

test('active: paying comes first, then restoring a deposit', () => {
  const s = snap({ status: 1, round: 2, members: [[A, false], [B, true, 0n], [C, true]] });
  assert.equal(nextStep(s, A, NOW).action, 'contribute');
  assert.match(nextStep(s, A, NOW).reason, /Round 2/);
  assert.equal(nextStep(s, B, NOW).action, 'top_up');
  assert.equal(nextStep(s, C, NOW).action, 'wait');
});

test('active: anyone may settle once everyone has paid or the round has closed', () => {
  const allPaid = snap({ status: 1, round: 1, members: [[A, true], [B, true], [C, true]] });
  assert.equal(nextStep(allPaid, A, NOW).action, 'settle');
  assert.equal(nextStep(allPaid, undefined, NOW).action, 'settle');

  const late = snap({ status: 1, round: 1, endsAt: NOW - 1, members: [[A, true], [B, false], [C, true]] });
  assert.equal(nextStep(late, C, NOW).action, 'settle');
  assert.match(nextStep(late, C, NOW).reason, /deposits/);
  // The one who has not paid is still told to pay first.
  assert.equal(nextStep(late, B, NOW).action, 'contribute');

  const open = snap({ status: 1, round: 1, members: [[A, true], [B, false], [C, true]] });
  assert.equal(nextStep(open, undefined, NOW).action, 'none');
});

test('complete: take back what is left of the deposit, then nothing', () => {
  const s = snap({ status: 2, members: [[A, false, 100n], [B, false, 0n], [C, false, 40n]] });
  assert.equal(nextStep(s, A, NOW).action, 'withdraw');
  assert.equal(nextStep(s, B, NOW).action, 'none');
  assert.equal(nextStep(s, C, NOW).action, 'withdraw');
  assert.equal(nextStep(s, 'GA_OTHER', NOW).action, 'none');
});

test('recipientOf() asks the circle and maps an empty seat to null', async () => {
  const cf = new CircleFi();
  const seen = [];
  cf.read = async (id, method) => { seen.push(method); return undefined; };
  assert.equal(await cf.recipientOf('CID', 2), null);
  assert.equal(await cf.circle('CID').recipientOf(1), null);
  assert.deepEqual(seen, ['recipient_of', 'recipient_of']);
});
