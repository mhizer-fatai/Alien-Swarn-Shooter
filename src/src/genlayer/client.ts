// ============================================================
// GenLayer Module – Client
// ============================================================
// Low-level wrapper around genlayer-js.
// All blockchain calls go through this file.
// ============================================================

import { createClient, createAccount } from 'genlayer-js';
import { localnet, testnetBradbury } from 'genlayer-js/chains';
import type { WaveConfig, WaveReport, RefereeResult, BountyEvent, BossConfig } from './types';
import { 
  CONTRACT_ADDRESS_WAVE, 
  CONTRACT_ADDRESS_REFEREE,
  CONTRACT_ADDRESS_BOUNTY,
  CONTRACT_ADDRESS_BOSS,
  GENLAYER_ENABLED, 
  GENLAYER_NETWORK 
} from './config';

// Re-export for convenience
export { GENLAYER_ENABLED };

// ── Chain selection ──────────────────────────────────────────
function resolveChain() {
  if (GENLAYER_NETWORK === 'localnet') return localnet;
  return testnetBradbury; // default
}

// ── Client singleton ─────────────────────────────────────────
let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (_client) return _client;

  const account = createAccount();

  _client = createClient({
    chain: resolveChain(),
    account,
  });

  return _client;
}

// ============================================================
// 1. WAVE CONTRACT (The AI Director)
// ============================================================

export async function fetchNextWaveConfig(): Promise<WaveConfig | null> {
  if (!GENLAYER_ENABLED) return null;

  try {
    const client = getClient();
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS_WAVE as `0x${string}`,
      functionName: 'get_next_wave_config',
      args: [],
    });

    if (typeof raw === 'string') return JSON.parse(raw) as WaveConfig;
    return (raw as unknown) as WaveConfig;
  } catch (err) {
    console.warn('[GenLayer] fetchNextWaveConfig failed:', err);
    return null;
  }
}

export async function reportWaveResult(report: WaveReport): Promise<boolean> {
  if (!GENLAYER_ENABLED) return false;

  try {
    const client = getClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS_WAVE as `0x${string}`,
      functionName: 'report_wave_result',
      args: [
        BigInt(report.kills),
        BigInt(report.damage_taken),
        report.health_pct,
        BigInt(report.shots_fired),
        BigInt(report.shots_hit),
      ],
      value: 0n,
    });

    console.log('[GenLayer] Wave result submitted. tx:', hash);

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Transaction timeout')), 30000)
    );

    await Promise.race([
      client.waitForTransactionReceipt({
        hash,
        status: 'ACCEPTED' as any,
      }),
      timeoutPromise
    ]);

    console.log('[GenLayer] Wave generation complete.');
    return true;
  } catch (err) {
    console.warn('[GenLayer] reportWaveResult failed:', err);
    return false;
  }
}

// ============================================================
// 2. REFEREE CONTRACT (The Social Layer)
// ============================================================

export async function fetchChampion(): Promise<RefereeResult | null> {
  if (!GENLAYER_ENABLED || CONTRACT_ADDRESS_REFEREE.length < 10) return null;
  try {
    const raw = await getClient().readContract({
      address: CONTRACT_ADDRESS_REFEREE as `0x${string}`,
      functionName: 'get_champion',
      args: [],
    });
    if (typeof raw === 'string') return JSON.parse(raw) as RefereeResult;
    return raw as any;
  } catch (err) {
    return null;
  }
}

export async function submitRefereeRun(playerName: string, score: number, waves: number, accuracy: number): Promise<boolean> {
  if (!GENLAYER_ENABLED || CONTRACT_ADDRESS_REFEREE.length < 10) return false;
  try {
    const client = getClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS_REFEREE as `0x${string}`,
      functionName: 'submit_run',
      args: [playerName, BigInt(score), BigInt(waves), accuracy],
      value: 0n,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction timeout')), 30000)
    );
    await Promise.race([
      client.waitForTransactionReceipt({ hash, status: 'ACCEPTED' as any }),
      timeoutPromise
    ]);
    return true;
  } catch (err) {
    console.error('[GenLayer] Submit Referee run failed', err);
    return false;
  }
}

// ============================================================
// 3. BOUNTY CONTRACT (The Comeback Mechanic)
// ============================================================

export async function getActiveBounty(): Promise<BountyEvent | null> {
  if (!GENLAYER_ENABLED || CONTRACT_ADDRESS_BOUNTY.length < 10) return null;
  try {
    const raw = await getClient().readContract({
      address: CONTRACT_ADDRESS_BOUNTY as `0x${string}`,
      functionName: 'get_bounty',
      args: [],
    });
    if (typeof raw === 'string') return JSON.parse(raw) as BountyEvent;
    return raw as any;
  } catch (err) {
    return null;
  }
}

export async function checkBountyEvent(blueScore: number, redScore: number, topPlayerId: string, kills: number): Promise<boolean> {
  if (!GENLAYER_ENABLED || CONTRACT_ADDRESS_BOUNTY.length < 10) return false;
  try {
    const client = getClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS_BOUNTY as `0x${string}`,
      functionName: 'check_for_bounty',
      args: [BigInt(blueScore), BigInt(redScore), topPlayerId, BigInt(kills)],
      value: 0n,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction timeout')), 30000)
    );
    await Promise.race([
      client.waitForTransactionReceipt({ hash, status: 'ACCEPTED' as any }),
      timeoutPromise
    ]);
    return true;
  } catch (err) {
    return false;
  }
}

// ============================================================
// 4. BOSS CONTRACT (The Adaptive Enemy)
// ============================================================

export async function getLatestBoss(): Promise<BossConfig | null> {
  if (!GENLAYER_ENABLED || CONTRACT_ADDRESS_BOSS.length < 10) return null;
  try {
    const raw = await getClient().readContract({
      address: CONTRACT_ADDRESS_BOSS as `0x${string}`,
      functionName: 'get_latest_boss',
      args: [],
    });
    if (typeof raw === 'string') return JSON.parse(raw) as BossConfig;
    return raw as any;
  } catch (err) {
    return null;
  }
}

export async function generateWave10Boss(favoritePowerup: string, mostDamageFrom: string, avgAccuracy: number): Promise<boolean> {
  if (!GENLAYER_ENABLED || CONTRACT_ADDRESS_BOSS.length < 10) return false;
  try {
    const client = getClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS_BOSS as `0x${string}`,
      functionName: 'generate_boss_for_wave_10',
      args: [favoritePowerup, mostDamageFrom, avgAccuracy],
      value: 0n,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction timeout')), 30000)
    );
    await Promise.race([
      client.waitForTransactionReceipt({ hash, status: 'ACCEPTED' as any }),
      timeoutPromise
    ]);
    return true;
  } catch (err) {
    return false;
  }
}
