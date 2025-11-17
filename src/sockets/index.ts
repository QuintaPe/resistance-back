// src/sockets/index.ts
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

import { registerRoomHandlers } from './room.handlers';
import { registerGameHandlers } from './game.handlers';
import { RoomManager } from '../game/roomManager';

export function initSocket(server: HttpServer) {
    const io = new Server(server, {
        cors: { origin: "*" },
        // Configuración optimizada para móviles
        pingTimeout: 60000,          // 60 segundos antes de considerar desconexión
        pingInterval: 25000,          // Verificar conexión cada 25 segundos
        connectTimeout: 45000,        // 45 segundos para establecer conexión
        transports: ['websocket', 'polling'], // Usar WebSocket con fallback a polling
        allowUpgrades: true,          // Permitir upgrade de polling a websocket
        perMessageDeflate: false      // Desactivar compresión para mejor rendimiento en móvil
    });

    io.on('connection', (socket) => {
        console.log(`Socket conectado: ${socket.id}`);

        // Handlers separados
        registerRoomHandlers(io, socket);
        registerGameHandlers(io, socket);

        socket.on('disconnect', (reason) => {
            console.log(`Socket desconectado: ${socket.id}, razón: ${reason}`);

            // Buscar la sala del jugador por socketId
            const room = RoomManager.findRoomBySocketId(socket.id);
            if (!room) return;

            // Obtener el sessionId del socket
            const sessionData = RoomManager.getSessionIdFromSocket(socket.id);
            if (!sessionData) return;

            const sessionId = sessionData.sessionId;
            console.log(`Jugador ${sessionId} (socket: ${socket.id}) desconectándose de la sala ${room.code}`);

            // Verificar si el jugador que se va es el creador
            const wasCreator = RoomManager.isCreator(room.code, sessionId);

            // Si está en el lobby, eliminar inmediatamente
            if (room.state.phase === 'lobby') {
                const updatedRoom = RoomManager.removePlayer(room.code, sessionId);
                if (updatedRoom) {
                    // Si era el creador, transferir el rol
                    if (wasCreator) {
                        RoomManager.transferCreator(room.code);
                        io.to(room.code).emit('creator:changed', {
                            message: 'El creador ha salido. Se ha transferido el rol.'
                        });
                    }
                    
                    io.to(room.code).emit('room:update', RoomManager.getPublicState(room.code));
                    console.log(`Sala ${room.code} actualizada. Jugadores restantes: ${updatedRoom.players.length}`);
                } else {
                    console.log(`Sala ${room.code} eliminada (quedó vacía)`);
                }
            } else {
                // Partida en curso - dar tiempo para reconexión
                RoomManager.markPlayerDisconnected(room.code, socket.id, () => {
                    // Callback cuando expira el timeout
                    const finalRoom = RoomManager.removePlayer(room.code, sessionId);
                    if (finalRoom) {
                        // Si era el creador, transferir el rol
                        if (wasCreator) {
                            RoomManager.transferCreator(room.code);
                            io.to(room.code).emit('creator:changed', {
                                message: 'El creador se desconectó permanentemente. Se ha transferido el rol.'
                            });
                        }
                        
                        // Emitir evento de eliminación permanente
                        io.to(room.code).emit('player:removed', {
                            playerId: sessionId,
                            message: 'Un jugador ha sido eliminado por inactividad'
                        });
                        
                        io.to(room.code).emit('room:update', RoomManager.getPublicState(room.code));
                        console.log(`⚠️ Jugador eliminado permanentemente. Sala ${room.code} actualizada.`);
                    } else {
                        RoomManager.clearRoomTimers(room.code);
                        console.log(`Sala ${room.code} eliminada (quedó vacía)`);
                    }
                });

                // Notificar inmediatamente que el jugador está desconectado
                io.to(room.code).emit('room:update', RoomManager.getPublicState(room.code));
                io.to(room.code).emit('player:disconnected', {
                    playerId: sessionId,
                    message: 'Un jugador se ha desconectado temporalmente',
                    isTemporary: true // ⭐ Indica que es una desconexión temporal
                });
            }
        });
    });
}
