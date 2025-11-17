// src/sockets/index.ts

import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

import { registerConnectionHandlers } from './handlers/connection.handlers';
import { registerRoomHandlers } from './handlers/room.handlers';
import { registerGameHandlers } from './handlers/game.handlers';

/**
 * Inicializa Socket.IO y registra todos los handlers
 */
export function initSocket(server: HttpServer): void {
    const io = new Server(server, {
        cors: { origin: "*" },
        // Configuración optimizada para móviles
        pingTimeout: 60000,          // 60 segundos antes de considerar desconexión
        pingInterval: 25000,          // Verificar conexión cada 25 segundos
        connectTimeout: 45000,        // 45 segundos para establecer conexión
        transports: ['websocket', 'polling'],
        allowUpgrades: true,
        perMessageDeflate: false
    });

    io.on('connection', (socket) => {
        console.log(`Socket conectado: ${socket.id}`);

        // Registrar handlers
        registerConnectionHandlers(io, socket);
        registerRoomHandlers(io, socket);
        registerGameHandlers(io, socket);
    });
}
