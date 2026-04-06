import { Entity, GameState, Biome, PowerUpType } from './types';

const WORLD_SIZE = 3000;
const PLAYER_SPEED = 250;
const FIRE_RATE = 0.15;

export interface ReviveBeacon {
  id: string;
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  team: number;
  timer: number; // 30s despawn countdown
  reviveProgress: number; // 0-3 seconds (filled by nearby teammate)
}

export function seededRandom(seed: number) {
  let t = seed;
  return function() {
    t = t + 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
}

export class TdmEngine {
  state: GameState;
  lastTime: number;
  fireTimer: number;
  nextEntityId: number = 0;
  myTeam: number;
  reviveBeacons: ReviveBeacon[] = [];
  onFire?: (rate: number) => void;
  onPvpCollision?: (remoteId: string, damage: number) => void;
  onReviveComplete?: (beaconId: string, playerId: string) => void;

  constructor(biome: Biome, targetScore: number = 30, mapSeed: number = 0, playerIndex: number = 0, teamIndex: number = 0) {
    this.myTeam = teamIndex;
    this.state = this.createInitialState(biome, targetScore, mapSeed, playerIndex, teamIndex);
    this.lastTime = performance.now();
    this.fireTimer = 0;
  }

  getId(): string {
    return `entity_${this.nextEntityId++}`;
  }

  createInitialState(biome: Biome, targetScore: number = 30, mapSeed: number = 0, playerIndex: number = 0, teamIndex: number = 0): GameState {
    const rng = mapSeed ? seededRandom(mapSeed) : Math.random;

    // Team 0 (Blue) spawns on left half, Team 1 (Red) spawns on right half
    // Spread vertically based on playerIndex within the team
    const teamBaseX = teamIndex === 0 ? 300 : WORLD_SIZE - 300;
    const ySpacing = WORLD_SIZE / 5; // divide into 5 slots, use middle 4
    const playerY = ySpacing * (playerIndex + 1);

    const player: Entity = {
      id: 'player', type: 'player',
      x: teamBaseX,
      y: playerY,
      z: 0,
      radius: 16, height: 32,
      color: teamIndex === 0 ? '#2563eb' : '#ef4444', // blue or red
      vx: 0, vy: 0, hp: 100, maxHp: 100, damage: 25, speed: PLAYER_SPEED, angle: 0,
      activePowerUps: {}
    };

    const trees: Entity[] = [];
    const numTrees = biome === 'forest' ? 50 : biome === 'savanna' ? 70 : 35;

    for (let i = 0; i < numTrees; i++) {
      let color = '#166534';
      if (biome === 'savanna') color = rng() > 0.5 ? '#854d0e' : '#a16207';
      if (biome === 'desert') color = '#b45309';

      trees.push({
        id: this.getId(), type: 'tree',
        x: rng() * WORLD_SIZE, y: rng() * WORLD_SIZE, z: 0,
        radius: 15 + rng() * 20, height: 50 + rng() * 80,
        color,
        vx: 0, vy: 0, hp: 1, maxHp: 1, damage: 0, speed: 0, angle: 0
      });
    }

    return {
      player, enemies: [], bullets: [], particles: [], trees, powerups: [],
      remotePlayers: [],
      biome, score: 0, wave: 1, isGameOver: false,
      worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE,
      camera: { x: player.x, y: player.y },
      isDown: false,
      downTimer: 0,
      revivesUsed: 0,
      maxRevives: 99,
      isJointOps: false,
      waveElapsed: 0,
      isSpectating: false,
      is1v1: false,
      pvpTimer: 300, // 5 minutes for TDM
      pvpTargetScore: targetScore,
      pvpScores: {},
      pvpRespawnTimer: 0
    };
  }

  update(input: any, canvasWidth: number, canvasHeight: number) {
    if (this.state.isGameOver) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // If downed, don't allow movement/shooting — just update camera + beacons
    if (this.state.isDown) {
      this.updateCamera(canvasWidth, canvasHeight);
      this.updateBullets(dt);
      this.updateParticles(dt);
      this.updateBeacons(dt);
      this.state.pvpTimer -= dt;
      return;
    }

    this.updatePlayer(dt, input, canvasWidth, canvasHeight);
    this.updateCamera(canvasWidth, canvasHeight);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.checkCollisions();
    this.checkPvpCollisions();
    this.updateBeacons(dt);
    this.checkReviveProximity(dt);

    if (this.state.pvpRespawnTimer > 0) {
      this.state.pvpRespawnTimer -= dt;
    }
    this.state.pvpTimer -= dt;
  }

  updateBeacons(dt: number) {
    for (let i = this.reviveBeacons.length - 1; i >= 0; i--) {
      this.reviveBeacons[i].timer -= dt;
      if (this.reviveBeacons[i].timer <= 0) {
        this.reviveBeacons.splice(i, 1);
      }
    }
  }

  checkReviveProximity(dt: number) {
    if (this.state.isDown || this.state.player.hp <= 0) return;

    const p = this.state.player;
    for (const beacon of this.reviveBeacons) {
      // Only revive teammates
      if (beacon.team !== this.myTeam) continue;

      const dx = p.x - beacon.x;
      const dy = p.y - beacon.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 50) { // Within revive range
        beacon.reviveProgress += dt;
        if (beacon.reviveProgress >= 3) {
          // Revive complete!
          if (this.onReviveComplete) {
            this.onReviveComplete(beacon.id, beacon.playerId);
          }
          // Remove beacon locally (server will confirm)
          const idx = this.reviveBeacons.indexOf(beacon);
          if (idx >= 0) this.reviveBeacons.splice(idx, 1);
          break;
        }
      } else {
        // Reset progress if player walks away
        beacon.reviveProgress = Math.max(0, beacon.reviveProgress - dt * 2);
      }
    }
  }

  addBeacon(beacon: ReviveBeacon) {
    this.reviveBeacons.push(beacon);
  }

  removeBeacon(beaconId: string) {
    const idx = this.reviveBeacons.findIndex(b => b.id === beaconId);
    if (idx >= 0) this.reviveBeacons.splice(idx, 1);
  }

  updatePlayer(dt: number, input: any, canvasWidth: number, canvasHeight: number) {
    const p = this.state.player;

    let dx = input.joystick.dx;
    let dy = input.joystick.dy;
    if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      p.vx = (dx / len) * p.speed;
      p.vy = (dy / len) * p.speed;
    } else {
      p.vx = 0;
      p.vy = 0;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.x = Math.max(p.radius, Math.min(this.state.worldWidth - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(this.state.worldHeight - p.radius, p.y));

    // Aiming
    const screenPlayerX = canvasWidth / 2;
    const screenPlayerY = canvasHeight / 2;

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (isTouch) {
      if (input.aimJoystick.active) {
        const mag = Math.sqrt(input.aimJoystick.dx * input.aimJoystick.dx + input.aimJoystick.dy * input.aimJoystick.dy);
        if (mag > 0.1) {
          const targetAngle = Math.atan2(input.aimJoystick.dy, input.aimJoystick.dx);
          const diff = targetAngle - p.angle;
          const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
          p.angle += normalizedDiff * Math.min(1, dt * 10);
        }
      }
    } else {
      if (input.mouse.isDown || input.mouse.x !== 0 || input.mouse.y !== 0) {
        p.angle = Math.atan2(input.mouse.y - screenPlayerY, input.mouse.x - screenPlayerX);
      }
    }

    // Shooting
    const currentFireRate = FIRE_RATE;
    this.fireTimer -= dt;
    if ((input.mouse.isDown || input.shootButtonDown || input.aimJoystick.active) && this.fireTimer <= 0) {
      this.fireTimer = currentFireRate;
      if (this.onFire) this.onFire(currentFireRate);
      const bulletSpeed = 800;

      this.state.bullets.push({
        id: this.getId(), type: 'bullet',
        x: p.x + Math.cos(p.angle) * p.radius,
        y: p.y + Math.sin(p.angle) * p.radius,
        z: p.height / 2,
        radius: 4, height: 4,
        color: this.myTeam === 0 ? '#60a5fa' : '#f87171', // blue or red bullets
        vx: Math.cos(p.angle) * bulletSpeed,
        vy: Math.sin(p.angle) * bulletSpeed,
        hp: 1, maxHp: 1, damage: p.damage, speed: bulletSpeed, angle: p.angle,
        life: 1.5, maxLife: 1.5
      });
    }
  }

  updateCamera(canvasWidth: number, canvasHeight: number) {
    const targetX = this.state.player.x;
    const targetY = this.state.player.y;
    this.state.camera.x += (targetX - this.state.camera.x) * 0.1;
    this.state.camera.y += (targetY - this.state.camera.y) * 0.1;
  }

  updateBullets(dt: number) {
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life! -= dt;
      if (b.life! <= 0) {
        this.state.bullets.splice(i, 1);
      }
    }
  }

  updateParticles(dt: number) {
    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      const p = this.state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.speed * dt;
      p.speed -= 800 * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
      p.life! -= dt;
      if (p.life! <= 0) {
        this.state.particles.splice(i, 1);
      }
    }
  }

  checkCollisions() {
    // Player vs Trees
    const p = this.state.player;
    for (const t of this.state.trees) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = p.radius + t.radius;
      if (dist < minDist) {
        const overlap = minDist - dist;
        p.x += (dx / dist) * overlap;
        p.y += (dy / dist) * overlap;
      }
    }
  }

  checkPvpCollisions() {
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      let hit = false;

      for (const rp of this.state.remotePlayers) {
        // Skip teammates — only hit enemy team
        if (rp.team === this.myTeam) continue;
        if (rp.isDown || rp.hp <= 0) continue;

        const dx = b.x - rp.x;
        const dy = b.y - rp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < b.radius + 16) {
          hit = true;
          if (this.onPvpCollision) {
            this.onPvpCollision(rp.id, b.damage);
          }
          this.spawnParticles(rp.x, rp.y, 16, '#ef4444', 3);
          break;
        }
      }

      if (hit) {
        this.state.bullets.splice(i, 1);
      }
    }
  }

  spawnParticles(x: number, y: number, z: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 150;
      this.state.particles.push({
        id: this.getId(), type: 'particle',
        x, y, z,
        radius: 2 + Math.random() * 3, height: 2, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hp: 1, maxHp: 1, damage: 0, speed: 100 + Math.random() * 200,
        angle: 0, life: 0.5 + Math.random() * 0.5, maxLife: 1
      });
    }
  }
}
