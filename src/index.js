/**
 * CircleFi SDK - read and drive rotating savings circles on Stellar.
 *
 * Reads are simulated against a Soroban RPC node: no wallet, no account, no
 * fee. Writes are ordinary transactions, signed by whatever signer you pass -
 * the SDK never sees a key and has no opinion about which wallet you use.
 */
import {
  Account, Address, BASE_FEE, Contract, Networks, TransactionBuilder,
  nativeToScVal, rpc, scValToNative,
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

export class CircleFiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CircleFiError';
    this.code = code;
  }
}

/** Turn whatever the network threw into something worth showing a person. */
export function explain(e) {
  if (e instanceof CircleFiError) return e.message;
  const blob = `${e?.message || ''} ${(() => { try { return JSON.stringify(e); } catch { return ''; } })()}`;
  const m = /Error\(Contract,\s*#(\d+)\)/.exec(blob);
  if (m && CIRCLE_ERRORS[+m[1]]) return CIRCLE_ERRORS[+m[1]];
  if (/insufficient balance|balance is not sufficient/i.test(blob))
    return 'Not enough of that token in the wallet for this.';
  if (/trustline|not authorized/i.test(blob))
    return 'That account cannot hold this token yet - add a trustline for it first.';
  if (/account not found|NOT_FOUND/i.test(blob))
    return 'That account does not exist on this network yet.';
  return e?.message || String(e);
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
    if (rpc.Api.isSimulationError(sim)) throw new CircleFiError(explain({ message: sim.error }));
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
    const account = await this.server.getAccount(signer.address);
    const built = new TransactionBuilder(account, {
      fee: BASE_FEE, networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(180)
      .build();

    // Simulate before prompting, so a call that would fail does so before the
    // wallet asks and before a fee is spent.
    const prepared = await this.server.prepareTransaction(built);
    const res = await signer.signTransaction(prepared.toXDR(), {
      networkPassphrase: this.networkPassphrase, address: signer.address,
    });
    if (res?.error) throw new CircleFiError(String(res.error));
    const xdr = typeof res === 'string' ? res : res.signedTxXdr;

    const sent = await this.server.sendTransaction(
      TransactionBuilder.fromXDR(xdr, this.networkPassphrase),
    );
    if (sent.status === 'ERROR') throw new CircleFiError(explain(sent.errorResult ?? sent));

    const done = await this.server.pollTransaction(sent.hash, {
      attempts: 30, sleepStrategy: rpc.LinearSleepStrategy,
    });
    if (done.status !== 'SUCCESS') throw new CircleFiError(explain(done.resultXdr ?? done.status));
    return { hash: sent.hash, value: done.returnValue ? scValToNative(done.returnValue) : undefined };
  }

  // ---- the factory ----

  /** How many circles the factory has opened. */
  count() { return this.read(this.factoryId, 'count'); }

  /**
   * Async iterator over all circles created by the factory.
   * Lazily fetches pages of `pageSize` (default: 50) and stops when a page is short or empty.
   *
   * @param {{ pageSize?: number }} [opts]
   * @returns {AsyncGenerator<import('./index.js').Listing, void, unknown>}
   */
  async *circles({ pageSize = 50 } = {}) {
    let offset = 0;
    const limit = Math.max(1, Number(pageSize) || 50);

    while (true) {
      const page = await this.list(offset, limit);
      if (!Array.isArray(page) || page.length === 0) {
        break;
      }
      for (const item of page) {
        yield item;
      }
      if (page.length < limit) {
        break;
      }
      offset += page.length;
    }
  }

  /** One page of circles, newest first. */
  list(offset = 0, limit = 20) {
    return this.read(this.factoryId, 'list', [u32(offset), u32(limit)]);
  }

  /** Open a circle. Resolves to the new circle's contract address. */
  async create(signer, { token, contribution, roundSeconds, capacity }) {
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
