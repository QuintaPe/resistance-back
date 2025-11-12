// src/sockets/index.ts
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

import { registerRoomHandlers } from './room.handlers';
import { registerGameHandlers } from './game.handlers';
import { RoomManager } from '../game/roomManager';

export function initSocket(server: HttpServer) {
    const io = new Server(server, {
        cors: { origin: "*" }
    });

    io.on('connection', (socket) => {
        console.log(`Socket conectado: ${socket.id}`);

        // Handlers separados
        registerRoomHandlers(io, socket);
        registerGameHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log(`Socket desconectado: ${socket.id}`);

            // Buscar la sala del jugador
            const room = RoomManager.findRoomByPlayerId(socket.id);
            if (room) {
                console.log(`Jugador ${socket.id} saliendo de la sala ${room.code}`);

                // Si la partida ya comenzó, guardar información del jugador antes de eliminarlo
                if (room.state.phase !== 'lobby') {
                    const player = room.players.find(p => p.id === socket.id);
                    if (player) {
                        const wasSpy = room.state.spies.includes(socket.id);
                        room.disconnectedPlayers.set(socket.id, {
                            name: player.name,
                            wasSpy
                        });
                        console.log(`💾 Guardado info del jugador ${player.name} (${wasSpy ? 'espía' : 'resistencia'}) para posible reemplazo`);
                    }
                }

                // Eliminar al jugador de la sala
                const updatedRoom = RoomManager.removePlayer(room.code, socket.id);

                // Si la sala aún existe (no quedó vacía), notificar a los demás
                if (updatedRoom) {
                    io.to(room.code).emit('room:update', RoomManager.getPublicState(room.code));
                    console.log(`Sala ${room.code} actualizada. Jugadores restantes: ${updatedRoom.players.length}`);
                } else {
                    console.log(`Sala ${room.code} eliminada (quedó vacía)`);
                }
            }
        });
    });
}
