/**
 * CircleFi SDK - read and drive rotating savings circles on Stellar.
 *
 * Reads are simulated against a Soroban RPC node: no wallet, no account, no
 * fee. Writes are ordinary transactions, signed by whatever signer you pass -
 * the SDK never sees a key and has no opinion about which wallet you use.
 */
import {
  Account, Address, BASE_FEE, Contract, Networks, TransactionBuilder,
  StrKey, nativeToScVal, rpc, scValToNative,
} from '@stellar/stellar-sdk';

/** An account that exists on no network - fine as a simulation source. */
const NULL_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export const TESTNET = Object.freeze({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  factoryId: 'CCJRXTYIEFE6Z7DGTAKRGBLOGYBZNOONHI7FWZUDXEKZ7LGEGZNXKG3M',
});

/** The native asset's own contract on testnet. */
export const TESTNET_NATIVE = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

/** Contract error codes, so a failure reaches a person as a sentence. */
export const CIRCLE_ERRORS = Object.freeze({
  1: 'Contribution or round length was zero',
  2: 'Circle size must be between 3 and 24',
  3: 'This circle has already filled and started',
  4: 'This circle is not running',
  5: 'This circle has not finished yet',
  6: 'You are not a member of this circle',
  7: 'You have already joined this circle',
  8: 'You have already contributed to this round',
  9: 'The round is still open and not everyone has paid',
  10: 'Your deposit is already whole',
  11: 'Nothing left to withdraw',
});

/** The factory has its own, smaller set of codes - #3 means something else there. */
export const FACTORY_ERRORS = Object.freeze({
  1: 'Contribution or round length was zero',
  2: 'Circle size must be between 3 and 24',
  3: 'Asked for more than 50 circles in one page',
});

/** Most circles the factory returns from one list() call. */
export const MAX_PAGE = 50;

export class CircleFiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CircleFiError';
    this.code = code;
  }
}

function describe(e) {
  let json = '';
  try { json = JSON.stringify(e); } catch { /* circular - the message is enough */ }
  return `${e?.message || ''} ${json}`;
}

/** The contract's error number inside whatever the network threw, if any. */
export function contractErrorCode(e) {
  if (e instanceof CircleFiError) return e.code;
  const m = /Error\(Contract,\s*#(\d+)\)/.exec(describe(e));
  return m ? Number(m[1]) : undefined;
}

/**
 * Turn whatever the network threw into something worth showing a person.
 * Pass FACTORY_ERRORS as `table` for failures from the factory contract.
 */
export function explain(e, table = CIRCLE_ERRORS) {
  if (e instanceof CircleFiError) return e.message;
  const blob = describe(e);
  const code = contractErrorCode(e);
  if (code && table[code]) return table[code];
  if (/insufficient balance|balance is not sufficient/i.test(blob))
    return 'Not enough of that token in the wallet for this.';
  if (/trustline|not authorized/i.test(blob))
    return 'That account cannot hold this token yet - add a trustline for it first.';
  if (/account not found|NOT_FOUND/i.test(blob))
    return 'That account does not exist on this network yet.';
  return e?.message || String(e);
}

/** A CircleFiError carrying both the sentence and the contract's error code. */
function failure(e, table) {
  return new CircleFiError(explain(e, table), contractErrorCode(e));
}

/** Circle sizes the contracts accept. */
export const MIN_CAPACITY = 3;
export const MAX_CAPACITY = 24;

const I128_MAX = (1n << 127n) - 1n;
const U64_MAX = (1n << 64n) - 1n;

function asBigInt(v) {
  try {
    if (typeof v === 'number' && !Number.isInteger(v)) return null;
    return BigInt(v);
  } catch {
    return null;
  }
}

/**
 * Check a circle's terms the way the factory will, so a form can show what
 * is wrong before anyone is asked to sign. Returns a list of sentences;
 * empty means the terms are acceptable.
 */
export function checkTerms({ token, contribution, roundSeconds, capacity } = {}) {
  const problems = [];
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < MIN_CAPACITY || cap > MAX_CAPACITY) {
    problems.push(`Circle size must be between ${MIN_CAPACITY} and ${MAX_CAPACITY}.`);
  }
  const c = asBigInt(contribution);
  if (c === null || c <= 0n || c > I128_MAX) {
    problems.push('Contribution must be a whole number of token units, more than zero.');
  }
  const r = asBigInt(roundSeconds);
  if (r === null || r <= 0n || r > U64_MAX) {
    problems.push('Round length must be a whole number of seconds, more than zero.');
  }
  if (typeof token !== 'string' || !StrKey.isValidContract(token)) {
    problems.push('Token must be a token contract address (C...).');
  }
  return problems;
}

export const addr = (a) => new Address(a).toScVal();
export const u32 = (n) => nativeToScVal(Number(n), { type: 'u32' });
export const u64 = (n) => nativeToScVal(BigInt(n), { type: 'u64' });
export const i128 = (n) => nativeToScVal(BigInt(n), { type: 'i128' });

export class CircleFi {
  /**
   * @param {{rpcUrl?:string, networkPassphrase?:string, factoryId?:string}} [network]
   */
  constructor(network = TESTNET) {
    const { rpcUrl, networkPassphrase, factoryId } = { ...TESTNET, ...network };
    this.rpcUrl = rpcUrl;
    this.networkPassphrase = networkPassphrase;
    this.factoryId = factoryId;
    this.server = new rpc.Server(rpcUrl);
    this._tokenMeta = new Map();
  }

  /** Which error table applies to a contract: the factory's, or a circle's. */
  _errors(contractId) {
    return contractId === this.factoryId ? FACTORY_ERRORS : CIRCLE_ERRORS;
  }

  /** Simulate a call and return its value. Costs nothing and needs no account. */
  async read(contractId, method, args = []) {
    const source = new Account(NULL_ACCOUNT, '0');
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE, networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw failure({ message: sim.error }, this._errors(contractId));
    const retval = sim.result?.retval;
    return retval ? scValToNative(retval) : undefined;
  }

  /**
   * Send a call. `signer` is anything with an `address` and a
   * `signTransaction(xdr, {networkPassphrase, address})` - Freighter's API
   * satisfies this as-is, and so does a five-line wrapper round a Keypair.
   */
  async invoke(contractId, method, args, signer) {
    if (!signer?.address) throw new CircleFiError('No signer: pass { address, signTransaction }.');
    const account = await this.server.getAccount(signer.address).catch((e) => {
      throw failure(e, this._errors(contractId));
    });
    const built = new TransactionBuilder(account, {
      fee: BASE_FEE, networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(180)
      .build();

    // Simulate before prompting, so a call that would fail does so before the
    // wallet asks and before a fee is spent.
    let prepared;
    try {
      prepared = await this.server.prepareTransaction(built);
    } catch (e) {
      throw failure(e, this._errors(contractId));
    }
    const res = await signer.signTransaction(prepared.toXDR(), {
      networkPassphrase: this.networkPassphrase, address: signer.address,
    });
    if (res?.error) throw new CircleFiError(String(res.error));
    const xdr = typeof res === 'string' ? res : res.signedTxXdr;

    const sent = await this.server.sendTransaction(
      TransactionBuilder.fromXDR(xdr, this.networkPassphrase),
    );
    if (sent.status === 'ERROR') throw failure(sent.errorResult ?? sent, this._errors(contractId));

    const done = await this.server.pollTransaction(sent.hash, {
      attempts: 30, sleepStrategy: rpc.LinearSleepStrategy,
    });
    if (done.status !== 'SUCCESS') throw failure(done.resultXdr ?? done.status, this._errors(contractId));
    return { hash: sent.hash, value: done.returnValue ? scValToNative(done.returnValue) : undefined };
  }

  // ---- the factory ----

  /** How many circles the factory has opened. */
  count() { return this.read(this.factoryId, 'count'); }

  /** One page of circles, newest first. At most MAX_PAGE (50) per call. */
  list(offset = 0, limit = 20) {
    if (!Number.isInteger(offset) || offset < 0) {
      return Promise.reject(new CircleFiError('offset must be a whole number, 0 or more'));
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
      return Promise.reject(new CircleFiError(`limit must be between 1 and ${MAX_PAGE}`, 3));
    }
    return this.read(this.factoryId, 'list', [u32(offset), u32(limit)]);
  }

  /**
   * Every circle the factory has opened, newest first, fetched a page at a
   * time. Pass `max` to stop early on a large index.
   */
  async listAll({ max = Infinity } = {}) {
    const total = Math.min(Number(await this.count()), max);
    const out = [];
    while (out.length < total) {
      const page = await this.list(out.length, Math.min(MAX_PAGE, total - out.length));
      if (!page.length) break;
      out.push(...page);
    }
    return out;
  }

  /** Open a circle. Resolves to the new circle's contract address. */
  async create(signer, { token, contribution, roundSeconds, capacity }) {
    const problems = checkTerms({ token, contribution, roundSeconds, capacity });
    if (problems.length) {
      // Use the factory's code for the same failure, so callers branch alike.
      const code = problems.some((p) => p.startsWith('Circle size')) ? 2
        : problems.some((p) => /^(Contribution|Round length)/.test(p)) ? 1
          : undefined;
      throw new CircleFiError(problems.join(' '), code);
    }
    const r = await this.invoke(this.factoryId, 'create', [
      addr(signer.address), addr(token), i128(contribution), u64(roundSeconds), u32(capacity),
    ], signer);
    return r.value;
  }

  // ---- one circle ----

  config(id) { return this.read(id, 'get_config'); }
  state(id) { return this.read(id, 'get_state'); }
  member(id, who) { return this.read(id, 'get_member', [addr(who)]); }
  hasContributed(id, round, who) {
    return this.read(id, 'has_contributed', [u32(round), addr(who)]);
  }
  /** Who takes the pot in a round (1-indexed), or null if that seat is empty. */
  async recipientOf(id, round) {
    return (await this.read(id, 'recipient_of', [u32(round)])) ?? null;
  }

  join(id, signer) { return this.invoke(id, 'join', [addr(signer.address)], signer); }
  contribute(id, signer) { return this.invoke(id, 'contribute', [addr(signer.address)], signer); }
  topUp(id, signer) { return this.invoke(id, 'top_up', [addr(signer.address)], signer); }
  settle(id, signer) { return this.invoke(id, 'settle', [], signer); }
  withdraw(id, signer) {
    return this.invoke(id, 'withdraw_deposit', [addr(signer.address)], signer);
  }

  /** Config, state and every member record in one round trip's worth of reads. */
  async snapshot(id) {
    const [config, state] = await Promise.all([this.config(id), this.state(id)]);
    const round = Number(state.round);
    const members = await Promise.all(state.members.map(async (address) => ({
      address,
      record: await this.member(id, address).catch(() => null),
      paidThisRound: round > 0
        ? await this.hasContributed(id, round, address).catch(() => false)
        : false,
    })));
    return { id, config, state, round, members, token: await this.tokenMeta(config.token) };
  }

  /** Every method above, with the circle id already filled in. */
  circle(id) {
    const bind = (fn) => (...rest) => fn.call(this, id, ...rest);
    return {
      id,
      config: bind(this.config), state: bind(this.state), member: bind(this.member),
      hasContributed: bind(this.hasContributed), snapshot: bind(this.snapshot),
      recipientOf: bind(this.recipientOf),
      join: bind(this.join), contribute: bind(this.contribute), topUp: bind(this.topUp),
      settle: bind(this.settle), withdraw: bind(this.withdraw),
    };
  }

  // ---- tokens ----

  /** Decimals and symbol, cached; falls back to 7 / "token" for odd contracts. */
  async tokenMeta(tokenId) {
    if (this._tokenMeta.has(tokenId)) return this._tokenMeta.get(tokenId);
    const [decimals, symbol] = await Promise.all([
      this.read(tokenId, 'decimals').catch(() => 7),
      this.read(tokenId, 'symbol').catch(() => 'token'),
    ]);
    const meta = { decimals: Number(decimals), symbol: String(symbol) };
    this._tokenMeta.set(tokenId, meta);
    return meta;
  }

  async tokenBalance(tokenId, who) {
    try { return BigInt(await this.read(tokenId, 'balance', [addr(who)])); }
    catch { return null; }
  }
}

export default CircleFi;

export { short, amount, toUnits, duration, remaining, STATUS, statusOf } from './format.js';
export { nextStep } from './steps.js';
