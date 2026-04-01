export type Vector2 = { x: number; y: number };
export type Biome = 'forest' | 'savanna' | 'desert';
export type PowerUpType = 'health' | 'rapidFire' | 'invincibility' | 'spreadShot' | 'cloneShip';

export interface Entity {
  id: string;
  type: 'player' | 'enemy' | 'tree' | 'bullet' | 'particle' | 'powerup';
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  color: string;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  angle: number;
  life?: number;
  maxLife?: number;
  powerUpType?: PowerUpType;
  activePowerUps?: Partial<Record<PowerUpType, number>>;
}

export interface RemotePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  isDown?: boolean;
  team?: number; // 0 = Blue, 1 = Red (TDM)
}

export interface GameState {
  player: Entity;
  enemies: Entity[];
  bullets: Entity[];
  particles: Entity[];
  trees: Entity[];
  powerups: Entity[];
  remotePlayers: RemotePlayer[];
  biome: Biome;
  score: number;
  wave: number;
  isGameOver: boolean;
  worldWidth: number;
  worldHeight: number;
  camera: Vector2;
  waveTransitionTime?: number;
  cloneAngle?: number;
  // Auto-revive (Joint Ops)
  isDown: boolean;
  downTimer: number;
  revivesUsed: number;
  maxRevives: number;
  isJointOps: boolean;
  waveElapsed: number;
  isSpectating: boolean;

  // 1v1 PvP Mode
  is1v1: boolean;
  pvpTimer: number; // 4 minutes
  pvpTargetScore: number;
  pvpScores: Record<string, number>;
  pvpRespawnTimer: number;

  // GenLayer AI Control
  aiConfig?: any;
}

