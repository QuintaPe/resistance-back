// src/sockets/handlers/room.handlers.ts

import { Server, Socket } from 'socket.io';
import { roomService } from '../../services/room.service';
import { ROOM_EVENTS, PLAYER_EVENTS, GAME_EVENTS, CREATOR_EVENTS } from '../../core/constants';

/**
 * Maneja eventos relacionados con salas
 */
export function registerRoomHandlers(io: Server, socket: Socket): void {

    // Crear sala
    socket.on(ROOM_EVENTS.CREATE, ({ name }, callback) => {
        const sessionId = roomService.generateSessionId();
        const room = roomService.createRoom(sessionId);

        roomService.addPlayer(room.code, socket.id, name, sessionId);
        socket.join(room.code);

        console.log(`✨ Sala creada: ${room.code} | Creador: ${name} (sessionId: ${sessionId})`);

        callback?.({ roomCode: room.code, playerId: sessionId, sessionId });
        io.to(room.code).emit(ROOM_EVENTS.UPDATE, roomService.getPublicState(room.code));
    });

    // Unirse a sala
    socket.on(ROOM_EVENTS.JOIN, ({ roomCode, name, sessionId }, callback) => {
        const room = roomService.getRoom(roomCode);
        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        // Verificar reconexión
        if (sessionId && roomService.hasDisconnectedPlayer(roomCode, sessionId)) {
            console.log(`🔄 Intento de reconexión con sessionId: ${sessionId}`);

            const reconnected = roomService.reconnectPlayer(roomCode, sessionId, socket.id);

            if (reconnected) {
                socket.join(roomCode);

                const reconnectedPlayer = room.players.find(p => p.sessionId === sessionId);
                if (reconnectedPlayer) {
                    const wasSpy = room.state.spies.includes(sessionId);

                    const roleData = {
                        role: wasSpy ? 'spy' : 'resistance',
                        spies: wasSpy ? room.state.spies : undefined
                    };

                    console.log(`✅ Jugador reconectado. Enviando rol: ${roleData.role} (sessionId: ${sessionId})`);
                    io.to(socket.id).emit(GAME_EVENTS.ROLE, roleData);

                    const publicState = roomService.getPublicState(roomCode);
                    io.to(socket.id).emit(GAME_EVENTS.UPDATE, publicState);

                    io.to(roomCode).emit(ROOM_EVENTS.UPDATE, publicState);
                    io.to(roomCode).emit(PLAYER_EVENTS.RECONNECTED, {
                        playerId: sessionId,
                        message: `${reconnectedPlayer.name} se ha reconectado`
                    });
                }

                callback?.({ roomCode, playerId: sessionId, sessionId, reconnected: true });
                return;
            }
        }

        // Verificar si puede unirse (no es reconexión)
        const joinCheck = roomService.canJoinRoom(roomCode);
        if (!joinCheck.canJoin) {
            console.log(`❌ ${socket.id} no puede unirse a ${roomCode}: ${joinCheck.error}`);
            return callback?.({ error: joinCheck.error });
        }

        const newSessionId = roomService.addPlayer(roomCode, socket.id, name, sessionId);
        socket.join(roomCode);

        console.log(`👤 Jugador unido: ${name} (sessionId: ${newSessionId})`);

        callback?.({ roomCode, playerId: newSessionId, sessionId: newSessionId });
        io.to(roomCode).emit(ROOM_EVENTS.UPDATE, roomService.getPublicState(roomCode));
    });

    // Expulsar jugador
    socket.on(PLAYER_EVENTS.KICK, ({ roomCode, targetPlayerId }, callback) => {
        console.log(`📩 Solicitud de expulsión recibida para expulsar ${targetPlayerId} en sala ${roomCode}`);

        const room = roomService.getRoom(roomCode);
        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        let requesterSessionId: string | null = null;
        for (const [sessionId, sid] of room.socketMapping.entries()) {
            if (sid === socket.id) {
                requesterSessionId = sessionId;
                break;
            }
        }

        if (!requesterSessionId) {
            return callback?.({ error: "No se pudo identificar al solicitante" });
        }

        const result = roomService.kickPlayer(roomCode, requesterSessionId, targetPlayerId);

        if (!result.success) {
            console.log(`❌ Expulsión fallida: ${result.error}`);
            return callback?.({ error: result.error });
        }

        const targetSocketId = roomService.getSocketId(roomCode, targetPlayerId);
        if (targetSocketId) {
            io.to(targetSocketId).emit(PLAYER_EVENTS.KICKED, {
                message: 'Has sido expulsado de la sala por el creador'
            });

            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.leave(roomCode);
            }
        }

        const updatedState = roomService.getPublicState(roomCode);
        io.to(roomCode).emit(ROOM_EVENTS.UPDATE, updatedState);

        callback?.({ success: true });
        console.log(`✅ Expulsión completada exitosamente`);
    });

    // Cambiar líder
    socket.on(ROOM_EVENTS.CHANGE_LEADER, ({ roomCode, newLeaderIndex }, callback) => {
        console.log(`📩 Solicitud de cambio de líder recibida de ${socket.id} en sala ${roomCode}`);

        const room = roomService.getRoom(roomCode);

        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) {
            return callback?.({ error: "No se pudo identificar al solicitante" });
        }

        if (!roomService.isCreator(roomCode, sessionData.sessionId)) {
            return callback?.({ error: "Solo el creador puede cambiar el líder" });
        }

        if (room.state.phase !== 'lobby') {
            return callback?.({ error: "Solo se puede cambiar el líder en el lobby" });
        }

        if (newLeaderIndex < 0 || newLeaderIndex >= room.players.length) {
            return callback?.({ error: "Índice de líder inválido" });
        }

        const oldLeaderIndex = room.state.leaderIndex;
        room.state.leaderIndex = newLeaderIndex;

        const newLeader = room.players[newLeaderIndex];
        const oldLeader = room.players[oldLeaderIndex];

        console.log(`👑 Líder cambiado de ${oldLeader?.name || 'N/A'} (índice ${oldLeaderIndex}) a ${newLeader.name} (índice ${newLeaderIndex})`);

        io.to(roomCode).emit(ROOM_EVENTS.UPDATE, roomService.getPublicState(roomCode));

        callback?.({ success: true });
    });
}

