import React, { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { PvpGameCanvas } from './components/PvpGameCanvas';
import { TdmGameCanvas } from './components/TdmGameCanvas';
import Lobby from './components/Lobby';
import { Biome } from './game/types';
import { Skull, Play, Users, Crosshair, Shield, Zap, Swords, Rocket } from 'lucide-react';
import { socket } from './network/socket';

const bgMusic = new Audio('/luis_humanoide-space-fleet-sci-fi-orchestral-music-166953.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

export default function App() {
  const [gameState, setGameState] = useState<'home' | 'menu' | 'lobby' | 'starting' | 'playing' | 'gameover'>('home');
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [biome, setBiome] = useState<Biome>('forest');
  const [finalScore, setFinalScore] = useState(0);
  const [finalWave, setFinalWave] = useState(1);
  const [countdown, setCountdown] = useState(3);
  const [championTitle, setChampionTitle] = useState<string | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [multiplayerInfo, setMultiplayerInfo] = useState<{ roomId: string; mode: string; players: { id: string; name: string }[]; playerName?: string } | null>(null);

  React.useEffect(() => {
    if (gameState === 'starting') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setGameState('playing');
      }
    }
  }, [gameState, countdown]);

  const startGameClick = async () => {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
          await (screen.orientation as any).lock('landscape');
        }
      } catch (err) {
        console.log('Orientation lock failed:', err);
      }
    }
    bgMusic.currentTime = 0;
    bgMusic.play().catch(e => console.log('Audio error:', e));
    setMultiplayerInfo(null);
    setCountdown(3);
    setGameState('starting');
  };

  const handleMultiplayerStart = async (roomOptions: { roomId: string; mode: string; players: { id: string; name: string }[]; playerName: string; targetScore?: number; mapSeed?: number }) => {
    setMultiplayerInfo(roomOptions);
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
          await (screen.orientation as any).lock('landscape');
        }
      } catch (err) {
        console.log('Orientation lock failed:', err);
      }
    }
    bgMusic.currentTime = 0;
    bgMusic.play().catch(e => console.log('Audio error:', e));
    setCountdown(3);
    setGameState('starting');
  };

  const handleGameOver = async (score: number, wave: number) => {
    bgMusic.pause();
    setFinalScore(score);
    setFinalWave(wave);
    
    // Switch to gameover view immediately
    if (multiplayerInfo) {
      socket.emit('return_to_lobby', { roomId: multiplayerInfo.roomId });
    }
    setGameState('gameover');

    // Trigger GenLayer Referee
    const { waveManager } = await import('./genlayer/waveManager');
    if (waveManager.isEnabled) {
      setIsGeneratingTitle(true);
      const name = multiplayerInfo?.playerName || 'Pilot';
      // Mocks accuracy at 75% for now
      const result = await waveManager.handleRefereeSubmission(name, score, wave, 75.0);
      if (result && result.title) {
        setChampionTitle(result.title);
      }
      setIsGeneratingTitle(false);
    }
  };

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    setWalletError(null);
    try {
      const { connectAndSwitchNetwork } = await import('./network/web3');
      const account = await connectAndSwitchNetwork();
      if (account) {
        setIsWalletConnected(true);
      }
    } catch (e: any) {
      setWalletError(e.message || "Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  if (gameState === 'lobby') {
    return (
      <Lobby
        onGameStart={handleMultiplayerStart}
        onBack={() => { setMultiplayerInfo(null); setGameState('menu'); }}
        returnRoomId={multiplayerInfo?.roomId}
        returnPlayerName={multiplayerInfo?.playerName}
      />
    );
  }

  if (gameState === 'playing') {
    const mode = multiplayerInfo?.mode?.trim();
    if (mode === '1v1') {
      return <PvpGameCanvas biome={biome} onGameOver={handleGameOver} multiplayerInfo={multiplayerInfo} />;
    }
    if (mode === 'TDM') {
      return <TdmGameCanvas biome={biome} onGameOver={handleGameOver} multiplayerInfo={multiplayerInfo} />;
    }
    return <GameCanvas biome={biome} onGameOver={handleGameOver} multiplayerInfo={multiplayerInfo} />;
  }

  /* ─── FULL-PAGE HOME SCREEN ─── */
  if (gameState === 'home') {
    return (
      <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 overflow-y-auto">

        {/* ── HERO SECTION ── */}
        <section className="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden">
          
          {/* Powered by GenLayer Badge */}
          <a href="https://x.com/GenLayer" target="_blank" rel="noopener noreferrer" className="absolute top-6 right-6 md:top-8 md:right-8 flex items-center gap-3 bg-zinc-900/60 backdrop-blur-md border border-zinc-700/50 rounded-full pl-5 pr-1.5 py-1.5 z-50 shadow-2xl hover:bg-zinc-800/80 transition-colors cursor-pointer group hover:scale-105 transform duration-300">
            <span className="text-xs md:text-sm font-bold text-zinc-300 tracking-wider uppercase group-hover:text-white transition-colors">Powered by GenLayer</span>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white flex items-center justify-center p-1.5 shadow-inner">
              <img src="/genlayer.png" alt="GenLayer Logo" className="w-full h-full object-contain transition-transform group-hover:scale-110" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-black font-black leading-none text-xl">G</span>'; }} />
            </div>
          </a>

          <div className="absolute inset-0 z-0">
            <img src="/hero_banner.png" alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/30 to-zinc-950" />
          </div>

          <div className="relative z-10 px-6 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6 backdrop-blur-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-blue-300 font-medium">Multiplayer Ready — Play with friends on LAN</span>
            </div>

            <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-4">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Alien Swarm
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-zinc-400 mb-3 font-light">
              The Ultimate Top-Down Space Shooter
            </p>
            <p className="text-sm text-zinc-500 max-w-md mx-auto mb-10 leading-relaxed">
              Command your starship through relentless alien hordes, team up with friends in co-op survival,
              or prove your dominance in intense PvP combat. Every mode, every bullet, every kill counts.
            </p>

            {walletError && (
              <div className="mb-4 text-red-500/90 text-sm font-semibold p-2 bg-red-500/10 rounded border border-red-500/20 max-w-sm mx-auto">
                {walletError}
              </div>
            )}
            
            {!isWalletConnected ? (
              <button
                onClick={handleConnectWallet}
                disabled={isConnecting}
                className="px-10 py-4 bg-gradient-to-r inline-flex items-center justify-center gap-3 from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:via-indigo-500 hover:to-blue-500 text-white rounded-2xl font-bold text-lg transition-all shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 cursor-pointer mx-auto leading-none disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Connecting Wallet...</span>
                  </>
                ) : (
                  <>
                    <Rocket size={20} />
                    <span>Connect Wallet</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setGameState('menu')}
                className="px-10 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-500 hover:via-purple-500 hover:to-pink-500 text-white rounded-2xl font-bold text-lg transition-all shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 cursor-pointer mx-auto block"
              >
                Start Game
              </button>
            )}

            <p className="text-xs text-zinc-600 mt-4">Desktop & Mobile — WASD or Touch Controls</p>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
            <span className="text-xs text-zinc-600 uppercase tracking-widest">Scroll to explore</span>
            <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </section>

        {/* ── HOW TO PLAY ── */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-sm font-bold text-purple-400 uppercase tracking-widest text-center mb-2">Master the basics</p>
            <h2 className="text-3xl md:text-4xl font-black text-center text-white mb-4">How To Play</h2>
            <p className="text-zinc-500 text-center max-w-lg mx-auto mb-12">
              Simple controls, deep gameplay. Whether on desktop or mobile, you'll be blasting aliens in seconds.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center hover:border-green-500/30 transition-colors">
                <div className="w-16 h-16 bg-green-500/10 text-green-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Zap size={32} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Move & Evade</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Use <span className="text-white font-semibold">WASD</span> or <span className="text-white font-semibold">Arrow Keys</span> on desktop.
                  On mobile, a virtual <span className="text-white font-semibold">joystick</span> appears on the left side of your screen.
                  Navigate through enemy swarms, dodge incoming fire, and position yourself for the perfect shot.
                  Standing still means death — keep moving to survive.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center hover:border-red-500/30 transition-colors">
                <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Crosshair size={32} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Aim & Fire</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  On desktop, your ship <span className="text-white font-semibold">aims at your mouse cursor</span> and fires on click.
                  On mobile, the right joystick controls aim — push it in any direction to unleash a
                  <span className="text-white font-semibold"> rapid-fire stream</span> of laser bolts.
                  Every enemy you destroy has a chance to drop valuable power-ups.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center hover:border-blue-500/30 transition-colors">
                <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield size={32} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Power Up & Survive</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Defeated enemies drop <span className="text-white font-semibold">power-ups</span> —
                  health packs to heal, rapid fire for faster shooting, invincibility shields,
                  spread shots that fire in multiple directions, and clone ships that fight alongside you.
                  Grab them strategically to <span className="text-white font-semibold">outlast each wave</span>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── GAME MODES ── */}
        <section className="py-20 px-6 bg-zinc-900/50">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm font-bold text-blue-400 uppercase tracking-widest text-center mb-2">Choose your battle</p>
            <h2 className="text-3xl md:text-4xl font-black text-center text-white mb-4">Game Modes</h2>
            <p className="text-zinc-500 text-center max-w-lg mx-auto mb-12">
              Four distinct ways to play. Go solo against the swarm, team up with allies, or fight other players in competitive PvP.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Solo */}
              <div className="group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-green-500/30 transition-all">
                <div className="h-48 overflow-hidden">
                  <img src="/mode_solo.png" alt="Solo Survival" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-green-500/10 text-green-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Single Player</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Solo Survival</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    Face endless waves of increasingly dangerous alien creatures on your own.
                    Each wave brings tougher enemies, faster attacks, and bigger swarms.
                    The biome changes every wave — from dense forests to open savannas to scorching deserts — each with unique obstacles and terrain.
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Collect power-ups from defeated aliens to boost your firepower and defenses.
                    How many waves can you survive? Push your skills to the limit and chase the highest score.
                  </p>
                </div>
              </div>

              {/* Joint Ops */}
              <div className="group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-cyan-500/30 transition-all">
                <div className="h-48 overflow-hidden">
                  <img src="/mode_coop.png" alt="Joint Ops" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-cyan-500/10 text-cyan-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">2-4 Players</span>
                    <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Co-Op</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Joint Operations</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    Team up with 1 to 3 friends to fight the alien swarm together over LAN.
                    Share the battlefield, coordinate your movements, and cover each other's blind spots.
                    The waves scale with player count, so every pilot matters.
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    When a teammate goes down, stay close to revive them before they bleed out.
                    Communication and positioning are the keys to survival in Joint Ops.
                  </p>
                </div>
              </div>

              {/* 1v1 */}
              <div className="group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-orange-500/30 transition-all">
                <div className="h-48 overflow-hidden">
                  <img src="/mode_duel.png" alt="1v1 Duel" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">2 Players</span>
                    <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">PvP</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">1v1 Duel</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    No aliens. No distractions. Just you and your opponent in a pure head-to-head dogfight.
                    Both players spawn on opposite sides of a synchronized map with identical terrain and obstacles.
                    Your enemy's ship appears red-tinted so you can spot them instantly.
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    First to reach the target kills wins — or the player with the highest score when the 4-minute timer expires.
                    A 3-second invincibility shield after each respawn prevents spawn camping.
                  </p>
                </div>
              </div>

              {/* TDM */}
              <div className="group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-red-500/30 transition-all">
                <div className="h-48 overflow-hidden">
                  <img src="/mode_tdm.png" alt="Team Deathmatch" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-red-500/10 text-red-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Up to 8 Players</span>
                    <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Team PvP</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Team Deathmatch</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    The ultimate team battle — Blue Team vs Red Team in all-out warfare.
                    Up to 4 players per side, fighting for team kills on a large battlefield.
                    Teammates appear green, enemies appear red. Friendly fire is disabled, so shoot without hesitation.
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    When you go down, a <span className="text-white font-semibold">revive beacon</span> drops at your location —
                    a teammate can walk over it and hold for 3 seconds to bring you back with 30% HP.
                    Coordinate with your team and dominate the scoreboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA SECTION ── */}
        <section className="py-24 px-6 text-center">
          <div className="max-w-lg mx-auto">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Ready to Fight?</h2>
            <p className="text-zinc-500 mb-8 leading-relaxed">
              Jump into solo survival or invite friends for multiplayer mayhem.
              No downloads, no installs — just launch and play directly in your browser.
            </p>
            <button
              onClick={() => setGameState('menu')}
              className="px-12 py-5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-500 hover:via-purple-500 hover:to-pink-500 text-white rounded-2xl font-bold text-xl transition-all shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 cursor-pointer"
            >
              Start Game
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-zinc-800 text-center">
          <p className="text-xs text-zinc-600">Alien Swarm — Built for browsers. Desktop & Mobile supported.</p>
        </footer>
      </div>
    );
  }

  /* ─── MENU SCREEN (full page) ─── */
  if (gameState === 'menu') {
    return (
      <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Subtle bg */}
        <div className="absolute inset-0">
          <img src="/hero_banner.png" alt="" className="w-full h-full object-cover opacity-15" />
          <div className="absolute inset-0 bg-zinc-950/80" />
        </div>

        <div className="relative z-10 max-w-lg w-full px-6">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-black tracking-tight mb-2">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Alien Swarm
              </span>
            </h1>
            <p className="text-zinc-500">Select your play mode</p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Single Player */}
            <button
              onClick={startGameClick}
              className="group w-full bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 hover:border-green-500/40 rounded-2xl p-6 text-left transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
                  <Play size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Single Player</h3>
                  <p className="text-sm text-zinc-400">Solo survival against endless alien waves. Test your skills and chase the highest score.</p>
                </div>
              </div>
            </button>

            {/* Multiplayer */}
            <button
              onClick={() => setGameState('lobby')}
              className="group w-full bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 hover:border-blue-500/40 rounded-2xl p-6 text-left transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                  <Users size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Multiplayer</h3>
                  <p className="text-sm text-zinc-400">Join or create a room — play Co-Op, 1v1 Duels, or Team Deathmatch with friends on LAN.</p>
                </div>
              </div>
            </button>
          </div>

          <div className="text-center mt-8">
            <button
              onClick={() => setGameState('home')}
              className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── STARTING / GAMEOVER (card layout) ─── */
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans text-zinc-100">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center">

        {gameState === 'menu' && (
          <>
            <div className="w-20 h-20 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-6">
              <Skull size={40} />
            </div>
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Alien Swarm</h1>
            <p className="text-zinc-400 mb-8">Choose your battle.</p>

            <div className="w-full flex flex-col gap-3">
              <button
                onClick={startGameClick}
                className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play size={20} /> Single Player
              </button>
              <button
                onClick={() => setGameState('lobby')}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Users size={20} /> Multiplayer
              </button>
            </div>

            <button
              onClick={() => setGameState('home')}
              className="mt-6 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              ← Back to Home
            </button>
          </>
        )}

        {gameState === 'starting' && (
          <>
            <h1 className="text-5xl font-bold mb-4 tracking-tight text-white">Wave 1</h1>
            <div className="text-7xl font-mono text-green-400 font-bold mb-8 animate-pulse">
              {countdown > 0 ? countdown : 'GO!'}
            </div>
            <p className="text-zinc-400">Get ready...</p>
          </>
        )}

        {gameState === 'gameover' && (
          <>
            <div className="w-20 h-20 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mb-6">
              <Skull size={40} />
            </div>
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Game Over</h1>
            
            {/* GenLayer Referee Injection */}
            <div className="h-20 mb-8 flex items-center justify-center">
              {isGeneratingTitle ? (
                <div className="text-purple-400 animate-pulse font-mono text-sm leading-tight border border-purple-500/20 bg-purple-500/5 px-6 py-3 rounded-lg overflow-hidden">
                  <span className="block opacity-70">AWAITING GENLAYER CONSENSUS...</span>
                  <span className="block italic text-xs mt-1 text-purple-300">The AI Referee is grading your run</span>
                </div>
              ) : championTitle ? (
                <div className="text-center transform animate-[pop_0.5s_ease-out]">
                  <p className="text-xs text-zinc-500 uppercase tracking-[0.2em] mb-1">Blockchain Official Title</p>
                  <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 drop-shadow-[0_2px_10px_rgba(251,191,36,0.3)]">
                    "{championTitle}"
                  </p>
                </div>
              ) : (
                <p className="text-zinc-600">You have been consumed.</p>
              )}
            </div>

            <div className="w-full bg-zinc-950 rounded-xl p-6 mb-8 border border-zinc-800 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Score</span>
                <span className="text-2xl font-mono text-white">{finalScore}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Wave Reached</span>
                <span className="text-2xl font-mono text-white">{finalWave}</span>
              </div>
            </div>

            <button
              onClick={() => setGameState('menu')}
              className="w-full py-4 bg-white hover:bg-zinc-200 text-black rounded-xl font-semibold transition-colors cursor-pointer"
            >
              Play Again
            </button>
          </>
        )}

      </div>
    </div>
  );
}
