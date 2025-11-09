// src/sockets/index.ts
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

import { registerRoomHandlers } from './room.handlers';
import { registerGameHandlers } from './game.handlers';

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
        });
    });
}
