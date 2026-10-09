/**
 * What a given address should do next in a circle, worked out from a
 * snapshot() alone - so an app can show one obvious button instead of
 * five, and a bot can decide whether to settle.
 */

const FORMING = 0;
const ACTIVE = 1;
const COMPLETE = 2;

/**
 * @param {object} snap  the result of CircleFi#snapshot()
 * @param {string} [who] the address asking; omit for someone without a wallet
 * @param {number} [now] unix seconds, for tests; defaults to the clock
 * @returns {{ action: 'join'|'wait'|'contribute'|'top_up'|'settle'|'withdraw'|'none', reason: string }}
 */
export function nextStep(snap, who, now = Math.floor(Date.now() / 1000)) {
  const status = Number(snap.state.status);
  const capacity = Number(snap.config.capacity);
  const contribution = BigInt(snap.config.contribution);
  const me = who ? snap.members.find((m) => m.address === who) : undefined;

  if (status === FORMING) {
    if (me) return { action: 'wait', reason: 'Waiting for the circle to fill.' };
    if (snap.members.length < capacity) {
      return { action: 'join', reason: 'There is a seat free. Joining locks one round as a deposit.' };
    }
    return { action: 'none', reason: 'This circle is full.' };
  }

  if (status === COMPLETE) {
    const deposit = BigInt(me?.record?.deposit ?? 0);
    if (me && deposit > 0n) {
      return { action: 'withdraw', reason: 'The circle is complete. Your deposit is ready to take back.' };
    }
    return { action: 'none', reason: 'This circle is complete.' };
  }

  if (status !== ACTIVE) return { action: 'none', reason: 'Unknown circle status.' };

  if (me && !me.paidThisRound) {
    return { action: 'contribute', reason: `Round ${snap.round} is open and you have not paid yet.` };
  }
  if (me?.record && BigInt(me.record.deposit) < contribution) {
    return { action: 'top_up', reason: 'Your deposit covered a missed round. Restore it to stay in good standing.' };
  }

  const everyonePaid = snap.members.every((m) => m.paidThisRound);
  const closed = now >= Number(snap.state.round_ends_at);
  if (everyonePaid || closed) {
    return {
      action: 'settle',
      reason: everyonePaid
        ? 'Everyone has paid. Anyone can settle the round and pay its recipient.'
        : 'The round has closed. Anyone can settle it; missed payments come from deposits.',
    };
  }
  if (!me) return { action: 'none', reason: 'This circle is running and its seats are taken.' };
  return { action: 'wait', reason: 'You have paid. Waiting for the others or for the round to close.' };
}
