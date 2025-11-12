// src/sockets/game.handlers.ts
import { Server, Socket } from 'socket.io';
import { RoomManager } from '../game/roomManager';
import { GameState } from '../game/state';

export function registerGameHandlers(io: Server, socket: Socket) {

    socket.on('game:start', ({ roomCode }, callback) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        GameState.start(roomCode);

        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));

        // Enviar roles privados a cada jugador
        console.log('🎭 Enviando roles a jugadores. Espías:', room.state.spies);
        room.players.forEach(player => {
            const isSpy = room.state.spies.includes(player.id);
            const roleData = {
                role: isSpy ? 'spy' : 'resistance',
                spies: isSpy ? room.state.spies : undefined
            };
            console.log(`  -> Jugador ${player.name} (${player.id}): ${roleData.role}`);
            io.to(player.id).emit('game:role', roleData);
        });

        callback?.({ ok: true });
    });

    socket.on('team:propose', ({ roomCode, teamIds }) => {
        GameState.proposeTeam(roomCode, socket.id, teamIds);
        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));
    });

    socket.on('team:vote', ({ roomCode, vote }) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        const phaseBefore = room.state.phase;
        GameState.voteTeam(roomCode, socket.id, vote);
        const phaseAfter = room.state.phase;

        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));

        // Si el juego acaba de terminar, enviar roles a todos
        if (phaseBefore !== 'reveal' && phaseAfter === 'reveal') {
            console.log('🎭 Partida terminada. Revelando roles a todos los jugadores. Espías:', room.state.spies);
            room.players.forEach(player => {
                const isSpy = room.state.spies.includes(player.id);
                const roleData = {
                    role: isSpy ? 'spy' : 'resistance',
                    spies: room.state.spies // Ahora todos reciben la lista de espías
                };
                io.to(player.id).emit('game:role', roleData);
            });
        }
    });

    socket.on('mission:act', ({ roomCode, action }) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        const phaseBefore = room.state.phase;
        GameState.performMissionAction(roomCode, socket.id, action);
        const phaseAfter = room.state.phase;

        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));

        // Si el juego acaba de terminar, enviar roles a todos
        if (phaseBefore !== 'reveal' && phaseAfter === 'reveal') {
            console.log('🎭 Partida terminada. Revelando roles a todos los jugadores. Espías:', room.state.spies);
            room.players.forEach(player => {
                const isSpy = room.state.spies.includes(player.id);
                const roleData = {
                    role: isSpy ? 'spy' : 'resistance',
                    spies: room.state.spies // Ahora todos reciben la lista de espías
                };
                io.to(player.id).emit('game:role', roleData);
            });
        }
    });

    socket.on('game:requestRole', ({ roomCode }) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room || room.state.phase === 'lobby') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const isSpy = room.state.spies.includes(socket.id);
        const isGameOver = room.state.phase === 'reveal';

        const roleData = {
            role: isSpy ? 'spy' : 'resistance',
            // Si el juego terminó, todos ven los espías. Si no, solo los espías los ven
            spies: (isSpy || isGameOver) ? room.state.spies : undefined
        };

        console.log(`🔄 Enviando rol solicitado a ${player.name}: ${roleData.role}`);
        io.to(socket.id).emit('game:role', roleData);
    });

    socket.on('game:restart', ({ roomCode }, callback) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        // Verificar que la partida haya terminado
        if (room.state.phase !== 'reveal') {
            callback?.({ error: 'La partida aún no ha terminado' });
            return;
        }

        // Reiniciar el juego con el siguiente líder
        GameState.restart(roomCode);

        // Enviar el estado actualizado a todos
        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));

        // Enviar roles privados a cada jugador
        console.log('🎭 Enviando roles a jugadores (partida reiniciada). Espías:', room.state.spies);
        room.players.forEach(player => {
            const isSpy = room.state.spies.includes(player.id);
            const roleData = {
                role: isSpy ? 'spy' : 'resistance',
                spies: isSpy ? room.state.spies : undefined
            };
            console.log(`  -> Jugador ${player.name} (${player.id}): ${roleData.role}`);
            io.to(player.id).emit('game:role', roleData);
        });

        callback?.({ ok: true });
    });

    socket.on('game:returnToLobby', ({ roomCode }, callback) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) {
            callback?.({ error: 'La sala no existe' });
            return;
        }

        // Verificar que la partida haya terminado
        if (room.state.phase !== 'reveal') {
            callback?.({ error: 'La partida aún no ha terminado' });
            return;
        }

        // Volver al lobby
        GameState.returnToLobby(roomCode);

        // Enviar el estado actualizado a todos
        io.to(roomCode).emit('room:update', GameState.getPublicState(roomCode));

        callback?.({ ok: true });
    });
}
