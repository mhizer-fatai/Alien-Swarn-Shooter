# 🧠 `src/genlayer/` — GenLayer Integration Module

This folder contains the entire GenLayer integration for Alien Swarm.
**No existing game files were modified.** The module is completely self-contained.

---

## Folder Structure

```
src/genlayer/
├── index.ts         ← Public API (import from here)
├── config.ts        ← Contract address + RPC URL
├── client.ts        ← Low-level genlayer-js wrapper
├── waveManager.ts   ← High-level wave logic (use this in React)
├── types.ts         ← TypeScript interfaces
└── README.md        ← This file

contracts/
└── AlienSwarmContract.py  ← Paste into GenLayer Studio to deploy
```

---

## Setup Instructions

### Step 1 – Deploy the Contract
1. Go to [GenLayer Studio](https://studio.genlayer.com/) (or run `genlayer up` for local).
2. Open `contracts/AlienSwarmContract.py`.
3. Copy and paste its content into the Studio editor.
4. Click **Deploy**. Copy the **contract address** that appears.

### Step 2 – Configure the Game
Create or edit `.env` in the project root:

```env
VITE_GENLAYER_CONTRACT_ADDRESS=0xYourContractAddressHere
VITE_GENLAYER_RPC_URL=http://localhost:4000/api
```

> If `VITE_GENLAYER_CONTRACT_ADDRESS` is not set, the module automatically falls back to the hardcoded wave logic — no crashes, no errors.

### Step 3 – Use in a Component
```typescript
import { waveManager } from '../genlayer';
import type { WaveConfig } from '../genlayer';

// At end of each wave:
waveManager.onStatusChange((status) => {
  setGenLayerStatus(status); // 'generating' → show loading screen
});

const config: WaveConfig = await waveManager.handleWaveEnd({
  kills: 24,
  damage_taken: 80,
  health_pct: 0.72,
  shots_fired: 120,
  shots_hit: 96,
}, currentWave);

// Apply config to engine:
engine.applyWaveConfig(config);
```

---

## WaveConfig Object

| Field | Type | Description |
|---|---|---|
| `wave` | `number` | Wave number |
| `enemy_count` | `number` | Max enemies on screen (5–40) |
| `enemy_speed_mult` | `number` | Speed multiplier (0.6–2.0) |
| `enemy_hp_mult` | `number` | HP multiplier (0.5–2.5) |
| `spawn_rate_mult` | `number` | Spawn interval multiplier (lower = faster) |
| `event` | `string` | `none` \| `ambush` \| `boss` |
| `flavor_text` | `string` | Short text shown in wave HUD |

---

## Fallback Behaviour

If GenLayer is unreachable or the contract address is not set, `waveManager.handleWaveEnd()` returns a safe, linearly-scaled `WaveConfig` identical to the game's current built-in logic. The game **never crashes** due to a missing GenLayer connection.
