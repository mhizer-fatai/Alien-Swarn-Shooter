import { Entity, GameState, Biome, PowerUpType } from './types';

const WORLD_SIZE = 2000;
const PLAYER_SPEED = 250;
const ENEMY_SPEED_BASE = 120;
const FIRE_RATE = 0.15; // seconds between shots

export function seededRandom(seed: number) {
  let t = seed;
  return function() {
    t = t + 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
}

export class GameEngine {
  state: GameState;
  lastTime: number;
  spawnTimer: number;
  waveTimer: number;
  fireTimer: number;
  cloneFireTimer: number = 0;
  nextEntityId: number = 0;
  onFire?: (rate: number) => void;

  onPvpCollision?: (remoteId: string, damage: number) => void;

  constructor(biome: Biome, isJointOps: boolean = false, is1v1: boolean = false, targetScore: number = 10, mapSeed: number = 0, playerIndex: number = 0) {
    this.state = this.createInitialState(biome, isJointOps, is1v1, targetScore, mapSeed, playerIndex);
    this.lastTime = performance.now();
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.fireTimer = 0;
  }

  getId(): string {
    return `entity_${this.nextEntityId++}`;
  }

  createInitialState(biome: Biome, isJointOps: boolean = false, is1v1: boolean = false, targetScore: number = 10, mapSeed: number = 0, playerIndex: number = 0): GameState {
    const rng = mapSeed ? seededRandom(mapSeed) : Math.random;

    const player: Entity = {
      id: 'player', type: 'player',
      x: is1v1 ? (playerIndex === 0 ? 300 : WORLD_SIZE - 300) : WORLD_SIZE / 2, 
      y: is1v1 ? WORLD_SIZE / 2 : WORLD_SIZE / 2, 
      z: 0,
      radius: 16, height: 32, color: '#2563eb', // blue soldier
      vx: 0, vy: 0, hp: 100, maxHp: 100, damage: 25, speed: PLAYER_SPEED, angle: 0,
      activePowerUps: {}
    };

    const trees: Entity[] = [];
    const numTrees = biome === 'forest' ? 30 : biome === 'savanna' ? 50 : 20;

    for (let i = 0; i < numTrees; i++) {
      let color = '#166534'; // forest green
      if (biome === 'savanna') color = rng() > 0.5 ? '#854d0e' : '#a16207'; // brownish
      if (biome === 'desert') color = '#b45309'; // cactus/dead tree

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
      // Auto-revive (Joint Ops)
      isDown: false,
      downTimer: 0,
      revivesUsed: 0,
      maxRevives: 3,
      isJointOps,
      waveElapsed: 0,
      isSpectating: false,
      
      // 1v1 PvP Mode
      is1v1,
      pvpTimer: 240, // 4 minutes
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

    // Spectating: world keeps running but player is dead
    if (this.state.isSpectating) {
      this.updateBullets(dt);
      this.updateEnemies(dt, true);
      this.updateParticles(dt);
      this.updatePowerups(dt);
      this.spawnEnemies(dt);
      return;
    }

    // Handle downed state (auto-revive countdown)
    if (this.state.isDown) {
      this.state.downTimer -= dt;
      if (this.state.downTimer <= 0) {
        // Respawn!
        this.state.isDown = false;
        this.state.downTimer = 0;
        this.state.player.hp = 70;
        this.state.revivesUsed++;
      }
      // While downed: still update camera, particles, enemies move, but player cannot act
      this.updateCamera(canvasWidth, canvasHeight);
      this.updateBullets(dt);
      this.updateEnemies(dt, true); // pass flag to skip damaging downed player
      this.updateParticles(dt);
      this.updatePowerups(dt);
      this.spawnEnemies(dt);
      return;
    }

    this.updatePlayer(dt, input, canvasWidth, canvasHeight);
    this.updateCamera(canvasWidth, canvasHeight);
    this.updateCloneShip(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.updatePowerups(dt);
    this.checkCollisions();

    if (this.state.is1v1) {
      if (this.state.enemies.length > 0) {
        this.state.enemies = []; // Aggressively ensure no enemies exist
      }
      if (this.state.pvpRespawnTimer > 0) {
        this.state.pvpRespawnTimer -= dt;
      }
      this.state.pvpTimer -= dt;
      this.checkPvpCollisions();
    } else {
      this.updateEnemies(dt);
      this.updateLevel(dt);
      this.spawnEnemies(dt);
    }
  }

  updatePowerups(dt: number) {
    for (let i = this.state.powerups.length - 1; i >= 0; i--) {
      const pu = this.state.powerups[i];
      pu.life! -= dt;
      if (pu.life! <= 0) {
        this.state.powerups.splice(i, 1);
      }
    }
  }

  updateCloneShip(dt: number) {
    const p = this.state.player;
    if ((p.activePowerUps?.cloneShip ?? 0) > 0) {
      let nearestEnemy: Entity | null = null;
      let minDist = Infinity;
      for (const e of this.state.enemies) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) { minDist = dist; nearestEnemy = e; }
      }

      let targetAngle = p.angle;
      if (nearestEnemy) {
        targetAngle = Math.atan2(nearestEnemy.y - p.y, nearestEnemy.x - p.x);

        // Auto shooting
        this.cloneFireTimer -= dt;
        if (this.cloneFireTimer <= 0) {
          const rate = FIRE_RATE * 0.8;
          this.cloneFireTimer = rate;

          const offsetAngle = p.angle + Math.PI / 2;
          const cloneX = p.x + Math.cos(offsetAngle) * 40;
          const cloneY = p.y + Math.sin(offsetAngle) * 40;

          this.state.bullets.push({
            id: this.getId(), type: 'bullet',
            x: cloneX, y: cloneY, z: p.height / 2,
            radius: 4, height: 4, color: '#60a5fa', // Blue clone laser
            vx: Math.cos(targetAngle) * 800,
            vy: Math.sin(targetAngle) * 800,
            hp: 1, maxHp: 1, damage: p.damage, speed: 800, angle: targetAngle,
            life: 1.5, maxLife: 1.5
          });
        }
      }

      if (this.state.cloneAngle === undefined) this.state.cloneAngle = targetAngle;
      const diff = targetAngle - this.state.cloneAngle;
      const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.state.cloneAngle += normalizedDiff * Math.min(1, dt * 10);
    }
  }

  updatePlayer(dt: number, input: any, canvasWidth: number, canvasHeight: number) {
    const p = this.state.player;

    // Movement
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

    // Clamp to world bounds
    p.x = Math.max(p.radius, Math.min(this.state.worldWidth - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(this.state.worldHeight - p.radius, p.y));

    // Decrement powerups
    if (p.activePowerUps) {
      for (const key in p.activePowerUps) {
        const k = key as PowerUpType;
        if (p.activePowerUps[k]! > 0) {
          p.activePowerUps[k]! -= dt;
        }
      }
    }

    // Aiming
    const screenPlayerX = canvasWidth / 2;
    const screenPlayerY = canvasHeight / 2;

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (isTouch) {
      if (input.aimJoystick.active) {
        const mag = Math.sqrt(input.aimJoystick.dx * input.aimJoystick.dx + input.aimJoystick.dy * input.aimJoystick.dy);
        if (mag > 0.1) {
          const targetAngle = Math.atan2(input.aimJoystick.dy, input.aimJoystick.dx);
          // Smoothly rotate the player towards the target angle - lower multiplier = slower rotation = less sensitive aiming
          const diff = targetAngle - p.angle;
          const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
          p.angle += normalizedDiff * Math.min(1, dt * 10); // slightly faster than movement rotation for snappy aiming
        }
      }
    } else {
      if (input.mouse.isDown || input.mouse.x !== 0 || input.mouse.y !== 0) {
        p.angle = Math.atan2(input.mouse.y - screenPlayerY, input.mouse.x - screenPlayerX);
      }
    }

    // Shooting
    const currentFireRate = (p.activePowerUps?.rapidFire ?? 0) > 0 ? FIRE_RATE * 0.3 : FIRE_RATE;
    this.fireTimer -= dt;
    if ((input.mouse.isDown || input.shootButtonDown || input.aimJoystick.active) && this.fireTimer <= 0) {
      this.fireTimer = currentFireRate;
      if (this.onFire) this.onFire(currentFireRate);
      const bulletSpeed = 800;
      const isSpread = (p.activePowerUps?.spreadShot ?? 0) > 0;
      const angles = isSpread ? [p.angle - 0.25, p.angle, p.angle + 0.25] : [p.angle];

      for (const a of angles) {
        this.state.bullets.push({
          id: this.getId(), type: 'bullet',
          x: p.x + Math.cos(a) * p.radius,
          y: p.y + Math.sin(a) * p.radius,
          z: p.height / 2,
          radius: 4, height: 4, color: '#fbbf24', // yellow bullet
          vx: Math.cos(a) * bulletSpeed,
          vy: Math.sin(a) * bulletSpeed,
          hp: 1, maxHp: 1, damage: p.damage, speed: bulletSpeed, angle: a,
          life: 1.5, maxLife: 1.5
        });
      }
    }
  }

  updateCamera(canvasWidth: number, canvasHeight: number) {
    // Smooth camera follow
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

  updateEnemies(dt: number, playerDowned: boolean = false) {
    if (this.state.is1v1) return;
    const p = this.state.player;
    for (let i = this.state.enemies.length - 1; i >= 0; i--) {
      const e = this.state.enemies[i];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        e.vx = (dx / dist) * e.speed;
        e.vy = (dy / dist) * e.speed;
        e.angle = Math.atan2(dy, dx);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Don't damage the player while they are downed
      if (playerDowned) continue;

      // Bite player
      if (dist < p.radius + e.radius) {
        if ((p.activePowerUps?.invincibility ?? 0) <= 0) {
          p.hp -= (e.damage * 0.25) * dt; // Continuous damage drastically reduced (quartered)
          if (p.hp <= 0) {
            if (this.state.isJointOps && this.state.revivesUsed < this.state.maxRevives) {
              // Enter downed state instead of game over
              this.state.isDown = true;
              this.state.downTimer = 10;
              p.hp = 0;
            } else if (this.state.isJointOps) {
              // No revives left — enter spectator mode
              this.state.isSpectating = true;
              p.hp = 0;
            } else {
              this.state.isGameOver = true;
            }
          }
        }
      }
    }
  }

  updateParticles(dt: number) {
    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      const p = this.state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.speed * dt; // use speed for vz
      p.speed -= 800 * dt; // gravity
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
    // Bullets vs Enemies
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      let hit = false;
      for (let j = this.state.enemies.length - 1; j >= 0; j--) {
        const e = this.state.enemies[j];
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.radius + e.radius) {
          e.hp -= b.damage;
          hit = true;

          // Blood particles
          this.spawnParticles(e.x, e.y, e.height / 2, e.color, 5);

          if (e.hp <= 0) {
            this.state.score += 10;
            this.state.enemies.splice(j, 1);

            // 15% chance to drop powerup
            if (Math.random() < 0.15) {
              const types: PowerUpType[] = ['health', 'rapidFire', 'invincibility', 'spreadShot'];
              if (this.state.wave >= 2) types.push('cloneShip');
              const pType = types[Math.floor(Math.random() * types.length)];
              this.state.powerups.push({
                id: this.getId(), type: 'powerup', powerUpType: pType,
                x: e.x, y: e.y, z: 0, radius: 12, height: 12,
                color: '#fff', vx: 0, vy: 0, hp: 1, maxHp: 1, damage: 0, speed: 0, angle: 0,
                life: 15, maxLife: 15
              });
            }
          }
          break;
        }
      }
      if (hit) {
        this.state.bullets.splice(i, 1);
      }
    }

    // Enemies vs Trees (simple separation)
    for (const e of this.state.enemies) {
      for (const t of this.state.trees) {
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = e.radius + t.radius;
        if (dist < minDist) {
          const overlap = minDist - dist;
          e.x += (dx / dist) * overlap;
          e.y += (dy / dist) * overlap;
        }
      }
    }

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

    // Player vs Powerups
    for (let i = this.state.powerups.length - 1; i >= 0; i--) {
      const pu = this.state.powerups[i];
      const dx = p.x - pu.x;
      const dy = p.y - pu.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < p.radius + pu.radius) {
        if (pu.powerUpType === 'health') {
          p.hp = Math.min(p.maxHp, p.hp + 50);
        } else if (pu.powerUpType) {
          p.activePowerUps![pu.powerUpType] = 10; // 10 seconds duration
        }
        this.state.powerups.splice(i, 1);
      }
    }
  }

  checkPvpCollisions() {
    if (!this.state.is1v1) return;

    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      let hit = false;

      for (const rp of this.state.remotePlayers) {
        if (rp.isDown || rp.hp <= 0) continue; // Skip dead players

        const dx = b.x - rp.x;
        const dy = b.y - rp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Assume remote player has a radius of 16 (same as local player)
        if (dist < b.radius + 16) {
          hit = true;
          if (this.onPvpCollision) {
            this.onPvpCollision(rp.id, b.damage);
          }
          break; // Bullet consumed
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
        hp: 1, maxHp: 1, damage: 0, speed: 100 + Math.random() * 200, // vz
        angle: 0, life: 0.5 + Math.random() * 0.5, maxLife: 1
      });
    }
  }

  updateLevel(dt: number) {
    this.waveTimer += dt;

    // ---- Wave progression ----
    if (this.state.isJointOps) {
      // JOINT OPS: Timer-based waves
      // Duration per wave: min(80, 45 + (wave-1) * 10)
      const waveDuration = Math.min(80, 45 + (this.state.wave - 1) * 10);
      this.state.waveElapsed += dt;

      if (this.state.waveElapsed >= waveDuration) {
        if (this.state.waveTransitionTime === undefined || this.state.waveTransitionTime === 0) {
          this.state.waveTransitionTime = 3;
          this.state.enemies = []; // Clear remaining enemies
        }
      }
    } else {
      // SOLO: Score-based waves (unchanged)
      // Wave 1 = 200, Wave 2 = 600, Wave 3 = 1200 ...
      const targetScore = this.state.wave * 200 + (this.state.wave * (this.state.wave - 1) * 100);

      if (this.state.score >= targetScore) {
        if (this.state.waveTransitionTime === undefined || this.state.waveTransitionTime === 0) {
          this.state.waveTransitionTime = 3;
          this.state.enemies = []; // Clear remaining enemies
        }
      }
    }

    // ---- Wave transition (shared) ----
    if (this.state.waveTransitionTime !== undefined && this.state.waveTransitionTime > 0) {
      this.state.waveTransitionTime -= dt;
      if (this.state.waveTransitionTime <= 0) {
        this.state.wave++;
        this.waveTimer = 0;
        this.state.waveElapsed = 0;
        this.state.waveTransitionTime = 0;

        // Clean slate for new wave (clear enemies, full heal)
        this.state.enemies = [];
        this.state.player.hp = this.state.player.maxHp;
      }
      return; // Do not spawn new enemies during intermission
    }
  }

  spawnEnemies(dt: number) {
    if (this.state.waveTransitionTime !== undefined && this.state.waveTransitionTime > 0) {
      return; // Do not spawn new enemies while GenLayer is thinking or timing down!
    }

    if (this.state.is1v1) {
      this.state.enemies = []; // Double guarantee
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const config = this.state.aiConfig;
      const spawnRateMult = config && config.spawn_rate_mult ? config.spawn_rate_mult : 1.0;
      const speedMult = config && config.speed_mult ? config.speed_mult : (config && config.enemy_speed_mult ? config.enemy_speed_mult : 1.0);
      const hpMult = config && config.hp_mult ? config.hp_mult : (config && config.enemy_hp_mult ? config.enemy_hp_mult : 1.0);
      const enemyCountBase = config && config.enemy_count ? config.enemy_count : Math.floor(1 + this.state.wave * 0.5);

      // Spawn rate increases with wave, modified by AI
      this.spawnTimer = Math.max(0.1, (1.5 - this.state.wave * 0.15) * spawnRateMult);

      // If Boss, spawn exactly 1 massive entity
      const isBoss = config && config.boss;
      const enemiesToSpawn = isBoss ? 1 : enemyCountBase;

      for (let i = 0; i < enemiesToSpawn; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 600 + Math.random() * 150;
        const x = this.state.player.x + Math.cos(angle) * dist;
        const y = this.state.player.y + Math.sin(angle) * dist;

        const colors = ['#ef4444', '#a855f7', '#ec4899', '#f97316'];
        const color = isBoss ? '#ffffff' : colors[Math.floor(Math.random() * colors.length)];

        this.state.enemies.push({
          id: this.getId(), type: 'enemy',
          x, y, z: 0,
          radius: isBoss ? 60 : (14 + Math.random() * 6), 
          height: isBoss ? 100 : (24 + Math.random() * 10), 
          color,
          vx: 0, vy: 0,
          hp: (40 + this.state.wave * 10) * hpMult * (isBoss ? 5 : 1), 
          maxHp: (40 + this.state.wave * 10) * hpMult * (isBoss ? 5 : 1),
          damage: (10 + this.state.wave * 5) * (isBoss ? 2 : 1), 
          speed: (ENEMY_SPEED_BASE + Math.random() * 50 + this.state.wave * 5) * speedMult,
          angle: 0
        });
      }
      
      // Stop spawning if it's a boss
      if (isBoss) this.spawnTimer = 9999;
    }
  }
}
