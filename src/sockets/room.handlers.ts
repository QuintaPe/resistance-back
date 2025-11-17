// src/sockets/room.handlers.ts
import { Server, Socket } from 'socket.io';
import { RoomManager } from '../game/roomManager';

export function registerRoomHandlers(io: Server, socket: Socket) {

    socket.on('room:create', ({ name }, callback) => {
        // Generar sessionId para el creador
        const sessionId = RoomManager.generateSessionId();
        
        // Crear sala con el sessionId del creador
        const room = RoomManager.createRoom(sessionId);
        
        // Agregar el jugador a la sala
        RoomManager.addPlayer(room.code, socket.id, name, sessionId);

        socket.join(room.code);

        console.log(`✨ Sala creada: ${room.code} | Creador: ${name} (sessionId: ${sessionId})`);

        // playerId ES sessionId
        callback?.({ roomCode: room.code, playerId: sessionId, sessionId });
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

                // Obtener el jugador reconectado
                const reconnectedPlayer = room.players.find(p => p.sessionId === sessionId);
                if (reconnectedPlayer) {
                    // Verificar si es espía usando sessionId
                    const wasSpy = room.state.spies.includes(sessionId);

                    // Enviar el rol al jugador reconectado
                    const roleData = {
                        role: wasSpy ? 'spy' : 'resistance',
                        spies: wasSpy ? room.state.spies : undefined
                    };

                    console.log(`✅ Jugador reconectado. Enviando rol: ${roleData.role} (sessionId: ${sessionId})`);
                    io.to(socket.id).emit('game:role', roleData);

                    // Enviar el estado actual del juego
                    const publicState = RoomManager.getPublicState(roomCode);
                    io.to(socket.id).emit('game:update', publicState);

                    // Notificar a todos de la reconexión
                    io.to(roomCode).emit('room:update', publicState);
                    io.to(roomCode).emit('player:reconnected', {
                        playerId: sessionId, // ✅ Usar sessionId como playerId
                        message: `${reconnectedPlayer.name} se ha reconectado`
                    });
                }

                callback?.({ roomCode, playerId: sessionId, sessionId, reconnected: true }); // ✅ Devolver sessionId
                return;
            }
        }

        // Verificar si el jugador puede unirse (no es reconexión)
        const joinCheck = RoomManager.canJoinRoom(roomCode);
        if (!joinCheck.canJoin) {
            console.log(`❌ ${socket.id} no puede unirse a ${roomCode}: ${joinCheck.error}`);
            return callback?.({ error: joinCheck.error });
        }

        // Agregar el jugador a la sala (genera sessionId si no se proporciona)
        const newSessionId = RoomManager.addPlayer(roomCode, socket.id, name, sessionId);
        socket.join(roomCode);

        console.log(`👤 Jugador unido: ${name} (sessionId: ${newSessionId})`);

        // playerId ES sessionId
        callback?.({ roomCode, playerId: newSessionId, sessionId: newSessionId });
        io.to(roomCode).emit('room:update', RoomManager.getPublicState(roomCode));
    });

    // Expulsar a un jugador (solo el creador)
    socket.on('player:kick', ({ roomCode, targetPlayerId }, callback) => {
        console.log(`📩 Solicitud de expulsión recibida para expulsar ${targetPlayerId} en sala ${roomCode}`);

        const room = RoomManager.getRoom(roomCode);
        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        // Buscar el sessionId del socket actual (quien solicita la expulsión)
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

        // Intentar expulsar usando sessionIds
        const result = RoomManager.kickPlayer(roomCode, requesterSessionId, targetPlayerId);

        if (!result.success) {
            console.log(`❌ Expulsión fallida: ${result.error}`);
            return callback?.({ error: result.error });
        }

        // Obtener el socketId del jugador expulsado para notificarle
        const targetSocketId = RoomManager.getSocketId(roomCode, targetPlayerId);
        if (targetSocketId) {
            // Notificar al jugador expulsado
            io.to(targetSocketId).emit('player:kicked', {
                message: 'Has sido expulsado de la sala por el creador'
            });

            // Desconectar al jugador expulsado de la sala
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.leave(roomCode);
            }
        }

        // Notificar a todos en la sala
        const updatedState = RoomManager.getPublicState(roomCode);
        io.to(roomCode).emit('room:update', updatedState);

        callback?.({ success: true });
        console.log(`✅ Expulsión completada exitosamente`);
    });

    // Cambiar el líder (solo el creador, solo en lobby)
    socket.on('room:changeLeader', ({ roomCode, newLeaderIndex }, callback) => {
        console.log(`📩 Solicitud de cambio de líder recibida de ${socket.id} en sala ${roomCode}`);

        const room = RoomManager.getRoom(roomCode);

        if (!room) {
            return callback?.({ error: "La sala no existe" });
        }

        // Obtener sessionId desde socketId
        const sessionData = RoomManager.getSessionIdFromSocket(socket.id);
        if (!sessionData) {
            return callback?.({ error: "No se pudo identificar al solicitante" });
        }

        // Validar que quien envía es el creador
        if (!RoomManager.isCreator(roomCode, sessionData.sessionId)) {
            return callback?.({ error: "Solo el creador puede cambiar el líder" });
        }

        // Validar que está en fase "lobby"
        if (room.state.phase !== 'lobby') {
            return callback?.({ error: "Solo se puede cambiar el líder en el lobby" });
        }

        // Verificar que el índice es válido
        if (newLeaderIndex < 0 || newLeaderIndex >= room.players.length) {
            return callback?.({ error: "Índice de líder inválido" });
        }

        // Actualizar room.state.leaderIndex
        const oldLeaderIndex = room.state.leaderIndex;
        room.state.leaderIndex = newLeaderIndex;

        const newLeader = room.players[newLeaderIndex];
        const oldLeader = room.players[oldLeaderIndex];

        console.log(`👑 Líder cambiado de ${oldLeader?.name || 'N/A'} (índice ${oldLeaderIndex}) a ${newLeader.name} (índice ${newLeaderIndex})`);

        // Enviar room:update a todos
        io.to(roomCode).emit('room:update', RoomManager.getPublicState(roomCode));

        callback?.({ success: true });
    });
}
