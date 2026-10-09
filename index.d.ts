declare module '@circlefi/sdk' {
  export interface Network {
    rpcUrl: string;
    networkPassphrase: string;
    factoryId: string;
  }

  export const TESTNET: Readonly<Network>;
  export const TESTNET_NATIVE: string;
  export const CIRCLE_ERRORS: Readonly<Record<number, string>>;
  /** The factory's own codes - #3 there means a page that is too large. */
  export const FACTORY_ERRORS: Readonly<Record<number, string>>;
  /** Most circles the factory returns from one list() call. */
  export const MAX_PAGE: 50;

  /** Anything that can sign - Freighter's API satisfies this as-is. */
  export interface Signer {
    address: string;
    signTransaction(
      xdr: string,
      opts: { networkPassphrase: string; address: string },
    ): Promise<{ signedTxXdr: string; error?: unknown } | string>;
  }

  export interface Terms {
    token: string;
    contribution: bigint | string | number;
    roundSeconds: bigint | string | number;
    capacity: number;
  }

  /** What a circle's get_config returns. */
  export interface Config {
    admin: string;
    token: string;
    contribution: bigint;
    round_seconds: bigint;
    capacity: number;
  }

  export interface State {
    status: number;
    round: number;
    round_ends_at: bigint;
    members: string[];
  }

  export interface MemberRecord {
    deposit: bigint;
    defaults: number;
    received: boolean;
    delinquent: boolean;
  }

  /** One entry from the factory's list(). */
  export interface Listing {
    address: string;
    creator: string;
    token: string;
    contribution: bigint;
    round_seconds: bigint;
    capacity: number;
    created_at: bigint;
  }

  export interface Snapshot {
    id: string;
    config: Config;
    state: State;
    round: number;
    token: { decimals: number; symbol: string };
    members: Array<{
      address: string;
      record: MemberRecord | null;
      paidThisRound: boolean;
    }>;
  }

  export interface Sent {
    hash: string;
    value?: unknown;
  }

  export class CircleFiError extends Error {
    code?: number;
  }

  /** Turn whatever the network threw into a sentence worth showing a person. */
  export function explain(e: unknown, table?: Readonly<Record<number, string>>): string;

  export const MIN_CAPACITY: 3;
  export const MAX_CAPACITY: 24;

  /** The factory's rules, checked locally. Empty array means acceptable. */
  export function checkTerms(terms: Partial<Terms>): string[];

  /** The contract's error number (see CIRCLE_ERRORS) inside a thrown value, if any. */
  export function contractErrorCode(e: unknown): number | undefined;

  /** ScVal encoders for building raw calls with read() and invoke(). */
  export function addr(address: string): unknown;
  export function u32(n: number | string): unknown;
  export function u64(n: bigint | number | string): unknown;
  export function i128(n: bigint | number | string): unknown;

  export class CircleFi {
    constructor(network?: Partial<Network>);
    readonly rpcUrl: string;
    readonly networkPassphrase: string;
    readonly factoryId: string;

    read(contractId: string, method: string, args?: unknown[]): Promise<any>;
    invoke(contractId: string, method: string, args: unknown[], signer: Signer): Promise<Sent>;

    count(): Promise<number>;
    /** One page, newest first; limit is 1..MAX_PAGE. */
    list(offset?: number, limit?: number): Promise<Listing[]>;
    /** Every circle, newest first, a page at a time. */
    listAll(opts?: { max?: number }): Promise<Listing[]>;
    create(signer: Signer, terms: Terms): Promise<string>;

    config(id: string): Promise<Config>;
    state(id: string): Promise<State>;
    member(id: string, who: string): Promise<MemberRecord | null>;
    hasContributed(id: string, round: number, who: string): Promise<boolean>;
    snapshot(id: string): Promise<Snapshot>;

    join(id: string, signer: Signer): Promise<Sent>;
    contribute(id: string, signer: Signer): Promise<Sent>;
    topUp(id: string, signer: Signer): Promise<Sent>;
    settle(id: string, signer: Signer): Promise<Sent>;
    withdraw(id: string, signer: Signer): Promise<Sent>;

    circle(id: string): {
      id: string;
      config(): Promise<Config>;
      state(): Promise<State>;
      member(who: string): Promise<MemberRecord | null>;
      hasContributed(round: number, who: string): Promise<boolean>;
      snapshot(): Promise<Snapshot>;
      join(signer: Signer): Promise<Sent>;
      contribute(signer: Signer): Promise<Sent>;
      topUp(signer: Signer): Promise<Sent>;
      settle(signer: Signer): Promise<Sent>;
      withdraw(signer: Signer): Promise<Sent>;
    };

    tokenMeta(tokenId: string): Promise<{ decimals: number; symbol: string }>;
    tokenBalance(tokenId: string, who: string): Promise<bigint | null>;
  }

  export function amount(units: bigint | string | number, decimals: number, symbol: string): string;
  export function toUnits(text: string, decimals: number): bigint | null;
  export function duration(seconds: bigint | number): string;
  export function remaining(endsAt: bigint | number): string;
  export function short(address: string): string;
  export const STATUS: readonly ['forming', 'active', 'complete'];
  export function statusOf(raw: number | bigint): 'forming' | 'active' | 'complete';

  export default CircleFi;
}
