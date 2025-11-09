// src/sockets/utils.ts
import { Server } from 'socket.io';

export function emitToRoom(io: Server, roomCode: string, event: string, data: any) {
    io.to(roomCode).emit(event, data);
}

export function emitToPlayer(io: Server, playerSocketId: string, event: string, data: any) {
    io.to(playerSocketId).emit(event, data);
}
