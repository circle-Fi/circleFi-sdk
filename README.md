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

## Errors

`explain(e)` maps contract error codes and the usual network failures to a sentence
you can put in front of a person:

```js
try { await circle.contribute(signer); }
catch (e) { alert(explain(e)); }   // "You have already contributed to this round"
```

## Network

`new CircleFi()` is testnet. Point it anywhere:

```js
new CircleFi({ rpcUrl, networkPassphrase, factoryId });
```

## Tests

`npm run test:live` reads the deployed testnet factory and asserts the shape of what
comes back. It writes nothing, so it is safe to run against a live network - CI runs
it on every push and once a day.

## Licence

Apache-2.0
