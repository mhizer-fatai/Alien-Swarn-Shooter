// ============================================================
// GenLayer Module – Types
// ============================================================

/** Configuration for a single AI-generated wave. Returned by the contract. */
export interface WaveConfig {
  wave: number;

  /** How many enemies to allow alive on screen at once */
  enemy_count: number;

  /** Multiplier applied to base enemy movement speed (1.0 = default) */
  enemy_speed_mult: number;

  /** Multiplier applied to base enemy HP (1.0 = default) */
  enemy_hp_mult: number;

  /** Multiplier applied to spawn interval (lower = faster) */
  spawn_rate_mult: number;

  /** Special mid-wave event: none | ambush | boss */
  event: 'none' | 'ambush' | 'boss';

  /** Short flavour text shown in the HUD during wave transition */
  flavor_text: string;
}

/** Stats sent to the contract after a wave ends */
export interface WaveReport {
  kills: number;
  damage_taken: number;
  /** 0.0 – 1.0 */
  health_pct: number;
  shots_fired: number;
  shots_hit: number;
}

/** Result returned by the Referee Contract */
export interface RefereeResult {
  player: string;
  score: number;
  title: string;
}

/** Bounty event returned by the Bounty Contract */
export interface BountyEvent {
  has_bounty: boolean;
  target_id: string;
  multiplier: number;
  flavor_text: string;
}

/** Configuration for the Wave 10 Boss */
export interface BossConfig {
  boss_name: string;
  hp_mult: number;
  speed_mult: number;
  ability: 'none' | 'laser_sweep' | 'spawn_minions' | 'shield_regen';
  flavor_text: string;
}

/** Possible connection states for the GenLayer client */
export type GenLayerStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'generating'
  | 'error';
