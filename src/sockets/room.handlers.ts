// src/sockets/room.handlers.ts
import { Server, Socket } from 'socket.io';
import { RoomManager } from '../game/roomManager';

export function registerRoomHandlers(io: Server, socket: Socket) {

    socket.on('room:create', ({ name }, callback) => {
        const room = RoomManager.createRoom();
        const sessionId = RoomManager.addPlayer(room.code, socket.id, name);

        socket.join(room.code);

        callback?.({ roomCode: room.code, playerId: socket.id, sessionId });
        io.to(room.code).emit('room:update', RoomManager.getPublicState(room.code));
    });

    socket.on('room:join', ({ roomCode, name, sessionId }, callback) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        // Si se proporciona sessionId, verificar si es una reconexión
        if (sessionId && RoomManager.hasDisconnectedPlayer(roomCode, sessionId)) {
            console.log(`🔄 Intento de reconexión con sessionId: ${sessionId}`);

            const reconnected = RoomManager.reconnectPlayer(roomCode, sessionId, socket.id);

            if (reconnected) {
                socket.join(roomCode);

                // Obtener la información del jugador reconectado
                const disconnectedInfo = room.disconnectedPlayers.get(sessionId);
                const wasSpy = disconnectedInfo?.wasSpy || room.state.spies.includes(socket.id);

                // Enviar el rol al jugador reconectado
                const roleData = {
                    role: wasSpy ? 'spy' : 'resistance',
                    spies: wasSpy ? room.state.spies : undefined
                };

                console.log(`✅ Jugador reconectado. Enviando rol: ${roleData.role}`);
                io.to(socket.id).emit('game:role', roleData);

                // Enviar el estado actual del juego
                const publicState = RoomManager.getPublicState(roomCode);
                io.to(socket.id).emit('game:update', publicState);

                // Notificar a todos de la reconexión
                io.to(roomCode).emit('room:update', publicState);
                io.to(roomCode).emit('player:reconnected', {
                    playerId: socket.id,
                    message: `${disconnectedInfo?.name || 'Un jugador'} se ha reconectado`
                });

                callback?.({ roomCode, playerId: socket.id, sessionId, reconnected: true });
                return;
            }
        }

        // Verificar si el jugador puede unirse (no es reconexión)
        const joinCheck = RoomManager.canJoinRoom(roomCode);
        if (!joinCheck.canJoin) {
            console.log(`❌ ${socket.id} no puede unirse a ${roomCode}: ${joinCheck.error}`);
            return callback?.({ error: joinCheck.error });
        }

        // Agregar el jugador a la sala
        const newSessionId = RoomManager.addPlayer(roomCode, socket.id, name, sessionId);
        socket.join(roomCode);

        // Si está reemplazando a un jugador desconectado
        if (joinCheck.replacingPlayer) {
            console.log(`🔄 ${name} (${socket.id}) está reemplazando a un jugador en ${roomCode}`);

            // Asignar el rol del jugador desconectado
            RoomManager.assignReplacementPlayer(roomCode, socket.id);

            // Enviar el rol al nuevo jugador
            const isSpy = room.state.spies.includes(socket.id);
            const roleData = {
                role: isSpy ? 'spy' : 'resistance',
                spies: isSpy ? room.state.spies : undefined
            };
            console.log(`  -> Jugador de reemplazo ${name} recibe rol: ${roleData.role}`);
            io.to(socket.id).emit('game:role', roleData);

            // Enviar también el estado del juego
            const publicState = RoomManager.getPublicState(roomCode);
            io.to(socket.id).emit('game:update', publicState);
        }

        callback?.({ roomCode, playerId: socket.id, sessionId: newSessionId });
        io.to(roomCode).emit('room:update', RoomManager.getPublicState(roomCode));
    });
}
