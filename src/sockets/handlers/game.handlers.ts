// src/sockets/handlers/game.handlers.ts

import { Server, Socket } from 'socket.io';
import { roomService } from '../../services/room.service';
import { gameService } from '../../services/game.service';
import { GAME_EVENTS, TEAM_EVENTS, MISSION_EVENTS, ROOM_EVENTS } from '../../core/constants';

/**
 * Maneja eventos relacionados con el juego
 */
export function registerGameHandlers(io: Server, socket: Socket): void {

    // Iniciar juego
    socket.on(GAME_EVENTS.START, ({ roomCode }, callback) => {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        gameService.start(roomCode);

        io.to(roomCode).emit(GAME_EVENTS.UPDATE, gameService.getPublicState(roomCode));

        // Enviar roles privados a cada jugador
        console.log('🎭 Enviando roles a jugadores. Espías (sessionIds):', room.state.spies);
        room.players.forEach(player => {
            const isSpy = room.state.spies.includes(player.id);
            const roleData = {
                role: isSpy ? 'spy' : 'resistance',
                spies: isSpy ? room.state.spies : undefined
            };
            console.log(`  -> Jugador ${player.name} (sessionId: ${player.id}): ${roleData.role}`);

            const playerSocketId = roomService.getSocketId(roomCode, player.id);
            if (playerSocketId) {
                io.to(playerSocketId).emit(GAME_EVENTS.ROLE, roleData);
            }
        });

        callback?.({ ok: true });
    });

    // Proponer equipo
    socket.on(TEAM_EVENTS.PROPOSE, ({ roomCode, teamIds }) => {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) return;

        const player = room.players.find(p => p.id === sessionData.sessionId);
        if (!player) return;

        gameService.proposeTeam(roomCode, player.id, teamIds);
        io.to(roomCode).emit(GAME_EVENTS.UPDATE, gameService.getPublicState(roomCode));
    });

    // Votar equipo
    socket.on(TEAM_EVENTS.VOTE, ({ roomCode, vote }) => {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) return;

        const player = room.players.find(p => p.id === sessionData.sessionId);
        if (!player) return;

        const phaseBefore = room.state.phase;
        gameService.voteTeam(roomCode, player.id, vote);
        const phaseAfter = room.state.phase;

        io.to(roomCode).emit(GAME_EVENTS.UPDATE, gameService.getPublicState(roomCode));

        // Si el juego acaba de terminar, enviar roles a todos
        if (phaseBefore !== 'reveal' && phaseAfter === 'reveal') {
            console.log('🎭 Partida terminada. Revelando roles a todos los jugadores. Espías (sessionIds):', room.state.spies);
            room.players.forEach(p => {
                const isSpy = room.state.spies.includes(p.id);
                const roleData = {
                    role: isSpy ? 'spy' : 'resistance',
                    spies: room.state.spies
                };

                const playerSocketId = roomService.getSocketId(roomCode, p.id);
                if (playerSocketId) {
                    io.to(playerSocketId).emit(GAME_EVENTS.ROLE, roleData);
                }
            });
        }
    });

    // Realizar acción de misión
    socket.on(MISSION_EVENTS.ACT, ({ roomCode, action }) => {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) return;

        const player = room.players.find(p => p.id === sessionData.sessionId);
        if (!player) return;

        const phaseBefore = room.state.phase;
        gameService.performMissionAction(roomCode, player.id, action);
        const phaseAfter = room.state.phase;

        io.to(roomCode).emit(GAME_EVENTS.UPDATE, gameService.getPublicState(roomCode));

        // Si el juego acaba de terminar, enviar roles a todos
        if (phaseBefore !== 'reveal' && phaseAfter === 'reveal') {
            console.log('🎭 Partida terminada. Revelando roles a todos los jugadores. Espías (sessionIds):', room.state.spies);
            room.players.forEach(p => {
                const isSpy = room.state.spies.includes(p.id);
                const roleData = {
                    role: isSpy ? 'spy' : 'resistance',
                    spies: room.state.spies
                };

                const playerSocketId = roomService.getSocketId(roomCode, p.id);
                if (playerSocketId) {
                    io.to(playerSocketId).emit(GAME_EVENTS.ROLE, roleData);
                }
            });
        }
    });

    // Solicitar rol
    socket.on(GAME_EVENTS.REQUEST_ROLE, ({ roomCode }) => {
        const room = roomService.getRoom(roomCode);
        if (!room || room.state.phase === 'lobby') return;

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) return;

        const player = room.players.find(p => p.id === sessionData.sessionId);
        if (!player) return;

        const isSpy = room.state.spies.includes(player.id);
        const isGameOver = room.state.phase === 'reveal';

        const roleData = {
            role: isSpy ? 'spy' : 'resistance',
            spies: (isSpy || isGameOver) ? room.state.spies : undefined
        };

        console.log(`🔄 Enviando rol solicitado a ${player.name}: ${roleData.role}`);
        io.to(socket.id).emit(GAME_EVENTS.ROLE, roleData);
    });

    // Reiniciar partida
    socket.on(GAME_EVENTS.RESTART, ({ roomCode }, callback) => {
        const room = roomService.getRoom(roomCode);
        if (!room) {
            callback?.({ error: 'La sala no existe' });
            return;
        }

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) {
            callback?.({ error: 'No se pudo identificar al jugador' });
            return;
        }

        const isCreator = roomService.isCreator(roomCode, sessionData.sessionId);

        if (!isCreator && room.state.phase !== 'reveal') {
            callback?.({ error: 'Solo el creador puede reiniciar la partida antes de que termine' });
            return;
        }

        console.log(`🔄 ${isCreator ? 'Creador' : 'Jugador'} reiniciando partida en sala ${roomCode}`);

        gameService.restart(roomCode);

        io.to(roomCode).emit(GAME_EVENTS.UPDATE, gameService.getPublicState(roomCode));

        // Enviar roles privados a cada jugador
        console.log('🎭 Enviando roles a jugadores (partida reiniciada). Espías (sessionIds):', room.state.spies);
        room.players.forEach(player => {
            const isSpy = room.state.spies.includes(player.id);
            const roleData = {
                role: isSpy ? 'spy' : 'resistance',
                spies: isSpy ? room.state.spies : undefined
            };
            console.log(`  -> Jugador ${player.name} (sessionId: ${player.id}): ${roleData.role}`);

            const playerSocketId = roomService.getSocketId(roomCode, player.id);
            if (playerSocketId) {
                io.to(playerSocketId).emit(GAME_EVENTS.ROLE, roleData);
            }
        });

        callback?.({ ok: true });
    });

    // Volver al lobby
    socket.on(GAME_EVENTS.RETURN_TO_LOBBY, ({ roomCode }, callback) => {
        const room = roomService.getRoom(roomCode);
        if (!room) {
            callback?.({ error: 'La sala no existe' });
            return;
        }

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) {
            callback?.({ error: 'No se pudo identificar al jugador' });
            return;
        }

        const isCreator = roomService.isCreator(roomCode, sessionData.sessionId);

        if (!isCreator && room.state.phase !== 'reveal') {
            callback?.({ error: 'Solo el creador puede volver al lobby antes de que termine la partida' });
            return;
        }

        console.log(`🏠 ${isCreator ? 'Creador' : 'Jugador'} regresando al lobby en sala ${roomCode}`);

        gameService.returnToLobby(roomCode);

        io.to(roomCode).emit(ROOM_EVENTS.UPDATE, gameService.getPublicState(roomCode));

        callback?.({ ok: true });
    });
}

