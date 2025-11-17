// src/game/roomManager.ts

import { Room } from "./types";
import { generateRoomCode } from "../utils/id";

class RoomManagerClass {
    private rooms: Map<string, Room> = new Map();

    createRoom(creatorSessionId: string) {
        const code = generateRoomCode();

        const room: Room = {
            code,
            players: [],
            creatorId: creatorSessionId,  // Guardar el sessionId del creador
            state: {
                phase: "lobby",
                leaderIndex: 0,
                spies: [],
                currentMission: 0,
                teamSizePerMission: [],
                failsRequired: [],
                proposedTeam: [],
                teamVotes: {},
                missionActions: {},
                results: [],
                rejectedTeamsInRow: 0,
                votedPlayers: [],
                playersActed: []
            },
            disconnectedPlayers: new Map(),
            disconnectTimers: new Map(),
            socketMapping: new Map() // sessionId → socket.id actual
        };

        this.rooms.set(code, room);
        console.log(`🏠 Sala ${code} creada por ${creatorSessionId} (sessionId)`);
        return room;
    }

    getRoom(code: string) {
        return this.rooms.get(code) || null;
    }

    addPlayer(roomCode: string, socketId: string, name: string, sessionId?: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        // Generar sessionId si no se proporciona (nuevo jugador)
        const finalSessionId = sessionId || this.generateSessionId();

        // player.id ES el sessionId (no el socket.id)
        room.players.push({
            id: finalSessionId,
            sessionId: finalSessionId, // alias explícito para compatibilidad
            name,
            connected: true, // ⭐ nuevo jugador está conectado
            disconnectedAt: null // ⭐ no tiene desconexión previa
        });

        // Guardar el mapeo sessionId → socket.id actual
        room.socketMapping.set(finalSessionId, socketId);

        console.log(`✅ Jugador agregado: ${name} (sessionId: ${finalSessionId}, socketId: ${socketId})`);

        return finalSessionId;
    }

    generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    removePlayer(roomCode: string, sessionId: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        // Eliminar el jugador de la lista (player.id ES sessionId)
        room.players = room.players.filter(p => p.id !== sessionId);

        // Eliminar del array de spies si era espía
        room.state.spies = room.state.spies.filter(spyId => spyId !== sessionId);

        // Eliminar del mapeo de sockets
        room.socketMapping.delete(sessionId);

        console.log(`🗑️ Jugador eliminado (sessionId: ${sessionId})`);

        // Si la sala queda vacía, eliminarla
        if (room.players.length === 0) {
            this.clearRoomTimers(roomCode);
            this.rooms.delete(roomCode);
            return null;
        }

        return room;
    }

    // Buscar sala por sessionId (playerId)
    findRoomByPlayerId(playerId: string): Room | null {
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.id === playerId)) {
                return room;
            }
        }
        return null;
    }

    // Buscar sala por socketId actual
    findRoomBySocketId(socketId: string): Room | null {
        for (const room of this.rooms.values()) {
            if (room.socketMapping.has(socketId) ||
                Array.from(room.socketMapping.values()).includes(socketId)) {
                return room;
            }
        }
        return null;
    }

    // Obtener sessionId desde socketId
    getSessionIdFromSocket(socketId: string): { sessionId: string; roomCode: string } | null {
        for (const room of this.rooms.values()) {
            for (const [sessionId, sid] of room.socketMapping.entries()) {
                if (sid === socketId) {
                    return { sessionId, roomCode: room.code };
                }
            }
        }
        return null;
    }

    getPublicState(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        const { state } = room;

        return {
            code: room.code,
            // ⭐ TODOS los jugadores (conectados y desconectados), pero sin propiedades internas
            players: room.players.map(p => ({
                id: p.id,
                sessionId: p.sessionId,
                name: p.name
                // No enviamos 'connected' ni 'disconnectedAt' - el frontend lo deduce
            })),
            creatorId: room.creatorId,  // Incluir el ID del creador
            phase: state.phase,
            leaderIndex: state.leaderIndex,
            currentMission: state.currentMission,
            teamSizePerMission: state.teamSizePerMission,
            failsRequired: state.failsRequired,
            proposedTeam: state.proposedTeam,
            results: state.results,
            rejectedTeamsInRow: state.rejectedTeamsInRow,
            votedPlayers: state.votedPlayers,
            playersActed: state.playersActed
            // roles ocultos no se envían aquí
        };
    }

    // Puede unirse solo en lobby (durante la partida solo se permiten reconexiones)
    canJoinRoom(roomCode: string): { canJoin: boolean; error?: string } {
        const room = this.rooms.get(roomCode);
        if (!room) return { canJoin: false, error: "La sala no existe" };

        // En el lobby, permitir siempre
        if (room.state.phase === "lobby") {
            return { canJoin: true };
        }

        // Durante la partida, NO se permiten nuevos jugadores (solo reconexiones con sessionId)
        return { canJoin: false, error: "La partida ya comenzó" };
    }

    // Buscar jugador por sessionId (que es player.id)
    findPlayerBySessionId(roomCode: string, sessionId: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        return room.players.find(p => p.id === sessionId) || null;
    }

    // Obtener socketId actual de un jugador
    getSocketId(roomCode: string, sessionId: string): string | null {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        return room.socketMapping.get(sessionId) || null;
    }

    // Actualizar el socketId de un jugador (usado en reconexión)
    updateSocketId(roomCode: string, sessionId: string, newSocketId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        room.socketMapping.set(sessionId, newSocketId);
        console.log(`🔄 Socket actualizado: sessionId ${sessionId} → socketId ${newSocketId}`);
        return true;
    }

    // Verificar si hay un jugador desconectado con este sessionId
    hasDisconnectedPlayer(roomCode: string, sessionId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        return room.disconnectedPlayers.has(sessionId);
    }

    // Reconectar a un jugador existente
    reconnectPlayer(roomCode: string, sessionId: string, newSocketId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        // Buscar el jugador en la lista (ahora se mantiene en room.players aunque esté desconectado)
        const player = room.players.find(p => p.id === sessionId);
        if (!player) return false;

        console.log(`🔄 Reconectando jugador ${player.name} (sessionId: ${sessionId})`);

        // Cancelar el timer de desconexión si existe
        const timer = room.disconnectTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            room.disconnectTimers.delete(sessionId);
            console.log(`⏰ Timer de desconexión cancelado para ${player.name}`);
        }

        // ✅ MARCAR como conectado nuevamente
        player.connected = true;
        player.disconnectedAt = null;

        // Actualizar el socketMapping con el nuevo socket.id
        room.socketMapping.set(sessionId, newSocketId);

        console.log(`✅ ${player.name} reconectado exitosamente (sessionId=${sessionId} persiste, socketId actualizado a ${newSocketId})`);

        // Eliminar de la lista de desconectados si estaba allí
        room.disconnectedPlayers.delete(sessionId);

        return true;
    }

    // Marcar jugador como desconectado temporalmente
    markPlayerDisconnected(roomCode: string, socketId: string, onTimeout: () => void): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        // Buscar el sessionId correspondiente al socketId
        let playerSessionId: string | null = null;
        for (const [sessionId, sid] of room.socketMapping.entries()) {
            if (sid === socketId) {
                playerSessionId = sessionId;
                break;
            }
        }

        if (!playerSessionId) return;

        // Buscar el jugador por sessionId (player.id)
        const playerIndex = room.players.findIndex(p => p.id === playerSessionId);
        if (playerIndex === -1) return;

        const player = room.players[playerIndex];

        // ✅ MARCAR como desconectado, NO eliminar del array
        player.connected = false;
        player.disconnectedAt = new Date();
        
        // Limpiar el socketId actual (ya no está conectado)
        room.socketMapping.delete(playerSessionId);

        console.log(`⏳ Jugador ${player.name} marcado como desconectado (sessionId: ${playerSessionId}). Esperando reconexión (5 minutos)...`);

        // Si la partida ya comenzó, guardar información adicional del jugador
        if (room.state.phase !== 'lobby') {
            const wasSpy = room.state.spies.includes(playerSessionId);

            room.disconnectedPlayers.set(playerSessionId, {
                name: player.name,
                wasSpy,
                sessionId: playerSessionId,
                disconnectTime: Date.now(),
                playerIndex: playerIndex // Guardar el índice original
            });

            // Configurar timeout de 5 minutos (300000 ms)
            const timeout = setTimeout(() => {
                console.log(`⏰ Timeout alcanzado para ${player.name}. Eliminando permanentemente...`);

                // Eliminar del array de spies si era espía (usando sessionId)
                if (wasSpy) {
                    room.state.spies = room.state.spies.filter(spyId => spyId !== playerSessionId);
                    console.log(`🕵️ Eliminado ${playerSessionId} del array de espías`);
                }

                room.disconnectedPlayers.delete(playerSessionId!);
                room.disconnectTimers.delete(playerSessionId!);
                onTimeout();
            }, 300000); // 5 minutos

            room.disconnectTimers.set(playerSessionId, timeout);
        }
        
        // ⭐ EL JUGADOR SE MANTIENE EN room.players, solo está marcado como desconectado
    }

    // Limpiar todos los timers de una sala
    clearRoomTimers(roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        for (const timer of room.disconnectTimers.values()) {
            clearTimeout(timer);
        }
        room.disconnectTimers.clear();
    }

    // Verificar si un jugador es el creador de la sala
    isCreator(roomCode: string, playerId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        return room.creatorId === playerId;
    }

    // Expulsar a un jugador de la sala (solo puede hacerlo el creador)
    kickPlayer(roomCode: string, creatorId: string, targetPlayerId: string): { success: boolean; error?: string } {
        const room = this.rooms.get(roomCode);

        if (!room) {
            return { success: false, error: "La sala no existe" };
        }

        // Verificar que quien expulsa es el creador
        if (room.creatorId !== creatorId) {
            return { success: false, error: "Solo el creador puede expulsar jugadores" };
        }

        // No puede expulsarse a sí mismo
        if (targetPlayerId === creatorId) {
            return { success: false, error: "El creador no puede expulsarse a sí mismo" };
        }

        // Verificar que el jugador objetivo existe en la sala
        const targetPlayer = room.players.find(p => p.id === targetPlayerId);
        if (!targetPlayer) {
            return { success: false, error: "El jugador no está en la sala" };
        }

        console.log(`👢 ${creatorId} expulsando a ${targetPlayer.name} (sessionId: ${targetPlayerId}) de la sala ${roomCode}`);

        // Si hay una partida en curso, limpiar el rol del jugador
        if (room.state.phase !== 'lobby') {
            // Eliminar de spies si era espía (targetPlayerId ES sessionId)
            room.state.spies = room.state.spies.filter(spyId => spyId !== targetPlayerId);

            // Limpiar votaciones pendientes
            delete room.state.teamVotes[targetPlayerId];
            delete room.state.missionActions[targetPlayerId];
            room.state.votedPlayers = room.state.votedPlayers.filter(id => id !== targetPlayerId);
            room.state.playersActed = room.state.playersActed.filter(id => id !== targetPlayerId);

            // Eliminar del equipo propuesto si estaba
            room.state.proposedTeam = room.state.proposedTeam.filter(id => id !== targetPlayerId);

            console.log(`🧹 Limpiado datos de partida para sessionId: ${targetPlayerId}`);
        }

        // Eliminar al jugador
        room.players = room.players.filter(p => p.id !== targetPlayerId);

        // Limpiar timer y socketMapping si existen
        const timer = room.disconnectTimers.get(targetPlayerId);
        if (timer) {
            clearTimeout(timer);
            room.disconnectTimers.delete(targetPlayerId);
        }
        room.disconnectedPlayers.delete(targetPlayerId);
        room.socketMapping.delete(targetPlayerId);

        console.log(`✅ Jugador ${targetPlayer.name} expulsado exitosamente`);
        return { success: true };
    }

    // Transferir el rol de creador a otro jugador (se llama automáticamente si el creador se va)
    transferCreator(roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room || room.players.length === 0) return;

        // El primer jugador en la lista se convierte en el nuevo creador
        const newCreator = room.players[0];
        const oldCreatorId = room.creatorId;
        room.creatorId = newCreator.id;

        console.log(`👑 Rol de creador transferido de ${oldCreatorId} a ${newCreator.name} (${newCreator.id})`);
    }
}

export const RoomManager = new RoomManagerClass();
