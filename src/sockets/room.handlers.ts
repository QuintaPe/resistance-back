// src/sockets/room.handlers.ts
import { Server, Socket } from 'socket.io';
import { RoomManager } from '../game/roomManager';

export function registerRoomHandlers(io: Server, socket: Socket) {

    socket.on('room:create', ({ name }, callback) => {
        const room = RoomManager.createRoom();
        RoomManager.addPlayer(room.code, socket.id, name);

        socket.join(room.code);

        callback?.({ roomCode: room.code, playerId: socket.id });
        io.to(room.code).emit('room:update', RoomManager.getPublicState(room.code));
    });

    socket.on('room:join', ({ roomCode, name }, callback) => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        // Verificar si el jugador puede unirse
        const joinCheck = RoomManager.canJoinRoom(roomCode);
        if (!joinCheck.canJoin) {
            console.log(`❌ ${socket.id} no puede unirse a ${roomCode}: ${joinCheck.error}`);
            return callback?.({ error: joinCheck.error });
        }

        // Agregar el jugador a la sala
        RoomManager.addPlayer(roomCode, socket.id, name);
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

        callback?.({ roomCode, playerId: socket.id });
        io.to(roomCode).emit('room:update', RoomManager.getPublicState(roomCode));
    });
}
