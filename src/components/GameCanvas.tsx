import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../game/Engine';
import { InputManager } from '../game/Input';
import { Renderer } from '../game/Renderer';
import { Biome, RemotePlayer } from '../game/types';
import { Joystick } from './Joystick';
import { ShootButton } from './ShootButton';
import { socket } from '../network/socket';

interface MultiplayerInfo {
  roomId: string;
  mode: string;
  players: { id: string; name: string }[];
  playerName?: string;
  targetScore?: number;
}

interface GameCanvasProps {
  biome: Biome;
  onGameOver: (score: number, wave: number) => void;
  multiplayerInfo?: MultiplayerInfo | null;
}

export function GameCanvas({ biome, onGameOver, multiplayerInfo }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const requestRef = useRef<number>(0);

  const [hud, setHud] = useState({
    hp: 100, score: 0, wave: 1, powerups: {} as Record<string, number>,
    waveTransition: 0, isDown: false, downTimer: 0, revivesUsed: 0, maxRevives: 3,
    waveElapsed: 0, isJointOps: false, isSpectating: false, spectatingName: '',
    is1v1: false, pvpTimer: 240, pvpTargetScore: 10, pvpScores: {} as Record<string, number>, pvpRespawnTimer: 0
  });
  const spectatingIndexRef = useRef(0);
  const hasEmittedEliminatedRef = useRef(false);
  const [isTouch] = useState(() => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  
  // GenLayer variables
  const isGeneratingRef = useRef(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [aiBroadcast, setAiBroadcast] = useState('');

  const handleJoystickMove = useCallback((dx: number, dy: number) => {
    if (inputRef.current) {
      inputRef.current.joystick.dx = dx;
      inputRef.current.joystick.dy = dy;
    }
  }, []);

  const handleJoystickEnd = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.joystick.dx = 0;
      inputRef.current.joystick.dy = 0;
    }
  }, []);

  const handleAimJoystickMove = useCallback((dx: number, dy: number) => {
    if (inputRef.current) {
      inputRef.current.aimJoystick.dx = dx;
      inputRef.current.aimJoystick.dy = dy;
      inputRef.current.aimJoystick.active = true;
    }
  }, []);

  const handleAimJoystickEnd = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.aimJoystick.dx = 0;
      inputRef.current.aimJoystick.dy = 0;
      inputRef.current.aimJoystick.active = false;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size to window size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Set up Web Audio API for zero-latency mobile sound effects
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    let bulletBuffer: AudioBuffer | null = null;

    fetch('/freesound_community-060130_laser-bullet-86975.mp3')
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
      .then(buffer => {
        bulletBuffer = buffer;
      })
      .catch(e => console.log('Audio fetch error:', e));

    const isJointOps = multiplayerInfo?.mode?.trim() === 'JointOps';
    const is1v1 = multiplayerInfo?.mode?.trim() === '1v1';
    const targetScore = multiplayerInfo?.targetScore || 10;
    const mapSeed = (multiplayerInfo as any)?.mapSeed || 0;
    
    // Find my index
    const myIndex = multiplayerInfo?.players.findIndex(p => p.name === multiplayerInfo.playerName) ?? 0;
    const finalIndex = myIndex >= 0 ? myIndex : 0;
    
    engineRef.current = new GameEngine(biome, isJointOps, is1v1, targetScore, mapSeed, finalIndex);
    
    engineRef.current.onPvpCollision = (remoteId: string, damage: number) => {
      if (multiplayerInfo) {
        socket.emit('pvp_hit', {
          roomId: multiplayerInfo.roomId,
          targetId: remoteId,
          damage
        });
      }
    };
    
    engineRef.current.onFire = (rate: number) => {
      if (!bulletBuffer) return;

      // Browsers require a user gesture to resume audio context
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const source = audioCtx.createBufferSource();
      source.buffer = bulletBuffer;

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.2; // Volume control

      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Start immediately with zero latency
      source.start(0, 0.02); // slight 0.02 offset skips potential tiny silence in mp3 files

      // Forcefully STOP the sound before the next bullet can visually fire!
      // This fixes the issue where downloaded mp3 files contain multiple rapid-fire laser shots baked into a single audio file.
      source.stop(audioCtx.currentTime + rate);
    };

    inputRef.current = new InputManager(canvas);
    rendererRef.current = new Renderer(canvas);

    // Set local player name for rendering
    if (multiplayerInfo?.playerName) {
      rendererRef.current.localPlayerName = multiplayerInfo.playerName;
    }

    // Storage for remote players (updated by socket events)
    const remotePlayersMap = new Map<string, RemotePlayer>();

    // Listen for remote player updates
    if (multiplayerInfo) {
      socket.on('remote_player_update', (data: RemotePlayer) => {
        remotePlayersMap.set(data.id, data);
      });

      socket.on('player_disconnected', (data: { id: string }) => {
        remotePlayersMap.delete(data.id);
      });

      socket.on('player_spectating', (data: { id: string; name: string }) => {
        // Mark this remote player as spectating (they'll stop sending position updates)
      });

      socket.on('all_players_dead', (data: { players: { name: string; score: number }[]; totalScore: number }) => {
        // ALL players are dead — trigger game over
        if (engineRef.current) {
          onGameOver(data.totalScore, engineRef.current.state.wave);
        }
      });

      socket.on('pvp_damage', (data: { attackerId: string, damage: number }) => {
        if (!engineRef.current || !multiplayerInfo) return;
        const state = engineRef.current.state;
        const player = state.player;
        
        // Take damage only if alive and not in respawn invincibility
        if (player.hp > 0 && state.pvpRespawnTimer <= 0) {
          player.hp -= data.damage;
          
          if (player.hp <= 0) {
            // I died! Tell server
            socket.emit('pvp_death', {
              roomId: multiplayerInfo.roomId,
              killerId: data.attackerId
            });
            
            // Respawn instantly at specific random bounds
            player.x = 200 + Math.random() * (state.worldWidth - 400);
            player.y = 200 + Math.random() * (state.worldHeight - 400);
            player.hp = player.maxHp;
            state.pvpRespawnTimer = 3; // 3 seconds invincibility
          }
        }
      });

      socket.on('pvp_score_update', (data: { scores: Record<string, number>, killerId: string, victimId: string, killerName: string }) => {
        if (engineRef.current) {
          engineRef.current.state.pvpScores = data.scores;
        }
      });

      socket.on('pvp_game_over', (data: { winnerId: string, winnerName: string, scores: Record<string, number>, reason: string }) => {
        // Game Over! Return to lobby passing my own score
        if (engineRef.current) {
          onGameOver(data.scores[socket.id] || 0, 1);
        }
      });
    }

    // Throttle position sends to ~20 times per second
    let lastSendTime = 0;
    const SEND_INTERVAL = 50; // ms

    const loop = () => {
      if (!engineRef.current || !inputRef.current || !rendererRef.current) return;

      const engine = engineRef.current;
      const input = inputRef.current;
      const renderer = rendererRef.current;

      engine.update(input, canvas.width, canvas.height);

      // Sync remote players into engine state for rendering
      engine.state.remotePlayers = Array.from(remotePlayersMap.values());

      renderer.render(engine.state, canvas.width, canvas.height);

      // Send local player position to server for multiplayer
      if (multiplayerInfo && socket.connected && !engine.state.isSpectating) {
        const now = performance.now();
        if (now - lastSendTime > SEND_INTERVAL) {
          lastSendTime = now;
          socket.emit('player_update', {
            roomId: multiplayerInfo.roomId,
            x: engine.state.player.x,
            y: engine.state.player.y,
            angle: engine.state.player.angle,
            hp: engine.state.player.hp,
            maxHp: engine.state.player.maxHp,
            isDown: engine.state.isDown
          });
        }
      }

      // Spectator mode: emit eliminated once, follow a remote player
      if (engine.state.isSpectating && multiplayerInfo && !hasEmittedEliminatedRef.current) {
        hasEmittedEliminatedRef.current = true;
        socket.emit('player_eliminated', {
          roomId: multiplayerInfo.roomId,
          score: engine.state.score
        });
      }

      // Spectator camera: follow alive remote player
      let spectatingName = '';
      if (engine.state.isSpectating) {
        const aliveRemotes = engine.state.remotePlayers.filter(rp => !rp.isDown && rp.hp > 0);
        if (aliveRemotes.length > 0) {
          const idx = spectatingIndexRef.current % aliveRemotes.length;
          const target = aliveRemotes[idx];
          engine.state.camera.x += (target.x - engine.state.camera.x) * 0.1;
          engine.state.camera.y += (target.y - engine.state.camera.y) * 0.1;
          spectatingName = target.name;
        }
      }

      if (engine.state.is1v1 && engine.state.pvpTimer <= 0 && !engine.state.isGameOver) {
        if (multiplayerInfo) {
          socket.emit('pvp_timer_expired', { roomId: multiplayerInfo.roomId });
        }
        engine.state.isGameOver = true;
      }

      if (engine.state.isGameOver) {
        onGameOver(engine.state.score, engine.state.wave);
        return;
      }

      // -- GENLAYER WAVE & BOSS INTEGRATION --
      if (engine.state.waveTransitionTime !== undefined && engine.state.waveTransitionTime > 0 && !isGeneratingRef.current) {
        isGeneratingRef.current = true;
        const previousTransitionTime = engine.state.waveTransitionTime;
        engine.state.waveTransitionTime = 9999; // Pause the engine transition while AI thinks
        
        import('../genlayer/waveManager').then(async ({ waveManager }) => {
          if (!waveManager.isEnabled) {
            engine.state.waveTransitionTime = previousTransitionTime;
            isGeneratingRef.current = false;
            return;
          }

          setAiStatus('generating');
          if (engine.state.wave === 9) {
            // BOSS TIER
            const boss = await waveManager.generateBoss('Spread Shot', 'Speed Demons', 75.0);
            if (boss) {
              setAiBroadcast(`[AI WARNING]: ${boss.flavor_text}`);
              engine.state.aiConfig = {
                boss: true,
                hp_mult: boss.hp_mult,
                speed_mult: boss.speed_mult,
                ability: boss.ability
              };
            }
          } else {
            // STANDARD AI WAVE SCALING
            const report = {
              kills: Math.floor(engine.state.score / 10),
              damage_taken: engine.state.player.maxHp - engine.state.player.hp,
              health_pct: Math.max(0, engine.state.player.hp / engine.state.player.maxHp),
              shots_fired: 150, shots_hit: 95
            };
            const config = await waveManager.handleWaveEnd(report, engine.state.wave);
            if (config) {
              setAiBroadcast(`[AI WARNING]: ${config.flavor_text}`);
              engine.state.aiConfig = config;
            }
          }
          
          setAiStatus('ready');
          engine.state.waveTransitionTime = 0.1; // Trigger immediate wave spawn
          isGeneratingRef.current = false;
        });
      }

      setHud({
        hp: Math.max(0, Math.ceil(engine.state.player.hp)),
        score: engine.state.score,
        wave: engine.state.wave,
        powerups: { ...engine.state.player.activePowerUps } as Record<string, number>,
        waveTransition: engine.state.waveTransitionTime || 0,
        isDown: engine.state.isDown,
        downTimer: engine.state.downTimer,
        revivesUsed: engine.state.revivesUsed,
        maxRevives: engine.state.maxRevives,
        waveElapsed: engine.state.waveElapsed,
        isJointOps: engine.state.isJointOps,
        isSpectating: engine.state.isSpectating,
        spectatingName,
        is1v1: engine.state.is1v1,
        pvpTimer: engine.state.pvpTimer,
        pvpTargetScore: engine.state.pvpTargetScore,
        pvpScores: engine.state.pvpScores || {},
        pvpRespawnTimer: engine.state.pvpRespawnTimer
      });

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(requestRef.current);
      inputRef.current?.cleanup();
      if (multiplayerInfo) {
        socket.off('remote_player_update');
        socket.off('player_disconnected');
        socket.off('player_spectating');
        socket.off('all_players_dead');
      }
      hasEmittedEliminatedRef.current = false;
    };
  }, [biome, onGameOver, multiplayerInfo]);

  // Click/tap to cycle spectated player
  const handleSpectatorCycle = useCallback(() => {
    spectatingIndexRef.current++;
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {/* HUD */}
      {!hud.is1v1 ? (
        <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
          <div className="bg-black/50 text-white px-4 py-2 rounded-lg font-mono text-xl backdrop-blur-sm border border-white/10">
            HP: {hud.hp}
          </div>
          <div className="bg-black/50 text-white px-4 py-2 rounded-lg font-mono text-xl backdrop-blur-sm border border-white/10">
            Score: {hud.score}
          </div>
          <div className="bg-black/50 text-white px-4 py-2 rounded-lg font-mono text-xl backdrop-blur-sm border border-white/10">
            Wave: {hud.wave}
            {hud.isJointOps && (() => {
              const waveDuration = Math.min(80, 45 + (hud.wave - 1) * 10);
              const remaining = Math.max(0, Math.ceil(waveDuration - hud.waveElapsed));
              const mins = Math.floor(remaining / 60);
              const secs = remaining % 60;
              return <span className="text-cyan-400 ml-2">— {mins}:{secs.toString().padStart(2, '0')}</span>;
            })()}
          </div>
          {hud.maxRevives > 0 && multiplayerInfo?.mode === 'JointOps' && (
            <div className="bg-black/50 text-yellow-400 px-4 py-2 rounded-lg font-mono text-xl backdrop-blur-sm border border-yellow-500/20">
              Revives: {hud.maxRevives - hud.revivesUsed}/{hud.maxRevives}
            </div>
          )}
        </div>
      ) : (
        /* 1v1 PvP HUD */
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none px-4">
          <div className="flex bg-black/70 backdrop-blur-md rounded-2xl border-2 border-zinc-700 shadow-2xl overflow-hidden min-w-[300px]">
            {/* My Score */}
            <div className={`flex-1 px-6 py-3 flex flex-col items-center justify-center ${hud.pvpRespawnTimer > 0 ? 'bg-red-500/20' : 'bg-blue-600/20'}`}>
              <span className="text-blue-300 text-xs font-bold uppercase tracking-wider">You</span>
              <span className="text-white text-3xl font-black font-mono">{hud.pvpScores[socket.id] || 0}</span>
              <div className="w-full bg-zinc-800 h-1.5 mt-2 rounded-full overflow-hidden">
                <div className="bg-green-400 h-full transition-all" style={{ width: `${Math.max(0, hud.hp)}%` }} />
              </div>
            </div>

            {/* Timer & Target */}
            <div className="px-6 py-3 bg-zinc-900 border-x border-zinc-700 flex flex-col items-center justify-center min-w-[100px]">
              <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Target: {hud.pvpTargetScore}</span>
              <span className={`text-2xl font-black font-mono tracking-wider ${hud.pvpTimer < 60 ? 'text-red-400 animate-pulse' : 'text-zinc-200'}`}>
                {Math.floor(Math.max(0, hud.pvpTimer) / 60)}:{(Math.floor(Math.max(0, hud.pvpTimer)) % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {/* Opponent Score */}
            <div className="flex-1 px-6 py-3 flex flex-col items-center justify-center bg-red-600/20">
              <span className="text-red-300 text-xs font-bold uppercase tracking-wider">Opponent</span>
              <span className="text-white text-3xl font-black font-mono">
                {Object.entries(hud.pvpScores).find(([id]) => id !== socket.id)?.[1] || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {hud.isSpectating && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-end pb-24 pointer-events-auto z-50 cursor-pointer"
          onClick={handleSpectatorCycle}
          onTouchEnd={handleSpectatorCycle}
        >
          {/* Top banner */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm px-6 py-3 rounded-xl border border-red-500/30">
            <p className="text-red-400 font-bold text-lg text-center">💀 ELIMINATED</p>
            <p className="text-white text-center text-sm mt-1">
              Spectating: <span className="text-cyan-400 font-bold">{hud.spectatingName || '...'}</span>
            </p>
          </div>
          {/* Bottom hint */}
          <p className="text-zinc-400 text-sm animate-pulse">Tap anywhere to switch player</p>
        </div>
      )}

      {hud.isDown && !hud.isSpectating && !hud.is1v1 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm z-50">
          <div className="text-6xl mb-4">💀</div>
          <h2 className="text-4xl font-bold text-red-400 mb-4 drop-shadow-lg">YOU'RE DOWN!</h2>
          <div className="text-7xl font-mono text-white font-bold mb-4 animate-pulse">
            {Math.ceil(hud.downTimer)}
          </div>
          <p className="text-xl text-zinc-300">Respawning in {Math.ceil(hud.downTimer)}s...</p>
          <p className="text-sm text-zinc-500 mt-4">Revives remaining: {hud.maxRevives - hud.revivesUsed - 1}</p>
        </div>
      )}

      {/* PvP Respawn Invincibility Overlay */}
      {hud.is1v1 && hud.pvpRespawnTimer > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm z-50">
          <h2 className="text-4xl font-bold text-blue-400 mb-2 drop-shadow-lg">RESPAWNED</h2>
          <div className="text-6xl font-mono text-white font-bold animate-pulse">
            {Math.ceil(hud.pvpRespawnTimer)}
          </div>
          <p className="text-lg text-zinc-300 mt-2">Invincibility shield active</p>
        </div>
      )}

      {hud.waveTransition > 0 && !hud.isDown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm z-50">
          <h2 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">Wave {hud.wave} Complete!</h2>
          
          {aiStatus === 'generating' ? (
             <div className="flex flex-col items-center gap-2 mb-4 animate-pulse">
               <span className="text-purple-400 font-mono text-sm border border-purple-500/30 px-3 py-1 rounded bg-purple-500/10">GenLayer AI Directive Incoming...</span>
             </div>
          ) : aiBroadcast ? (
             <div className="max-w-lg text-center mb-4 transform animate-[pop_0.3s_ease-out]">
               <span className="block text-yellow-400 font-bold mb-1 text-sm uppercase tracking-widest">[INTELLIGENCE REPORT]</span>
               <p className="text-xl text-yellow-100 font-mono italic">"{aiBroadcast}"</p>
             </div>
          ) : (
            <p className="text-3xl font-mono text-zinc-200 drop-shadow-md">Next wave in {Math.ceil(hud.waveTransition)}...</p>
          )}
        </div>
      )}

      {isTouch && !hud.isSpectating && (
        <>
          <div className="absolute bottom-12 left-8 md:left-12 pointer-events-auto">
            <Joystick
              onMove={handleJoystickMove}
              onEnd={handleJoystickEnd}
            />
          </div>

          <div className="absolute bottom-12 right-8 md:right-12 pointer-events-auto">
            <Joystick
              onMove={handleAimJoystickMove}
              onEnd={handleAimJoystickEnd}
              className="border-red-500/50"
            />
          </div>
        </>
      )}
    </div>
  );
}
