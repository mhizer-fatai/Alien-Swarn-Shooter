import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TdmEngine, ReviveBeacon } from '../game/TdmEngine';
import { InputManager } from '../game/Input';
import { Renderer } from '../game/Renderer';
import { Biome, RemotePlayer } from '../game/types';
import { Joystick } from './Joystick';
import { socket } from '../network/socket';

interface MultiplayerInfo {
  roomId: string;
  mode: string;
  players: { id: string; name: string; team?: number }[];
  playerName?: string;
  targetScore?: number;
  mapSeed?: number;
  teams?: { team0: string[]; team1: string[] };
}

export function TdmGameCanvas({ biome, onGameOver, multiplayerInfo }: { biome: Biome, onGameOver: (score: number, wave: number) => void, multiplayerInfo: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TdmEngine | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const requestRef = useRef<number>(0);

  const [hud, setHud] = useState({
    hp: 100, isDown: false,
    pvpTimer: 300, pvpTargetScore: 30,
    teamScores: [0, 0] as number[],
    myTeam: 0,
    pvpRespawnTimer: 0,
    revivingProgress: 0, // 0-3
    beaconCount: 0
  });

  const [isTouch] = useState(() => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

  const [aiBroadcast, setAiBroadcast] = useState('');
  const lastBountyCheckRef = useRef(300);

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

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Audio
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    let bulletBuffer: AudioBuffer | null = null;

    fetch('/freesound_community-060130_laser-bullet-86975.mp3')
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
      .then(buffer => { bulletBuffer = buffer; })
      .catch(e => console.log('Audio fetch error:', e));

    const targetScore = multiplayerInfo?.targetScore || 30;
    const mapSeed = multiplayerInfo?.mapSeed || 0;

    // Find my team and index within team
    const myPlayer = multiplayerInfo?.players?.find((p: any) => p.name === multiplayerInfo.playerName);
    const myTeam = myPlayer?.team ?? 0;
    const teamPlayers = multiplayerInfo?.players?.filter((p: any) => p.team === myTeam) || [];
    const playerIndexInTeam = teamPlayers.findIndex((p: any) => p.name === multiplayerInfo.playerName);
    const finalIndex = playerIndexInTeam >= 0 ? playerIndexInTeam : 0;

    engineRef.current = new TdmEngine(biome, targetScore, mapSeed, finalIndex, myTeam);

    engineRef.current.onPvpCollision = (remoteId: string, damage: number) => {
      if (multiplayerInfo) {
        socket.emit('tdm_hit', {
          roomId: multiplayerInfo.roomId,
          targetId: remoteId,
          damage
        });
      }
    };

    engineRef.current.onReviveComplete = (beaconId: string, playerId: string) => {
      if (multiplayerInfo) {
        socket.emit('tdm_revive', {
          roomId: multiplayerInfo.roomId,
          beaconId,
          revivedPlayerId: playerId
        });
      }
    };

    engineRef.current.onFire = (rate: number) => {
      if (!bulletBuffer) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = bulletBuffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.2;
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      source.start(0, 0.02);
      source.stop(audioCtx.currentTime + rate);
    };

    inputRef.current = new InputManager(canvas);
    rendererRef.current = new Renderer(canvas);
    rendererRef.current.myTeam = myTeam;

    if (multiplayerInfo?.playerName) {
      rendererRef.current.localPlayerName = multiplayerInfo.playerName;
    }

    const remotePlayersMap = new Map<string, RemotePlayer>();

    if (multiplayerInfo) {
      socket.on('remote_player_update', (data: RemotePlayer & { team?: number }) => {
        remotePlayersMap.set(data.id, data);
      });

      socket.on('player_disconnected', (data: { id: string }) => {
        remotePlayersMap.delete(data.id);
      });

      socket.on('tdm_damage', (data: { attackerId: string, damage: number }) => {
        if (!engineRef.current || !multiplayerInfo) return;
        const player = engineRef.current.state.player;

        if (player.hp > 0 && engineRef.current.state.pvpRespawnTimer <= 0) {
          player.hp -= data.damage;

          if (player.hp <= 0) {
            // I died! Enter downed state
            engineRef.current.state.isDown = true;
            player.hp = 0;

            socket.emit('tdm_death', {
              roomId: multiplayerInfo.roomId,
              killerId: data.attackerId,
              x: player.x,
              y: player.y
            });
          }
        }
      });

      socket.on('tdm_beacon_spawned', (data: { id: string; playerId: string; playerName: string; x: number; y: number; team: number }) => {
        if (engineRef.current) {
          engineRef.current.addBeacon({
            id: data.id,
            playerId: data.playerId,
            playerName: data.playerName,
            x: data.x,
            y: data.y,
            team: data.team,
            timer: 30,
            reviveProgress: 0
          });
        }
      });

      socket.on('tdm_beacon_removed', (data: { beaconId: string }) => {
        if (engineRef.current) {
          engineRef.current.removeBeacon(data.beaconId);
        }
      });

      socket.on('tdm_revived', (data: { playerId: string }) => {
        if (!engineRef.current || !multiplayerInfo) return;
        // If I was revived
        if (data.playerId === socket.id) {
          const state = engineRef.current.state;
          state.isDown = false;
          state.player.hp = 30; // 30% HP on revive
          state.pvpRespawnTimer = 2; // 2s invincibility
        }
      });

      socket.on('tdm_score_update', (data: { teamScores: number[] }) => {
        // Team scores are stored in the HUD state
        if (engineRef.current) {
          engineRef.current.state.pvpScores = { '0': data.teamScores[0], '1': data.teamScores[1] };
        }
      });

      socket.on('tdm_game_over', (data: { winningTeam: number, teamScores: number[], reason: string }) => {
        if (engineRef.current) {
          onGameOver(data.teamScores[myTeam] || 0, 1);
        }
      });
    }

    let lastSendTime = 0;
    const SEND_INTERVAL = 50;

    const loop = () => {
      if (!engineRef.current || !inputRef.current || !rendererRef.current) return;

      const engine = engineRef.current;
      const input = inputRef.current;
      const renderer = rendererRef.current;

      engine.update(input, canvas.width, canvas.height);
      engine.state.remotePlayers = Array.from(remotePlayersMap.values());

      renderer.render(engine.state, canvas.width, canvas.height);

      // Draw revive beacons on screen
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.translate(canvas.width / 2 - engine.state.camera.x, canvas.height / 2 - engine.state.camera.y);
        for (const beacon of engine.reviveBeacons) {
          const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
          const isMyTeam = beacon.team === myTeam;
          ctx.globalAlpha = pulse * 0.8;
          ctx.fillStyle = isMyTeam ? '#22c55e' : '#ef4444';
          ctx.beginPath();
          ctx.arc(beacon.x, beacon.y, 25, 0, Math.PI * 2);
          ctx.fill();

          // Inner cross
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(beacon.x - 8, beacon.y);
          ctx.lineTo(beacon.x + 8, beacon.y);
          ctx.moveTo(beacon.x, beacon.y - 8);
          ctx.lineTo(beacon.x, beacon.y + 8);
          ctx.stroke();

          // Name
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(beacon.playerName, beacon.x, beacon.y - 32);

          // Progress bar if being revived
          if (beacon.reviveProgress > 0 && isMyTeam) {
            ctx.fillStyle = '#333';
            ctx.fillRect(beacon.x - 20, beacon.y + 30, 40, 6);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(beacon.x - 20, beacon.y + 30, 40 * (beacon.reviveProgress / 3), 6);
          }
        }
        ctx.restore();
      }

      // Send position
      if (multiplayerInfo && socket.connected && !engine.state.isDown) {
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

      // -- GENLAYER BOUNTY SYSTEM --
      if (lastBountyCheckRef.current - engine.state.pvpTimer >= 30 && !engine.state.isGameOver) {
        lastBountyCheckRef.current = engine.state.pvpTimer;
        import('../genlayer/waveManager').then(async ({ waveManager }) => {
          if (waveManager.isEnabled) {
            const blue = engine.state.pvpScores['0'] || 0;
            const red = engine.state.pvpScores['1'] || 0;
            const event = await waveManager.checkBounty(blue, red, 'Player', blue);
            if (event && event.has_bounty) {
              setAiBroadcast(`[BOUNTY ISSUED] ${event.flavor_text}`);
              setTimeout(() => setAiBroadcast(''), 8000);
            }
          }
        });
      }

      // Timer expired
      if (engine.state.pvpTimer <= 0 && !engine.state.isGameOver) {
        if (multiplayerInfo) {
          socket.emit('tdm_timer_expired', { roomId: multiplayerInfo.roomId });
        }
        engine.state.isGameOver = true;
      }

      if (engine.state.isGameOver) {
        onGameOver(engine.state.score, 1);
        return;
      }

      // Find closest friendly beacon for revive progress display
      let revivingProgress = 0;
      if (!engine.state.isDown) {
        const p = engine.state.player;
        for (const beacon of engine.reviveBeacons) {
          if (beacon.team !== myTeam) continue;
          const dx = p.x - beacon.x;
          const dy = p.y - beacon.y;
          if (Math.sqrt(dx * dx + dy * dy) < 50) {
            revivingProgress = beacon.reviveProgress;
            break;
          }
        }
      }

      const teamScores = engine.state.pvpScores;

      setHud({
        hp: Math.max(0, Math.ceil(engine.state.player.hp)),
        isDown: engine.state.isDown,
        pvpTimer: engine.state.pvpTimer,
        pvpTargetScore: engine.state.pvpTargetScore,
        teamScores: [teamScores['0'] || 0, teamScores['1'] || 0],
        myTeam,
        pvpRespawnTimer: engine.state.pvpRespawnTimer,
        revivingProgress,
        beaconCount: engine.reviveBeacons.filter(b => b.team === myTeam).length
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
        socket.off('tdm_damage');
        socket.off('tdm_beacon_spawned');
        socket.off('tdm_beacon_removed');
        socket.off('tdm_revived');
        socket.off('tdm_score_update');
        socket.off('tdm_game_over');
      }
    };
  }, [biome, onGameOver, multiplayerInfo]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {/* TDM Team Scoreboard */}
      {hud && (
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none px-4 z-40">
          <div className="flex bg-black/70 backdrop-blur-md rounded-2xl border-2 border-zinc-700 shadow-2xl overflow-hidden min-w-[340px]">
            {/* Blue Team */}
            <div className={`flex-1 px-6 py-3 flex flex-col items-center justify-center ${hud.myTeam === 0 ? 'bg-blue-600/30 ring-2 ring-blue-400 ring-inset' : 'bg-blue-600/10'}`}>
              <span className="text-blue-300 text-xs font-bold uppercase tracking-wider">Blue Team</span>
              <span className="text-white text-3xl font-black font-mono">{hud.teamScores[0]}</span>
            </div>

            {/* Timer & Target */}
            <div className="px-5 py-3 bg-zinc-900 border-x border-zinc-700 flex flex-col items-center justify-center min-w-[100px]">
              <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Target: {hud.pvpTargetScore}</span>
              <span className={`text-2xl font-black font-mono tracking-wider ${hud.pvpTimer < 60 ? 'text-red-400 animate-pulse' : 'text-zinc-200'}`}>
                {Math.floor(Math.max(0, hud.pvpTimer) / 60)}:{(Math.floor(Math.max(0, hud.pvpTimer)) % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {/* Red Team */}
            <div className={`flex-1 px-6 py-3 flex flex-col items-center justify-center ${hud.myTeam === 1 ? 'bg-red-600/30 ring-2 ring-red-400 ring-inset' : 'bg-red-600/10'}`}>
              <span className="text-red-300 text-xs font-bold uppercase tracking-wider">Red Team</span>
              <span className="text-white text-3xl font-black font-mono">{hud.teamScores[1]}</span>
            </div>
          </div>
        </div>
      )}

      {/* Health bar bottom-center */}
      {hud && !hud.isDown && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-40">
          <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 w-48">
            <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden">
              <div className="bg-green-500 h-full transition-all" style={{ width: `${Math.max(0, hud.hp)}%` }} />
            </div>
            <div className="text-center text-white text-xs font-mono mt-1">{hud.hp} HP</div>
          </div>
        </div>
      )}

      {/* Reviving progress overlay */}
      {hud.revivingProgress > 0 && !hud.isDown && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <div className="bg-green-900/80 backdrop-blur-sm px-6 py-3 rounded-xl border border-green-500/30">
            <p className="text-green-300 text-sm font-bold text-center mb-2">⚕️ REVIVING TEAMMATE...</p>
            <div className="w-40 bg-zinc-800 h-3 rounded-full overflow-hidden">
              <div className="bg-green-400 h-full transition-all" style={{ width: `${(hud.revivingProgress / 3) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Downed overlay */}
      {hud.isDown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm z-50">
          <div className="text-6xl mb-4">💀</div>
          <h2 className="text-4xl font-bold text-red-400 mb-4 drop-shadow-lg">YOU'RE DOWN!</h2>
          <p className="text-xl text-zinc-300">Waiting for teammate to revive...</p>
          {hud.beaconCount > 0 && (
            <p className="text-sm text-green-400 mt-4 animate-pulse">🟢 Revive beacon active</p>
          )}
        </div>
      )}

      {/* Respawn shield */}
      {hud.pvpRespawnTimer > 0 && !hud.isDown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/30 z-50">
          <h2 className="text-3xl font-bold text-green-400 mb-2 drop-shadow-lg">REVIVED!</h2>
          <p className="text-lg text-zinc-300">Shield active: {Math.ceil(hud.pvpRespawnTimer)}s</p>
        </div>
      )}

      {/* AI BOUNTY BROADCAST */}
      {aiBroadcast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-50 transform animate-[pop_0.3s_ease-out]">
          <div className="bg-orange-500/10 backdrop-blur-sm border border-orange-500/50 px-6 py-2 rounded-lg text-center shadow-[0_0_15px_rgba(249,115,22,0.3)]">
            <p className="text-orange-400 font-bold font-mono uppercase tracking-widest text-xs mb-1">Blockchain Event</p>
            <p className="text-white text-sm font-semibold">{aiBroadcast}</p>
          </div>
        </div>
      )}

      {/* Touch controls */}
      {isTouch && !hud.isDown && (
        <>
          <div className="absolute bottom-12 left-8 md:left-12 pointer-events-auto">
            <Joystick onMove={handleJoystickMove} onEnd={handleJoystickEnd} />
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
