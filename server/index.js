const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// Generate a random 6-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Room state: roomId -> { mode, players: [{id, name}] }
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // CREATE ROOM — leader picks mode, server generates a code
    socket.on('create_room', ({ playerName, mode, targetScore }) => {
        let roomId = generateRoomCode();
        // Ensure unique code
        while (rooms[roomId]) {
            roomId = generateRoomCode();
        }

        rooms[roomId] = {
            mode,
            targetScore: targetScore || 10,
            players: [{ id: socket.id, name: playerName, isAlive: true, score: 0, kills: 0 }]
        };

        socket.join(roomId);
        console.log(`${playerName} created room ${roomId} [${mode}]`);

        // Tell the leader which code was generated
        socket.emit('room_created', { roomId });
        // Broadcast updated player list
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    // JOIN ROOM — player enters the code shared by the leader
    socket.on('join_room', ({ roomId, playerName }) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit('join_error', 'Room not found. Check the code and try again.');
            return;
        }

        // Check capacity based on mode
        const maxPlayers = room.mode === '1v1' ? 2 : room.mode === 'JointOps' ? 4 : 8;
        if (room.players.length >= maxPlayers) {
            socket.emit('join_error', `Room is full (${maxPlayers}/${maxPlayers}).`);
            return;
        }

        // Check for duplicate name
        if (room.players.some(p => p.name === playerName)) {
            socket.emit('join_error', 'That name is already taken in this room.');
            return;
        }

        room.players.push({ id: socket.id, name: playerName, isAlive: true, score: 0, kills: 0 });
        socket.join(roomId);
        console.log(`${playerName} joined room ${roomId}`);

        socket.emit('joined_room', { roomId, mode: room.mode });
        io.to(roomId).emit('room_update', room.players);
    });

    // START GAME — leader triggers, server broadcasts to ALL players
    socket.on('start_game', ({ roomId, targetScore }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Only the leader (first player) can start the game
        if (room.players[0].id !== socket.id) return;

        if (targetScore) {
            room.targetScore = targetScore;
        }

        // Reset alive status for all players
        room.players.forEach(p => { p.isAlive = true; p.score = 0; p.kills = 0; });

        room.mapSeed = Math.floor(Math.random() * 1000000);

        // For TDM: auto-assign teams (first half = team 0, second half = team 1)
        if (room.mode === 'TDM') {
            const half = Math.ceil(room.players.length / 2);
            room.players.forEach((p, i) => { p.team = i < half ? 0 : 1; });
            room.teamScores = [0, 0];
            room.beacons = [];
            room.beaconIdCounter = 0;
        }

        // Emit countdown first (5 seconds), then game_started
        console.log(`Game countdown starting in room ${roomId} [${room.mode}]`);
        io.to(roomId).emit('game_countdown', { countdown: 5 });

        let count = 5;
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                io.to(roomId).emit('game_countdown', { countdown: count });
            } else {
                clearInterval(countdownInterval);
                console.log(`Game starting in room ${roomId} [${room.mode}]`);
                io.to(roomId).emit('game_started', {
                    roomId,
                    mode: room.mode,
                    players: room.players,
                    targetScore: room.targetScore || 10,
                    mapSeed: room.mapSeed
                });
            }
        }, 1000);
    });

    // PLAYER UPDATE — relay position/angle to other players in the room
    socket.on('player_update', ({ roomId, x, y, angle, hp, maxHp, isDown }) => {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        // Broadcast to everyone EXCEPT the sender
        socket.to(roomId).emit('remote_player_update', {
            id: socket.id,
            name: player.name,
            x, y, angle, hp, maxHp, isDown,
            team: player.team !== undefined ? player.team : undefined
        });
    });

    // ---- PVP EVENTS (1v1) ----

    // PVP HIT — attacker's bullet hit a remote player
    socket.on('pvp_hit', ({ roomId, targetId, damage }) => {
        const room = rooms[roomId];
        if (!room) return;
        socket.to(targetId).emit('pvp_damage', {
            attackerId: socket.id,
            damage
        });
    });

    // PVP DEATH — a player was killed by another player
    socket.on('pvp_death', ({ roomId, killerId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const killer = room.players.find(p => p.id === killerId);
        if (!killer) return;

        killer.kills = (killer.kills || 0) + 1;
        console.log(`PvP kill in ${roomId}: ${killer.name} now has ${killer.kills} kills`);

        // Build scores object
        const scores = {};
        room.players.forEach(p => { scores[p.id] = p.kills || 0; });

        // Broadcast updated scores
        io.to(roomId).emit('pvp_score_update', {
            scores,
            killerId,
            victimId: socket.id,
            killerName: killer.name
        });

        // Check win condition
        const target = room.targetScore || 10;
        if (killer.kills >= target) {
            console.log(`PvP game over in ${roomId}: ${killer.name} wins with ${killer.kills} kills`);
            io.to(roomId).emit('pvp_game_over', {
                winnerId: killerId,
                winnerName: killer.name,
                scores,
                reason: 'score'
            });
        }
    });

    // PVP TIMER EXPIRED — client reports timer ran out
    socket.on('pvp_timer_expired', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (room.pvpEnded) return;
        room.pvpEnded = true;

        const scores = {};
        room.players.forEach(p => { scores[p.id] = p.kills || 0; });

        let winner = room.players[0];
        room.players.forEach(p => {
            if ((p.kills || 0) > (winner.kills || 0)) winner = p;
        });

        console.log(`PvP timer expired in ${roomId}: ${winner.name} wins`);
        io.to(roomId).emit('pvp_game_over', {
            winnerId: winner.id,
            winnerName: winner.name,
            scores,
            reason: 'timer'
        });
    });

    // ---- TDM EVENTS ----

    socket.on('tdm_hit', ({ roomId, targetId, damage }) => {
        const room = rooms[roomId];
        if (!room) return;
        socket.to(targetId).emit('tdm_damage', {
            attackerId: socket.id,
            damage
        });
    });

    socket.on('tdm_death', ({ roomId, killerId, x, y }) => {
        const room = rooms[roomId];
        if (!room) return;

        const killer = room.players.find(p => p.id === killerId);
        const victim = room.players.find(p => p.id === socket.id);
        if (!killer || !victim) return;

        killer.kills = (killer.kills || 0) + 1;
        victim.isAlive = false;

        // Update team score
        const killerTeam = killer.team || 0;
        if (room.teamScores) {
            room.teamScores[killerTeam] = (room.teamScores[killerTeam] || 0) + 1;
        }

        console.log(`TDM kill in ${roomId}: ${killer.name} (Team ${killerTeam}) killed ${victim.name}. Score: ${room.teamScores}`);

        // Broadcast team scores
        io.to(roomId).emit('tdm_score_update', {
            teamScores: room.teamScores
        });

        // Spawn revive beacon
        const beaconId = `beacon_${roomId}_${room.beaconIdCounter++}`;
        const beacon = { id: beaconId, playerId: socket.id, playerName: victim.name, x, y, team: victim.team || 0 };
        room.beacons.push(beacon);

        io.to(roomId).emit('tdm_beacon_spawned', beacon);

        // Check win condition
        const target = room.targetScore || 30;
        if (room.teamScores[killerTeam] >= target) {
            console.log(`TDM game over in ${roomId}: Team ${killerTeam} wins`);
            io.to(roomId).emit('tdm_game_over', {
                winningTeam: killerTeam,
                teamScores: room.teamScores,
                reason: 'score'
            });
        }
    });

    socket.on('tdm_revive', ({ roomId, beaconId, revivedPlayerId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Remove beacon
        if (room.beacons) {
            room.beacons = room.beacons.filter(b => b.id !== beaconId);
        }

        // Mark player as alive
        const revivedPlayer = room.players.find(p => p.id === revivedPlayerId);
        if (revivedPlayer) {
            revivedPlayer.isAlive = true;
            console.log(`${revivedPlayer.name} revived in room ${roomId}`);
        }

        io.to(roomId).emit('tdm_beacon_removed', { beaconId });
        io.to(roomId).emit('tdm_revived', { playerId: revivedPlayerId });
    });

    socket.on('tdm_timer_expired', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.pvpEnded) return;
        room.pvpEnded = true;

        const winningTeam = (room.teamScores[0] || 0) >= (room.teamScores[1] || 0) ? 0 : 1;
        console.log(`TDM timer expired in ${roomId}: Team ${winningTeam} wins`);
        io.to(roomId).emit('tdm_game_over', {
            winningTeam,
            teamScores: room.teamScores,
            reason: 'timer'
        });
    });

    // PLAYER ELIMINATED — player used all revives and is permanently dead
    socket.on('player_eliminated', ({ roomId, score }) => {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.isAlive = false;
        player.score = score || 0;
        console.log(`${player.name} eliminated in room ${roomId} (score: ${player.score})`);

        // Notify others so they know this player is spectating
        socket.to(roomId).emit('player_spectating', { id: socket.id, name: player.name });

        // Check if all players are dead
        const allDead = room.players.every(p => !p.isAlive);
        if (allDead) {
            console.log(`All players dead in room ${roomId} — game over`);
            const totalScore = room.players.reduce((sum, p) => sum + (p.score || 0), 0);
            const highestWave = 0; // clients track wave locally
            io.to(roomId).emit('all_players_dead', {
                players: room.players.map(p => ({ name: p.name, score: p.score || 0 })),
                totalScore
            });
        }
    });

    // RETURN TO LOBBY — after game over, reset room for new game
    socket.on('return_to_lobby', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Reset all players to alive
        room.players.forEach(p => { p.isAlive = true; p.score = 0; p.kills = 0; });
        room.pvpEnded = false;
        console.log(`Room ${roomId} returning to lobby`);

        io.to(roomId).emit('room_update', room.players);
    });

    // DISCONNECT — clean up
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const removed = room.players.splice(index, 1);
                console.log(`${removed[0].name} left room ${roomId}`);
                io.to(roomId).emit('room_update', room.players);

                // Notify remaining players
                io.to(roomId).emit('player_disconnected', { id: socket.id });

                // Check if all remaining players are dead (disconnected player might have been last alive)
                if (room.players.length > 0) {
                    const allDead = room.players.every(p => !p.isAlive);
                    if (allDead) {
                        const totalScore = room.players.reduce((sum, p) => sum + (p.score || 0), 0);
                        io.to(roomId).emit('all_players_dead', {
                            players: room.players.map(p => ({ name: p.name, score: p.score || 0 })),
                            totalScore
                        });
                    }
                }

                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted (empty)`);
                }
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
