// src/sockets/handlers/connection.handlers.ts

import { Server, Socket } from 'socket.io';
import { roomService } from '../../services/room.service';
import { CREATOR_EVENTS, PLAYER_EVENTS, ROOM_EVENTS } from '../../core/constants';

/**
 * Maneja eventos de conexión y desconexión de sockets
 */
export function registerConnectionHandlers(io: Server, socket: Socket): void {

    socket.on('disconnect', (reason) => {
        console.log(`Socket desconectado: ${socket.id}, razón: ${reason}`);

        const room = roomService.findRoomBySocketId(socket.id);
        if (!room) return;

        const sessionData = roomService.getSessionIdFromSocket(socket.id);
        if (!sessionData) return;

        const sessionId = sessionData.sessionId;
        console.log(`Jugador ${sessionId} (socket: ${socket.id}) desconectándose de la sala ${room.code}`);

        const wasCreator = roomService.isCreator(room.code, sessionId);

        // Si está en el lobby, eliminar inmediatamente
        if (room.state.phase === 'lobby') {
            const updatedRoom = roomService.removePlayer(room.code, sessionId);
            if (updatedRoom) {
                if (wasCreator) {
                    roomService.transferCreator(room.code);
                    io.to(room.code).emit(CREATOR_EVENTS.CHANGED, {
                        message: 'El creador ha salido. Se ha transferido el rol.'
                    });
                }

                io.to(room.code).emit(ROOM_EVENTS.UPDATE, roomService.getPublicState(room.code));
                console.log(`Sala ${room.code} actualizada. Jugadores restantes: ${updatedRoom.players.length}`);
            } else {
                console.log(`Sala ${room.code} eliminada (quedó vacía)`);
            }
        } else {
            // Partida en curso - dar tiempo para reconexión
            roomService.markPlayerDisconnected(room.code, socket.id, () => {
                const finalRoom = roomService.removePlayer(room.code, sessionId);
                if (finalRoom) {
                    if (wasCreator) {
                        roomService.transferCreator(room.code);
                        io.to(room.code).emit(CREATOR_EVENTS.CHANGED, {
                            message: 'El creador se desconectó permanentemente. Se ha transferido el rol.'
                        });
                    }

                    io.to(room.code).emit(PLAYER_EVENTS.REMOVED, {
                        playerId: sessionId,
                        message: 'Un jugador ha sido eliminado por inactividad'
                    });

                    io.to(room.code).emit(ROOM_EVENTS.UPDATE, roomService.getPublicState(room.code));
                    console.log(`⚠️ Jugador eliminado permanentemente. Sala ${room.code} actualizada.`);
                } else {
                    roomService.clearRoomTimers(room.code);
                    console.log(`Sala ${room.code} eliminada (quedó vacía)`);
                }
            });

            io.to(room.code).emit(ROOM_EVENTS.UPDATE, roomService.getPublicState(room.code));
            io.to(room.code).emit(PLAYER_EVENTS.DISCONNECTED, {
                playerId: sessionId,
                message: 'Un jugador se ha desconectado temporalmente',
                isTemporary: true
            });
        }
    });
}

