import { GameState, Entity, RemotePlayer } from './types';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  enemyImage: HTMLImageElement;
  playerImage: HTMLImageElement;
  bgImage: HTMLImageElement;
  powerupImages: Record<string, HTMLImageElement>;
  currentBgWave: number = -1;
  localPlayerName: string = '';
  myTeam: number = -1; // -1 = not TDM

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.enemyImage = new Image();
    this.enemyImage.src = '/enemy_sprite.png';
    this.playerImage = new Image();
    this.playerImage.src = '/player.png';

    this.bgImage = new Image();
    this.currentBgWave = -1;

    // Load powerup images
    this.powerupImages = {
      health: new Image(),
      rapidFire: new Image(),
      invincibility: new Image(),
      spreadShot: new Image()
    };
    this.powerupImages.health.src = '/health.png';
    this.powerupImages.rapidFire.src = '/rapidFire.png';
    this.powerupImages.invincibility.src = '/invincibility.png';
    this.powerupImages.spreadShot.src = '/spreadShot.png';
  }

  render(state: GameState, width: number, height: number) {
    if (this.currentBgWave !== state.wave) {
      this.currentBgWave = state.wave;
      const availableBgs = [1, 2, 5, 6, 7, 8];
      const randomBgIndex = availableBgs[Math.floor(Math.random() * availableBgs.length)];
      this.bgImage.src = `/bg${randomBgIndex}.jpg`;
    }

    // Clear the canvas to black just in case
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.save();
    // Camera transform
    this.ctx.translate(width / 2 - state.camera.x, height / 2 - state.camera.y);

    // Draw background texture locked to the game world (so player moves over it)
    if (this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      const ptrn = this.ctx.createPattern(this.bgImage, 'repeat');
      if (ptrn) {
        this.ctx.fillStyle = ptrn;
        // Tile infinitely across the visible camera space so we never see black edges
        this.ctx.fillRect(state.camera.x - width, state.camera.y - height, width * 2, height * 2);
      }
    } else {
      // Fallback
      this.ctx.fillStyle = state.biome === 'forest' ? '#4ade80' : state.biome === 'savanna' ? '#fde047' : '#fef08a';
      this.ctx.fillRect(state.camera.x - width, state.camera.y - height, width * 2, height * 2);
    }

    // Optional grid lines over the terrain
    this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    this.ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x <= state.worldWidth; x += gridSize) {
      this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, state.worldHeight); this.ctx.stroke();
    }
    for (let y = 0; y <= state.worldHeight; y += gridSize) {
      this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(state.worldWidth, y); this.ctx.stroke();
    }

    // World bounds
    this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    this.ctx.lineWidth = 5;
    this.ctx.strokeRect(0, 0, state.worldWidth, state.worldHeight);

    // Sort entities by Y for 2.5D depth
    const allEntities = [state.player, ...state.enemies, ...state.trees, ...state.bullets, ...state.particles, ...state.powerups];
    allEntities.sort((a, b) => a.y - b.y);

    // Draw shadows
    allEntities.forEach(e => {
      if (e.type !== 'particle' && e.type !== 'bullet') {
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.5, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    // Draw entities
    allEntities.forEach(e => {
      if (e.type === 'player' && state.isDown) {
        this.ctx.globalAlpha = 0.3;
        this.drawEntity(e);
        this.ctx.globalAlpha = 1.0;
      } else {
        this.drawEntity(e);
      }
    });

    // Draw local player name
    if (this.localPlayerName) {
      this.drawPlayerName(state.player.x, state.player.y - state.player.height - 15, this.localPlayerName, '#60a5fa');
    }

    // Draw remote players (allies in Joint Ops, enemies in 1v1/TDM)
    for (const rp of state.remotePlayers) {
      const isEnemy = state.is1v1 || (this.myTeam >= 0 && rp.team !== this.myTeam);
      this.drawRemotePlayer(rp, isEnemy);
    }

    // Draw clone Ghost Ship
    if ((state.player.activePowerUps?.cloneShip ?? 0) > 0) {
      const p = state.player;
      const offsetAngle = p.angle + Math.PI / 2;
      const cloneX = p.x + Math.cos(offsetAngle) * 40;
      const cloneY = p.y + Math.sin(offsetAngle) * 40;

      this.ctx.globalAlpha = 0.5; // ghostly semi-transparent
      const cloneEntity = { ...p, x: cloneX, y: cloneY, angle: state.cloneAngle || p.angle };
      this.drawEntity(cloneEntity);
      this.ctx.globalAlpha = 1.0;
    }

    this.ctx.restore();
  }

  drawRemotePlayer(rp: RemotePlayer, isEnemy: boolean = false) {
    const isDowned = rp.isDown || rp.hp <= 0;

    if (isDowned) {
      this.ctx.globalAlpha = 0.3;
    }

    // Shadow
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(rp.x, rp.y, 16, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();

    if (this.playerImage && this.playerImage.complete && this.playerImage.naturalWidth > 0) {
      this.ctx.save();
      this.ctx.translate(rp.x, rp.y - 16);
      this.ctx.rotate(rp.angle + Math.PI / 2);
      const size = 16 * 3.5;
      
      if (isDowned) {
        this.ctx.globalAlpha = 0.3;
      }
      
      if (isEnemy) {
        // Red tint for enemy player
        this.ctx.filter = 'sepia(1) saturate(5) hue-rotate(-50deg)';
      }
      
      this.ctx.drawImage(this.playerImage, -size / 2, -size / 2, size, size);
      
      // Reset filter
      this.ctx.filter = 'none';
      this.ctx.restore();
    } else {
      this.ctx.save();
      this.ctx.translate(rp.x, rp.y);
      this.ctx.rotate(rp.angle);

      // Ship body - fallback geometric shape
      this.ctx.fillStyle = isEnemy ? '#ef4444' : '#22c55e';
      this.ctx.beginPath();
      this.ctx.moveTo(16, 0); // nose
      this.ctx.lineTo(-12, -12); // left wing
      this.ctx.lineTo(-8, 0); // back indent
      this.ctx.lineTo(-12, 12); // right wing
      this.ctx.closePath();
      this.ctx.fill();

      // Ship cockpit
      this.ctx.fillStyle = '#60a5fa'; // light blue glass
      this.ctx.beginPath();
      this.ctx.ellipse(2, 0, 6, 4, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Engine glow
      if (rp.hp > 0) {
        this.ctx.fillStyle = '#f59e0b';
        this.ctx.beginPath();
        this.ctx.moveTo(-8, -4);
        this.ctx.lineTo(-18, 0);
        this.ctx.lineTo(-8, 4);
        this.ctx.closePath();
        this.ctx.fill();
      }

      this.ctx.restore();
    }

    this.ctx.globalAlpha = 1.0;

    // Draw Name and HP Bar above ship
    this.drawPlayerName(rp.x, rp.y - 45, rp.name, isEnemy ? '#fca5a5' : '#86efac');
    
    if (isDowned) {
      this.ctx.save();
      this.ctx.font = 'bold 14px Arial, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = '#ef4444';
      this.ctx.fillText('DOWNED', rp.x, rp.y - 50);
      this.ctx.restore();
    } else {
      // HP bar
      if (rp.hp < rp.maxHp) {
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(rp.x - 16, rp.y - 42, 32, 4);
        this.ctx.fillStyle = '#22c55e';
        this.ctx.fillRect(rp.x - 16, rp.y - 42, 32 * (rp.hp / rp.maxHp), 4);
      }
    }

    this.ctx.globalAlpha = 1.0;

    // Player name
    this.drawPlayerName(rp.x, rp.y - (isDowned ? 62 : 50), rp.name, isDowned ? '#ef4444' : '#4ade80');
  }

  drawPlayerName(x: number, y: number, name: string, color: string) {
    this.ctx.save();
    this.ctx.font = 'bold 12px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Background pill
    const metrics = this.ctx.measureText(name);
    const padding = 4;
    const bgWidth = metrics.width + padding * 2;
    const bgHeight = 16;
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.beginPath();
    this.ctx.roundRect(x - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight, 4);
    this.ctx.fill();

    // Text
    this.ctx.fillStyle = color;
    this.ctx.fillText(name, x, y);
    this.ctx.restore();
  }

  drawEntity(e: Entity) {
    try {
      this._drawEntityInternal(e);
    } catch (err) {
      console.error('Error drawing entity', e, err);
    }
  }

  _drawEntityInternal(e: Entity) {
    if (e.type === 'tree') {
      // Trunk
      this.ctx.fillStyle = '#78350f'; // dark brown
      this.ctx.fillRect(e.x - e.radius * 0.2, e.y - e.height, e.radius * 0.4, e.height);
      // Leaves
      this.ctx.fillStyle = e.color;
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y - e.height, e.radius, 0, Math.PI * 2);
      this.ctx.fill();
      // Highlight
      this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
      this.ctx.beginPath();
      this.ctx.arc(e.x - e.radius * 0.2, e.y - e.height - e.radius * 0.2, e.radius * 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (e.type === 'player') {
      if (this.playerImage && this.playerImage.complete && this.playerImage.naturalWidth > 0) {
        // Player Image
        this.ctx.save();
        this.ctx.translate(e.x, e.y - e.height / 2);
        this.ctx.rotate(e.angle + Math.PI / 2); // Rotate to face target (image faces UP by default)
        const size = e.radius * 3.5;
        this.ctx.drawImage(this.playerImage, -size / 2, -size / 2, size, size);
        this.ctx.restore();
      } else {
        // Body
        this.ctx.fillStyle = e.color;
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y - e.height / 2, e.radius, 0, Math.PI * 2);
        this.ctx.fill();
        // Head
        this.ctx.fillStyle = '#fca5a5'; // skin color
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y - e.height, e.radius * 0.7, 0, Math.PI * 2);
        this.ctx.fill();
        // Gun
        this.ctx.save();
        this.ctx.translate(e.x, e.y - e.height / 2);
        this.ctx.rotate(e.angle);
        this.ctx.fillStyle = '#1f2937'; // dark gray
        this.ctx.fillRect(0, -4, e.radius * 1.8, 8);
        this.ctx.fillStyle = '#9ca3af'; // light gray barrel
        this.ctx.fillRect(e.radius * 1.8, -2, 6, 4);
        this.ctx.restore();
      }

      // Invincibility Shield
      if ((e.activePowerUps?.invincibility ?? 0) > 0) {
        this.ctx.strokeStyle = '#06b6d4';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y - e.height / 2, e.radius * 1.5, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
        this.ctx.fill();
      }
    } else if (e.type === 'enemy') {
      if (this.enemyImage && this.enemyImage.complete && this.enemyImage.naturalWidth > 0) {
        // Enemy Image Sprite Sheet (5x5)
        this.ctx.save();
        if (e.height === undefined) e.height = e.radius * 2; // Safety fallback
        this.ctx.translate(e.x, e.y - e.height / 2);
        this.ctx.rotate(e.angle - Math.PI / 2); // Rotate to face target

        const cols = 5;
        const rows = 5;
        const totalFrames = cols * rows;
        // Animate based on time (50ms per frame)
        const frameIndex = Math.floor(Date.now() / 50) % totalFrames;
        const col = frameIndex % cols;
        const row = Math.floor(frameIndex / cols);

        const frameW = this.enemyImage.naturalWidth / cols;
        const frameH = this.enemyImage.naturalHeight / rows;

        const size = e.radius * 3.5;
        this.ctx.drawImage(
          this.enemyImage,
          col * frameW, row * frameH, frameW, frameH,
          -size / 2, -size / 2, size, size
        );
        this.ctx.restore();
      } else {
        // Fallback shape if image is loading or missing
        this.ctx.fillStyle = e.color;
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y - e.height / 2, e.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Health bar
      if (e.hp < e.maxHp) {
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(e.x - e.radius, e.y - e.height - 10, e.radius * 2, 4);
        this.ctx.fillStyle = '#22c55e';
        this.ctx.fillRect(e.x - e.radius, e.y - e.height - 10, (e.radius * 2) * (e.hp / e.maxHp), 4);
      }
    } else if (e.type === 'bullet') {
      this.ctx.fillStyle = e.color;
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y - e.z, e.radius, 0, Math.PI * 2);
      this.ctx.fill();
      // Glow
      this.ctx.shadowColor = e.color;
      this.ctx.shadowBlur = 10;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    } else if (e.type === 'particle') {
      this.ctx.fillStyle = e.color;
      this.ctx.globalAlpha = Math.max(0, e.life! / e.maxLife!);
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y - e.z, e.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
    } else if (e.type === 'powerup') {
      this.ctx.save();
      this.ctx.translate(e.x, e.y - Math.sin(Date.now() / 200) * 5 - 5); // floating effect

      const type = e.powerUpType!;
      const img = this.powerupImages[type];

      let color = '#fff';
      let symbol = '';
      if (type === 'health') { color = '#ef4444'; symbol = '+'; }
      else if (type === 'rapidFire') { color = '#f97316'; symbol = '>>>'; }
      else if (type === 'invincibility') { color = '#06b6d4'; symbol = 'O'; }
      else if (type === 'spreadShot') { color = '#a855f7'; symbol = 'W'; }
      else if (type === 'cloneShip') { color = '#3b82f6'; symbol = 'x2'; }

      if (img && img.complete && img.naturalWidth > 0) {
        // Glow behind image
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 15;
        const size = e.radius * 3.5;
        this.ctx.drawImage(img, -size / 2, -size / 2, size, size);
      } else {
        // Glow
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 15;

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 14px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(symbol, 0, 1);
      }

      this.ctx.restore();
    }
  }
}
