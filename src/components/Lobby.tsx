import React, { useState, useEffect, useRef } from 'react';
import { socket, connectSocket } from '../network/socket';
import { Users, Plus, Link, ArrowLeft, Copy, Check, Shield, Swords, Play, Rocket, User, Zap } from 'lucide-react';

interface Player {
    id: string;
    name: string;
}

interface LobbyProps {
    onGameStart: (roomOptions: { roomId: string, mode: string, players: Player[], playerName: string, targetScore?: number, mapSeed?: number }) => void;
    onBack: () => void;
    returnRoomId?: string;
    returnPlayerName?: string;
}

type LobbyScreen = 'username' | 'choice' | 'create' | 'join' | 'room';

const Lobby: React.FC<LobbyProps> = ({ onGameStart, onBack, returnRoomId, returnPlayerName }) => {
    const [playerName, setPlayerName] = useState(returnPlayerName || '');
    const [roomId, setRoomId] = useState(returnRoomId || '');
    const [joinCode, setJoinCode] = useState('');
    const [mode, setMode] = useState<'1v1' | 'JointOps' | 'TDM'>('1v1');
    const [targetScore, setTargetScore] = useState(mode === 'TDM' ? 30 : 10);
    const [screen, setScreen] = useState<LobbyScreen>(returnRoomId ? 'room' : 'username');
    const [players, setPlayers] = useState<Player[]>([]);
    const [isLeader, setIsLeader] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);

    const playerNameRef = useRef(playerName);
    useEffect(() => { playerNameRef.current = playerName; }, [playerName]);

    useEffect(() => {
        socket.on('room_update', (updatedPlayers: Player[]) => {
            setPlayers(updatedPlayers);
            if (roomId && updatedPlayers.length > 0) {
                setIsLeader(updatedPlayers[0].id === socket.id);
            }
        });

        socket.on('room_created', (data: { roomId: string }) => {
            setRoomId(data.roomId);
            setIsLeader(true);
            setScreen('room');
        });

        socket.on('join_error', (msg: string) => {
            setError(msg);
        });

        socket.on('joined_room', (data: { roomId: string; mode: string }) => {
            setRoomId(data.roomId);
            setMode(data.mode as any);
            setIsLeader(false);
            setScreen('room');
        });

        socket.on('game_started', (data: { roomId: string; mode: string; players: Player[]; targetScore?: number; mapSeed?: number }) => {
            setLobbyCountdown(null);
            onGameStart({ 
                roomId: data.roomId, 
                mode: data.mode, 
                players: data.players, 
                playerName: playerNameRef.current, 
                targetScore: data.targetScore, 
                mapSeed: data.mapSeed 
            });
        });

        socket.on('game_countdown', (data: { countdown: number }) => {
            setLobbyCountdown(data.countdown);
        });

        return () => {
            socket.off('room_update');
            socket.off('room_created');
            socket.off('join_error');
            socket.off('joined_room');
            socket.off('game_started');
            socket.off('game_countdown');
        };
    }, [onGameStart, roomId]);

    const handleCreateRoom = () => {
        if (!playerName.trim()) return;
        connectSocket();
        socket.emit('create_room', { playerName, mode, targetScore });
    };

    const handleJoinRoom = () => {
        if (!joinCode.trim() || !playerName.trim()) return;
        setError('');
        connectSocket();
        socket.emit('join_room', { roomId: joinCode.trim().toUpperCase(), playerName });
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleLeave = () => {
        socket.disconnect();
        setScreen('choice');
        setPlayers([]);
        setRoomId('');
        setError('');
    };

    const handleStartGame = () => {
        socket.emit('start_game', { roomId, targetScore });
    };

    const renderScreen = () => {
        switch (screen) {
            case 'username':
                return (
                    <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl backdrop-blur-md">
                        <div className="w-20 h-20 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                            <User size={40} />
                        </div>
            <h2 className="text-3xl font-black mb-2 tracking-tight text-white text-center">Enter your name</h2>
                        <p className="text-zinc-400 mb-8 text-center text-sm">Choose a name for the game.</p>

                        <div className="relative mb-8">
                            <input
                                type="text"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="w-full px-6 py-4 bg-zinc-800/50 rounded-2xl border-2 border-zinc-700/50 focus:outline-none focus:border-blue-500/50 text-white text-center text-xl font-bold transition-all placeholder:text-zinc-600"
                                placeholder="Your name"
                                maxLength={12}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && playerName.trim() && setScreen('choice')}
                            />
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={onBack}
                                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <ArrowLeft size={20} /> Exit
                            </button>
                            <button
                                onClick={() => { if (playerName.trim()) setScreen('choice'); }}
                                disabled={!playerName.trim()}
                                className="flex-[2] py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                Continue <Rocket size={20} />
                            </button>
                        </div>
                    </div>
                );

            case 'choice':
                return (
                    <div className="max-w-md w-full flex flex-col gap-4">
                        <div className="text-center mb-6">
                            <h2 className="text-3xl font-black text-white mb-2">Welcome, {playerName}</h2>
                            <button 
                                onClick={() => setScreen('username')}
                                className="text-xs text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors"
                            >
                                Change Name
                            </button>
                        </div>

                        <button
                            onClick={() => setScreen('create')}
                            className="group relative overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-green-500/50 rounded-3xl p-8 text-left transition-all cursor-pointer"
                        >
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <Plus size={80} />
                            </div>
                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-green-500/10 text-green-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Plus size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">Create Room</h3>
                                <p className="text-sm text-zinc-500">Start a new battle and invite your friends to join the action.</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setScreen('join')}
                            className="group relative overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-3xl p-8 text-left transition-all cursor-pointer"
                        >
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <Link size={80} />
                            </div>
                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Link size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">Join Room</h3>
                                <p className="text-sm text-zinc-500">Enter a room code to jump into an existing multiplayer session.</p>
                            </div>
                        </button>

                        <button
                            onClick={onBack}
                            className="text-zinc-600 hover:text-zinc-400 text-sm font-bold uppercase tracking-widest mt-4 transition-colors text-center cursor-pointer"
                        >
                            ← Back to Menu
                        </button>
                    </div>
                );

            case 'create':
                return (
                    <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
                        <h2 className="text-3xl font-black mb-2 tracking-tight text-white text-center">Create Room</h2>
                        <p className="text-zinc-400 mb-8 text-center text-sm">Choose a game mode.</p>

                        <div className="space-y-3 mb-8">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 px-1">Game Mode</p>
                            {([
                                { value: '1v1', label: '1v1 Duel', icon: <Swords size={20} />, desc: 'Elite head-to-head combat' },
                                { value: 'JointOps', label: 'Joint Operations', icon: <Shield size={20} />, desc: '2-4 Player cooperative survival' },
                                { value: 'TDM', label: 'Team Deathmatch', icon: <Users size={20} />, desc: '4v4 Tactical squad warfare' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => {
                                        setMode(opt.value);
                                        setTargetScore(opt.value === 'TDM' ? 30 : opt.value === '1v1' ? 10 : 0);
                                    }}
                                    className={`w-full group flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${mode === opt.value
                                        ? 'border-green-500 bg-green-500/5'
                                        : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-700'
                                    }`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${mode === opt.value ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-400'}`}>
                                        {opt.icon}
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className={`font-bold ${mode === opt.value ? 'text-white' : 'text-zinc-400'}`}>{opt.label}</div>
                                        <div className="text-xs text-zinc-500">{opt.desc}</div>
                                    </div>
                                    {mode === opt.value && (
                                        <div className="w-6 h-6 bg-green-500 text-zinc-950 rounded-full flex items-center justify-center">
                                            <Check size={14} strokeWidth={4} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setScreen('choice')}
                                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl font-bold transition-all cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleCreateRoom}
                                className="flex-[2] py-4 bg-green-600 hover:bg-green-500 text-white rounded-2xl font-bold shadow-lg shadow-green-600/20 animate-in fade-in slide-in-from-bottom-2 transition-all cursor-pointer"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                );

            case 'join':
                return (
                    <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
                        <div className="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                            <Link size={40} />
                        </div>
                        <h2 className="text-3xl font-black mb-2 tracking-tight text-white text-center">Join Room</h2>
                        <p className="text-zinc-400 mb-8 text-center text-sm">Enter the room code.</p>

                        <div className="relative mb-4">
                            <input
                                type="text"
                                value={joinCode}
                                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                                className="w-full px-6 py-6 bg-zinc-950 rounded-2xl border-2 border-zinc-800 focus:outline-none focus:border-blue-500/50 text-white text-center text-4xl tracking-widest font-mono font-black transition-all"
                                placeholder="------"
                                maxLength={6}
                                autoFocus
                            />
                        </div>
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold py-3 px-4 rounded-xl mb-6 flex items-center gap-2">
                                <span className="text-lg">⚠️</span> {error}
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button
                                onClick={() => { setScreen('choice'); setError(''); }}
                                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl font-bold transition-all cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleJoinRoom}
                                disabled={!joinCode.trim()}
                                className="flex-[2] py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
                            >
                                Join
                            </button>
                        </div>
                    </div>
                );

            case 'room':
                return (
                    <div className="max-max-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Status Bar */}
                        <div className="col-span-12 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                            <div>
                                <h2 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
                                    Multiplayer Room
                                    <span className="text-xs font-bold bg-zinc-800 text-zinc-500 px-3 py-1 rounded-full uppercase tracking-widest">
                                        {mode}
                                    </span>
                                </h2>
                            </div>
                            <button
                                onClick={handleLeave}
                                className="px-6 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all flex items-center gap-2 self-start md:self-auto cursor-pointer"
                            >
                                <ArrowLeft size={16} /> Leave Room
                            </button>
                        </div>

                        {/* Left Side: Players & Teams */}
                        <div className="lg:col-span-8 flex flex-col gap-6">
                            {mode === 'TDM' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Blue Team */}
                                    <div className="bg-blue-600/5 border border-blue-500/20 rounded-3xl p-6 ring-1 ring-blue-500/10">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-blue-400 font-black uppercase tracking-tighter text-2xl flex items-center gap-2">
                                                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" /> Blue Team
                                            </h3>
                                            <span className="text-xs font-bold text-blue-500/60 bg-blue-500/10 px-3 py-1 rounded-full">
                                                {players.slice(0, Math.ceil(players.length / 2)).length} / 4
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {players.slice(0, Math.ceil(players.length / 2)).map((p, i) => (
                                                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl relative overflow-hidden transition-all ${p.name === playerName ? 'bg-blue-500/20 ring-2 ring-blue-500/50' : 'bg-zinc-800/40'}`}>
                                                    <div className="w-10 h-10 bg-zinc-900 text-blue-400 rounded-xl flex items-center justify-center font-bold shadow-inner">
                                                        {i + 1}
                                                    </div>
                                                    <div className="flex-1 font-bold text-white truncate">{p.name}</div>
                                                    {i === 0 && <span className="text-[10px] font-black bg-yellow-400/20 text-yellow-500 px-2 py-1 rounded-lg uppercase">Host</span>}
                                                    {p.name === playerName && <span className="text-[10px] font-black bg-blue-400 text-blue-950 px-2 py-1 rounded-lg uppercase">You</span>}
                                                </div>
                                            ))}
                                            {players.length < 2 && <div className="h-14 border-2 border-dashed border-zinc-800/50 rounded-2xl flex items-center justify-center text-zinc-600 text-xs font-bold">Waiting for players...</div>}
                                        </div>
                                    </div>

                                    {/* Red Team */}
                                    <div className="bg-red-600/5 border border-red-500/20 rounded-3xl p-6 ring-1 ring-red-500/10">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-red-400 font-black uppercase tracking-tighter text-2xl flex items-center gap-2">
                                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /> Red Team
                                            </h3>
                                            <span className="text-xs font-bold text-red-500/60 bg-red-500/10 px-3 py-1 rounded-full">
                                                {players.slice(Math.ceil(players.length / 2)).length} / 4
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {players.slice(Math.ceil(players.length / 2)).map((p, i) => (
                                                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl relative overflow-hidden transition-all ${p.name === playerName ? 'bg-red-500/20 ring-2 ring-red-500/50' : 'bg-zinc-800/40'}`}>
                                                    <div className="w-10 h-10 bg-zinc-900 text-red-400 rounded-xl flex items-center justify-center font-bold shadow-inner">
                                                        {Math.ceil(players.length / 2) + i + 1}
                                                    </div>
                                                    <div className="flex-1 font-bold text-white truncate">{p.name}</div>
                                                    {p.name === playerName && <span className="text-[10px] font-black bg-red-400 text-red-950 px-2 py-1 rounded-lg uppercase">You</span>}
                                                </div>
                                            ))}
                                            {players.length < 2 && <div className="h-14 border-2 border-dashed border-zinc-800/50 rounded-2xl flex items-center justify-center text-zinc-600 text-xs font-bold">Waiting for players...</div>}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-zinc-400 font-black uppercase tracking-widest text-sm flex items-center gap-2">
                                            <Users size={16} /> Active Pilots ({players.length})
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {players.map((p, i) => (
                                            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${p.name === playerName ? 'bg-blue-600/10 ring-1 ring-blue-500/30' : 'bg-zinc-800/50'}`}>
                                                <div className="w-9 h-9 bg-zinc-900 text-zinc-500 rounded-xl flex items-center justify-center font-bold">
                                                    {i + 1}
                                                </div>
                                                <div className="flex-1 font-bold text-white truncate">{p.name}</div>
                                                {i === 0 && <span className="text-[10px] font-black bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded-lg uppercase">Host</span>}
                                                {p.name === playerName && <span className="text-[10px] font-black bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg uppercase">You</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Lobby Rules / Info */}
                            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 flex-shrink-0">
                                    <Shield size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-zinc-300 mb-1">Game Info</p>
                                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                                        {mode === '1v1' ? 'First to reach the target kill count wins. Respawn protection active for 3 seconds.' : 
                                         mode === 'TDM' ? 'Work with your team. Stand near downed teammates to revive them.' : 
                                         'Co-op survival. Protect the host, outlast the aliens. Revive your squadmates before they bleed out.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Room Controls & Settings */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            {/* Room Access Panel */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">Room Info</p>
                                <div className="relative group mb-6">
                                    <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex flex-col items-center">
                                        <span className="text-zinc-600 text-[10px] font-black uppercase mb-1">Room Code</span>
                                        <span className="text-4xl font-mono font-black text-white tracking-[0.3em] pl-[0.3em]">{roomId}</span>
                                    </div>
                                    <button
                                        onClick={handleCopyCode}
                                        className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full font-bold text-xs flex items-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer ${copied ? 'bg-green-500 text-zinc-950' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                                    >
                                        {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> copy roomcode</>}
                                    </button>
                                </div>

                                {/* Dynamic Settings */}
                                {isLeader && (mode === '1v1' || mode === 'TDM') && (
                                    <div className="pt-4 border-t border-zinc-800 mt-4">
                                        <div className="flex justify-between items-end mb-4">
                                            <div>
                                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">Settings</p>
                                                <h4 className="text-white font-bold text-sm">Target Score</h4>
                                            </div>
                                            <div className="text-3xl font-mono font-black text-blue-400">{targetScore}</div>
                                        </div>
                                        <input
                                            type="range"
                                            min={mode === 'TDM' ? "20" : "10"}
                                            max={mode === 'TDM' ? "50" : "25"}
                                            step={mode === 'TDM' ? "5" : "1"}
                                            value={targetScore}
                                            onChange={(e) => setTargetScore(parseInt(e.target.value))}
                                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-2"
                                        />
                                        <div className="flex justify-between text-[10px] font-bold text-zinc-600 uppercase">
                                            <span>MIN</span>
                                            <span>MAX CAP</span>
                                        </div>
                                    </div>
                                )}

                                {!isLeader && (
                                    <div className="py-8 text-center bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-700/50 mt-4">
                                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest animate-pulse">Waiting for Host</p>
                                        <p className="text-[10px] text-zinc-600 mt-1 italic">Only the leader can initialize combat.</p>
                                    </div>
                                )}
                            </div>

                            {/* Start Section */}
                            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 group-hover:bg-blue-400 transition-colors" />
                                
                                {isLeader ? (
                                    <>
                                        <h4 className="text-white font-bold mb-2">Combat Readiness</h4>
                                        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                                            Ensure all pilots have successfully linked to the frequency before initializing the jump.
                                        </p>
                                        <button
                                            onClick={handleStartGame}
                                            disabled={!!lobbyCountdown}
                                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:grayscale text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
                                        >
                                            <Zap size={22} fill="currentColor" /> start game
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
                                            <Users size={24} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-zinc-300">Linked to Room</p>
                                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Awaiting host command...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Countdown Overlay */}
                        {lobbyCountdown !== null && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                                <div className="text-center">
                                    <p className="text-blue-500 font-black uppercase tracking-[0.5em] mb-4 text-xl animate-pulse">Starting</p>
                                    <div className="text-[12rem] font-black text-white leading-none font-mono drop-shadow-[0_0_50px_rgba(59,130,246,0.5)]">
                                        {lobbyCountdown}
                                    </div>
                                    <p className="text-zinc-600 text-sm font-bold mt-4">READY...</p>
                                </div>
                                {/* Fullscreen scanline effect */}
                                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-[101]" />
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 md:p-12 font-sans text-zinc-100 relative overflow-hidden">
            {/* Ambient Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />
            </div>

            {/* Dynamic Rendering based on Screen state */}
            {renderScreen()}
        </div>
    );
};

export default Lobby;
