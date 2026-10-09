# CircleFi SDK

Read and drive [CircleFi](https://github.com/circle-Fi/circleFi-contract) rotating
savings circles on Stellar, from a browser or from Node.

Reads are simulated against a Soroban RPC node, so listing circles and inspecting
one needs no wallet, no account and no fee. Writes are ordinary transactions signed
by whatever signer you hand in - the SDK never sees a key and has no opinion about
which wallet you use.

## Install

```sh
npm install github:circle-Fi/circleFi-sdk
```

## Read without a wallet

```js
import { CircleFi, amount, statusOf } from '@circlefi/sdk';

const cf = new CircleFi();               // testnet + the deployed factory

for (const c of await cf.list(0, 10)) {
  const { decimals, symbol } = await cf.tokenMeta(c.token);
  console.log(c.address, amount(c.contribution, decimals, symbol), 'per round');
}

const snap = await cf.snapshot('CBV6IG53JF7WIINUBJS27YUCPCWUJM5EUSOWQKH7FKQLENKUR6Y2MA6Y');
console.log(statusOf(snap.state.status), snap.members.length, 'of', snap.config.capacity);
```

## Write with a signer

A signer is anything with an `address` and a `signTransaction`. Freighter's API
already matches, so in a browser this is the whole integration:

```js
import { requestAccess, signTransaction } from '@stellar/freighter-api';
import { CircleFi, TESTNET_NATIVE, toUnits } from '@circlefi/sdk';

const cf = new CircleFi();
const { address } = await requestAccess();
const signer = { address, signTransaction };

const id = await cf.create(signer, {
  token: TESTNET_NATIVE,
  contribution: toUnits('5', 7),   // 5 XLM
  roundSeconds: 604800,            // a week
  capacity: 6,
});

const circle = cf.circle(id);
await circle.join(signer);         // locks one round as a deposit
await circle.contribute(signer);
await circle.settle(signer);       // anyone may settle; it is not privileged
```

In Node, five lines around a `Keypair` do the same job.

## What a circle is

A fixed group agrees on an amount and a period. Every period each member pays in,
and one member takes the whole pot; the order is join order, and everyone gets
exactly one turn. Joining locks one round's worth as a security deposit, and if a
member misses a round that deposit covers it - so whoever's turn it is still gets
paid in full. When a deposit is exhausted the pot comes up short, and the contract
records the shortfall rather than hiding it.

## What should I do next?

`nextStep(snapshot, address)` works out the one action that makes sense for a
person right now, with a sentence saying why - so a UI can show one button, and a
keeper bot can tell when a round is ready to settle:

```js
import { nextStep } from '@circlefi/sdk';

const snap = await cf.snapshot(id);
const { action, reason } = nextStep(snap, address);
// action: 'join' | 'wait' | 'contribute' | 'top_up' | 'settle' | 'withdraw' | 'none'
```

`recipientOf(id, round)` says whose turn a round is; the payout order is public
before anyone commits money.

## Listing circles

`list(offset, limit)` returns one page, newest first; the factory caps a page at 50
(`MAX_PAGE`) and the SDK refuses a larger one before going to the network.
`listAll({ max })` walks the whole index a page at a time.

## Checking terms before signing

`create()` checks the terms the way the factory will - 3 to 24 members, a positive
whole contribution and round length, a token contract address - and throws before
the wallet opens. `checkTerms(terms)` returns the same problems as sentences, for
showing next to a form's fields:

```js
checkTerms({ token, contribution: 0n, roundSeconds: 604800, capacity: 2 });
// ['Circle size must be between 3 and 24.',
//  'Contribution must be a whole number of token units, more than zero.']
```

## Errors

Everything the SDK throws is a `CircleFiError` whose `message` is a sentence you can
put in front of a person and whose `code` is the contract's error number, when
there is one - so you can branch without matching text:

```js
try { await circle.contribute(signer); }
catch (e) {
  if (e.code === 8) return;          // already paid this round - nothing to do
  alert(e.message);                  // "Not enough of that token in the wallet for this."
}
```

A call the contract would reject fails during simulation, before the wallet is
asked to sign and before any fee is spent. `explain(e)` and `contractErrorCode(e)`
do the same mapping for errors you catch elsewhere; the circle and the factory
number their errors differently (`CIRCLE_ERRORS`, `FACTORY_ERRORS`).

## Network

`new CircleFi()` is testnet. Point it anywhere:

```js
new CircleFi({ rpcUrl, networkPassphrase, factoryId });
```

## Tests

`npm test` runs the offline unit tests - formatting, error mapping, the ScVal
encoders, term checks, paging and `nextStep` - with the RPC server stubbed out, so it
needs no network. `npm run test:types` compiles the TypeScript declarations under
`--strict`. CI runs both on every push and pull request.

`npm run test:live` reads the deployed testnet factory and asserts the shape of what
comes back. It writes nothing, so it is safe to run against a live network - CI runs
it on every push and once a day.

Node 22.12 or newer is required (`@stellar/stellar-sdk` 17 needs it).

`npm run test:e2e` goes further: it generates throwaway keypairs, funds them from
friendbot, and drives a whole circle on live testnet - create, three joins, three
rounds of contribute and settle, three withdrawals - asserting after every step on
the contract's own balance, which is exact where member balances move by fees too.
It ends by checking the circle holds nothing at all. Takes about 40 seconds.

## Licence

Apache-2.0
