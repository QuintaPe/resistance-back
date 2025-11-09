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
        GameState.voteTeam(roomCode, socket.id, vote);
        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));
    });

    socket.on('mission:act', ({ roomCode, action }) => {
        GameState.performMissionAction(roomCode, socket.id, action);
        io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));
    });

    socket.on('game:requestRole', ({ roomCode }) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room || room.state.phase === 'lobby') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const isSpy = room.state.spies.includes(socket.id);
        const roleData = {
            role: isSpy ? 'spy' : 'resistance',
            spies: isSpy ? room.state.spies : undefined
        };
        
        console.log(`🔄 Enviando rol solicitado a ${player.name}: ${roleData.role}`);
        io.to(socket.id).emit('game:role', roleData);
    });
}
