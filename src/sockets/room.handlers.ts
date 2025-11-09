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

        RoomManager.addPlayer(roomCode, socket.id, name);
        socket.join(roomCode);

        callback?.({ roomCode, playerId: socket.id });
        io.to(roomCode).emit('room:update', RoomManager.getPublicState(roomCode));
    });
}
