// src/services/room.service.ts

import { Room } from '../core/domain';
import { generateRoomCode } from '../utils/generators/id.generator';

/**
 * Servicio para gestionar salas de juego
 * Responsable de la creación, gestión y eliminación de salas
 */
class RoomService {
    private rooms: Map<string, Room> = new Map();

    /**
     * Crea una nueva sala con un código único
     */
    createRoom(creatorSessionId: string): Room {
        const code = generateRoomCode();

        const room: Room = {
            code,
            players: [],
            creatorId: creatorSessionId,
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
            socketMapping: new Map()
        };

        this.rooms.set(code, room);
        console.log(`🏠 Sala ${code} creada por ${creatorSessionId} (sessionId)`);
        return room;
    }

    /**
     * Obtiene una sala por su código
     */
    getRoom(code: string): Room | null {
        return this.rooms.get(code) || null;
    }

    /**
     * Agrega un jugador a una sala
     */
    addPlayer(roomCode: string, socketId: string, name: string, sessionId?: string): string | undefined {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const finalSessionId = sessionId || this.generateSessionId();

        room.players.push({
            id: finalSessionId,
            sessionId: finalSessionId,
            name,
            connected: true,
            disconnectedAt: null
        });

        room.socketMapping.set(finalSessionId, socketId);

        console.log(`✅ Jugador agregado: ${name} (sessionId: ${finalSessionId}, socketId: ${socketId})`);

        return finalSessionId;
    }

    /**
     * Genera un ID de sesión único para un jugador
     */
    generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Elimina un jugador de una sala
     */
    removePlayer(roomCode: string, sessionId: string): Room | null {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        room.players = room.players.filter(p => p.id !== sessionId);
        room.state.spies = room.state.spies.filter(spyId => spyId !== sessionId);
        room.socketMapping.delete(sessionId);

        console.log(`🗑️ Jugador eliminado (sessionId: ${sessionId})`);

        if (room.players.length === 0) {
            this.clearRoomTimers(roomCode);
            this.rooms.delete(roomCode);
            return null;
        }

        return room;
    }

    /**
     * Busca una sala por ID de jugador (sessionId)
     */
    findRoomByPlayerId(playerId: string): Room | null {
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.id === playerId)) {
                return room;
            }
        }
        return null;
    }

    /**
     * Busca una sala por socket ID actual
     */
    findRoomBySocketId(socketId: string): Room | null {
        for (const room of this.rooms.values()) {
            if (room.socketMapping.has(socketId) ||
                Array.from(room.socketMapping.values()).includes(socketId)) {
                return room;
            }
        }
        return null;
    }

    /**
     * Obtiene el sessionId desde un socketId
     */
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

    /**
     * Obtiene el estado público de una sala (sin información sensible)
     */
    getPublicState(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        const { state } = room;

        return {
            code: room.code,
            players: room.players.map(p => ({
                id: p.id,
                sessionId: p.sessionId,
                name: p.name
            })),
            creatorId: room.creatorId,
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
        };
    }

    /**
     * Verifica si un jugador puede unirse a una sala
     */
    canJoinRoom(roomCode: string): { canJoin: boolean; error?: string } {
        const room = this.rooms.get(roomCode);
        if (!room) return { canJoin: false, error: "La sala no existe" };

        if (room.state.phase === "lobby") {
            return { canJoin: true };
        }

        return { canJoin: false, error: "La partida ya comenzó" };
    }

    /**
     * Busca un jugador por sessionId
     */
    findPlayerBySessionId(roomCode: string, sessionId: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        return room.players.find(p => p.id === sessionId) || null;
    }

    /**
     * Obtiene el socketId actual de un jugador
     */
    getSocketId(roomCode: string, sessionId: string): string | null {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        return room.socketMapping.get(sessionId) || null;
    }

    /**
     * Actualiza el socketId de un jugador (usado en reconexión)
     */
    updateSocketId(roomCode: string, sessionId: string, newSocketId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        room.socketMapping.set(sessionId, newSocketId);
        console.log(`🔄 Socket actualizado: sessionId ${sessionId} → socketId ${newSocketId}`);
        return true;
    }

    /**
     * Verifica si hay un jugador desconectado con este sessionId
     */
    hasDisconnectedPlayer(roomCode: string, sessionId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        return room.disconnectedPlayers.has(sessionId);
    }

    /**
     * Reconecta a un jugador existente
     */
    reconnectPlayer(roomCode: string, sessionId: string, newSocketId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        const player = room.players.find(p => p.id === sessionId);
        if (!player) return false;

        console.log(`🔄 Reconectando jugador ${player.name} (sessionId: ${sessionId})`);

        const timer = room.disconnectTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            room.disconnectTimers.delete(sessionId);
            console.log(`⏰ Timer de desconexión cancelado para ${player.name}`);
        }

        player.connected = true;
        player.disconnectedAt = null;

        room.socketMapping.set(sessionId, newSocketId);

        console.log(`✅ ${player.name} reconectado exitosamente (sessionId=${sessionId} persiste, socketId actualizado a ${newSocketId})`);

        room.disconnectedPlayers.delete(sessionId);

        return true;
    }

    /**
     * Marca un jugador como desconectado temporalmente
     */
    markPlayerDisconnected(roomCode: string, socketId: string, onTimeout: () => void): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        let playerSessionId: string | null = null;
        for (const [sessionId, sid] of room.socketMapping.entries()) {
            if (sid === socketId) {
                playerSessionId = sessionId;
                break;
            }
        }

        if (!playerSessionId) return;

        const playerIndex = room.players.findIndex(p => p.id === playerSessionId);
        if (playerIndex === -1) return;

        const player = room.players[playerIndex];

        player.connected = false;
        player.disconnectedAt = new Date();

        room.socketMapping.delete(playerSessionId);

        console.log(`⏳ Jugador ${player.name} marcado como desconectado (sessionId: ${playerSessionId}). Esperando reconexión (5 minutos)...`);

        if (room.state.phase !== 'lobby') {
            const wasSpy = room.state.spies.includes(playerSessionId);

            room.disconnectedPlayers.set(playerSessionId, {
                name: player.name,
                wasSpy,
                sessionId: playerSessionId,
                disconnectTime: Date.now(),
                playerIndex: playerIndex
            });

            const timeout = setTimeout(() => {
                console.log(`⏰ Timeout alcanzado para ${player.name}. Eliminando permanentemente...`);

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
    }

    /**
     * Limpia todos los timers de una sala
     */
    clearRoomTimers(roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        for (const timer of room.disconnectTimers.values()) {
            clearTimeout(timer);
        }
        room.disconnectTimers.clear();
    }

    /**
     * Verifica si un jugador es el creador de la sala
     */
    isCreator(roomCode: string, playerId: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room) return false;

        return room.creatorId === playerId;
    }

    /**
     * Expulsa a un jugador de la sala (solo puede hacerlo el creador)
     */
    kickPlayer(roomCode: string, creatorId: string, targetPlayerId: string): { success: boolean; error?: string } {
        const room = this.rooms.get(roomCode);

        if (!room) {
            return { success: false, error: "La sala no existe" };
        }

        if (room.creatorId !== creatorId) {
            return { success: false, error: "Solo el creador puede expulsar jugadores" };
        }

        if (targetPlayerId === creatorId) {
            return { success: false, error: "El creador no puede expulsarse a sí mismo" };
        }

        const targetPlayer = room.players.find(p => p.id === targetPlayerId);
        if (!targetPlayer) {
            return { success: false, error: "El jugador no está en la sala" };
        }

        console.log(`👢 ${creatorId} expulsando a ${targetPlayer.name} (sessionId: ${targetPlayerId}) de la sala ${roomCode}`);

        if (room.state.phase !== 'lobby') {
            room.state.spies = room.state.spies.filter(spyId => spyId !== targetPlayerId);
            delete room.state.teamVotes[targetPlayerId];
            delete room.state.missionActions[targetPlayerId];
            room.state.votedPlayers = room.state.votedPlayers.filter(id => id !== targetPlayerId);
            room.state.playersActed = room.state.playersActed.filter(id => id !== targetPlayerId);
            room.state.proposedTeam = room.state.proposedTeam.filter(id => id !== targetPlayerId);

            console.log(`🧹 Limpiado datos de partida para sessionId: ${targetPlayerId}`);
        }

        room.players = room.players.filter(p => p.id !== targetPlayerId);

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

    /**
     * Transfiere el rol de creador a otro jugador
     */
    transferCreator(roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room || room.players.length === 0) return;

        const newCreator = room.players[0];
        const oldCreatorId = room.creatorId;
        room.creatorId = newCreator.id;

        console.log(`👑 Rol de creador transferido de ${oldCreatorId} a ${newCreator.name} (${newCreator.id})`);
    }
}

export const roomService = new RoomService();

