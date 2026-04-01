// ============================================================
// GenLayer Module – Wave Manager
// ============================================================
// This is the high-level bridge between the game engine and
// the GenLayer client. Import THIS in your React components.
//
// Usage example (inside GameCanvas.tsx):
//
//   import { GenLayerWaveManager } from '../genlayer';
//
//   const waveManager = new GenLayerWaveManager();
//
//   // At end of each wave:
//   const config = await waveManager.handleWaveEnd({
//     kills, damage_taken, health_pct, shots_fired, shots_hit
//   });
//   // config is a WaveConfig — apply it to the engine.
// ============================================================

import { 
  fetchNextWaveConfig, reportWaveResult, 
  fetchChampion, submitRefereeRun, 
  getActiveBounty, checkBountyEvent, 
  getLatestBoss, generateWave10Boss, 
  GENLAYER_ENABLED 
} from './client';
import type { WaveConfig, WaveReport, RefereeResult, BountyEvent, BossConfig, GenLayerStatus } from './types';

// ── Fallback wave config (used when GenLayer is offline) ──────
function buildFallbackConfig(wave: number): WaveConfig {
  return {
    wave,
    enemy_count:      Math.min(5 + wave * 2, 25),
    enemy_speed_mult: Math.min(1 + wave * 0.08, 1.8),
    enemy_hp_mult:    Math.min(1 + wave * 0.12, 2.2),
    spawn_rate_mult:  Math.max(1 - wave * 0.05, 0.5),
    event:            'none',
    flavor_text:      `Wave ${wave} incoming!`,
  };
}

// ── Main manager class ────────────────────────────────────────
export class GenLayerWaveManager {
  status: GenLayerStatus = 'idle';
  private _onStatusChange?: (s: GenLayerStatus) => void;

  /** Subscribe to status changes (for showing loading UI) */
  onStatusChange(cb: (s: GenLayerStatus) => void) {
    this._onStatusChange = cb;
  }

  private setStatus(s: GenLayerStatus) {
    this.status = s;
    this._onStatusChange?.(s);
  }

  /**
   * Call this at the END of each wave.
   */
  async handleWaveEnd(report: WaveReport, currentWave: number): Promise<WaveConfig> {
    if (!GENLAYER_ENABLED) return buildFallbackConfig(currentWave + 1);

    this.setStatus('generating');
    try {
      const success = await reportWaveResult(report);
      if (!success) { this.setStatus('error'); return buildFallbackConfig(currentWave + 1); }
      const config = await fetchNextWaveConfig();
      if (!config) { this.setStatus('error'); return buildFallbackConfig(currentWave + 1); }
      this.setStatus('ready');
      return config;
    } catch (err) {
      this.setStatus('error');
      return buildFallbackConfig(currentWave + 1);
    }
  }

  /**
   * Call this on Game Over to generate the Champion Title.
   */
  async handleRefereeSubmission(playerName: string, score: number, waves: number, accuracy: number): Promise<RefereeResult | null> {
    if (!GENLAYER_ENABLED) return null;
    this.setStatus('generating');
    
    // Fallback locally logic to prevent infinite waiting if testnet hangs
    let timeoutPromise = new Promise((resolve) => setTimeout(resolve, 8000)).then(() => false);
    let submitPromise = submitRefereeRun(playerName, score, waves, accuracy);
    const success = await Promise.race([submitPromise, timeoutPromise]);
    
    if (!success) { this.setStatus('error'); return null; }
    
    const result = await fetchChampion();
    this.setStatus('ready');
    return result;
  }

  /**
   * Call this every 30s during TDM.
   */
  async checkBounty(blue: number, red: number, topId: string, kills: number): Promise<BountyEvent | null> {
    if (!GENLAYER_ENABLED) return null;
    await checkBountyEvent(blue, red, topId, kills);
    return await getActiveBounty();
  }

  /**
   * Call this at wave 9 end.
   */
  async generateBoss(favPowerup: string, mostDmgFrom: string, avgAcc: number): Promise<BossConfig | null> {
    if (!GENLAYER_ENABLED) return null;
    this.setStatus('generating');
    const success = await generateWave10Boss(favPowerup, mostDmgFrom, avgAcc);
    if (!success) { this.setStatus('error'); return null; }
    const boss = await getLatestBoss();
    this.setStatus('ready');
    return boss;
  }

  /** Check if GenLayer is active */
  get isEnabled() {
    return GENLAYER_ENABLED;
  }
}

// ── Singleton instance ──────────────────────────────────────
export const waveManager = new GenLayerWaveManager();
