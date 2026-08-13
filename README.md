# CircleFi SDK

Embeddable TypeScript/JavaScript SDK for CircleFi rotating savings circles. Designed for integration with wallets, anchors, and fintech apps operating in Stellar-heavy corridors (Africa, LatAm, SE Asia).

## Installation

```bash
npm install @circlefi/sdk
```

## Quick Start

```typescript
import { CircleFiSDK } from '@circlefi/sdk';

const sdk = new CircleFiSDK({
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// Create a circle
const circle = await sdk.createCircle({
  name: 'My Savings Circle',
  contribution_amount: 100,
  cycle_duration_days: 30,
  payout_order: 'fixed',
  collateral_percentage: 20,
  dispute_window_hours: 24,
});

// Join a circle
await sdk.joinCircle(circle.id);

// Make a contribution
await sdk.contribute(circle.id, 100);

// Get circle members
const members = await sdk.getMembers(circle.id);
```

## API Reference

### `createCircle(params)`
Create a new savings circle.

**Parameters:**
- `name: string` - Circle name
- `contribution_amount: number` - Required contribution per member
- `cycle_duration_days: number` - Duration of each round
- `payout_order: 'fixed' | 'bid'` - Fixed or bid-based payout
- `collateral_percentage: number` - Required collateral (0-100)
- `dispute_window_hours: number` - Time to dispute payouts

### `joinCircle(circleId)`
Join an existing circle.

### `getCircles()`
Get all circles for the current user.

### `contribute(circleId, amount)`
Make a contribution to a circle.

### `placeBid(circleId, bidAmount)`
Place a bid for payout priority (bid-based circles only).

### `getMembers(circleId)`
Get all members in a circle.

### `getMember(circleId, memberAddress)`
Get details for a specific member.

### `triggerDefault(circleId, memberAddress)`
Mark a member as defaulted (slashing logic applied).

### `disputePayout(circleId, roundId)`
Dispute a payout decision.

### `endRound(circleId)`
End the current round and move to the next.

## Wallet Integration

The SDK works with any Stellar wallet that supports Soroban contract invocations:

```typescript
// Example with Freighter wallet
const publicKey = await window.freighter.getPublicKey();
const sdk = new CircleFiSDK({
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});
```

## Features

- ✅ Circle creation and management
- ✅ Member tracking with trust scores
- ✅ Contribution enforcement
- ✅ Collateral locking and slashing
- ✅ Fixed and bid-based payout support
- ✅ Dispute resolution window
- ✅ Full TypeScript support
- ✅ Wallet agnostic

## License

MIT
