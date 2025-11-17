// src/game/roomManager.ts

import { Room } from "./types";
import { generateRoomCode } from "../utils/id";

class RoomManagerClass {
    private rooms: Map<string, Room> = new Map();

    createRoom() {
        const code = generateRoomCode();

        const room: Room = {
            code,
            players: [],
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
            disconnectTimers: new Map()
        };

        this.rooms.set(code, room);
        return room;
    }

    getRoom(code: string) {
        return this.rooms.get(code) || null;
    }

    addPlayer(roomCode: string, id: string, name: string, sessionId?: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        // Generar sessionId si no se proporciona
        const finalSessionId = sessionId || this.generateSessionId();

        room.players.push({ id, name, sessionId: finalSessionId });

        return finalSessionId;
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    removePlayer(roomCode: string, playerId: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        // Eliminar el jugador de la lista
        room.players = room.players.filter(p => p.id !== playerId);

        // Eliminar del array de spies si era espía
        room.state.spies = room.state.spies.filter(spyId => spyId !== playerId);

        // Si la sala queda vacía, eliminarla
        if (room.players.length === 0) {
            this.clearRoomTimers(roomCode);
            this.rooms.delete(roomCode);
            return null;
        }

        return room;
    }

    findRoomByPlayerId(playerId: string): Room | null {
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.id === playerId)) {
                return room;
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
            players: room.players,
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

    canJoinRoom(roomCode: string): { canJoin: boolean; error?: string; replacingPlayer?: boolean } {
        const room = this.rooms.get(roomCode);
        if (!room) return { canJoin: false, error: "La sala no existe" };

        // Si la partida no ha comenzado, siempre puede unirse
        if (room.state.phase === "lobby") {
            return { canJoin: true, replacingPlayer: false };
        }

        // Si la partida ya comenzó, verificar si hay espacio
        if (!room.maxPlayers) {
            // No debería pasar, pero por seguridad
            return { canJoin: false, error: "Error interno: maxPlayers no definido" };
        }

        // Si la sala está llena (tiene el número original de jugadores)
        if (room.players.length >= room.maxPlayers) {
            return { canJoin: false, error: "La sala está llena" };
        }

        // Hay espacio (alguien se desconectó)
        return { canJoin: true, replacingPlayer: true };
    }

    getReplacementRole(roomCode: string): boolean | null {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        // Obtener el primer jugador desconectado (FIFO)
        const disconnectedEntries = Array.from(room.disconnectedPlayers.values());
        if (disconnectedEntries.length === 0) return null;

        // Retornar si era espía o no
        return disconnectedEntries[0].wasSpy;
    }

    assignReplacementPlayer(roomCode: string, newPlayerId: string): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        // Obtener el primer jugador desconectado
        const disconnectedEntry = Array.from(room.disconnectedPlayers.entries())[0];
        if (!disconnectedEntry) return;

        const [oldSessionId, playerInfo] = disconnectedEntry;

        // Si era espía, reemplazar en el array de spies
        if (playerInfo.wasSpy) {
            const spyIndex = room.state.spies.indexOf(oldSessionId);
            if (spyIndex !== -1) {
                room.state.spies[spyIndex] = newPlayerId;
            }
        }

        // Eliminar de la lista de desconectados
        room.disconnectedPlayers.delete(oldSessionId);
    }

    // Buscar jugador por sessionId
    findPlayerBySessionId(roomCode: string, sessionId: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        return room.players.find(p => p.sessionId === sessionId) || null;
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

        // Buscar si hay un jugador desconectado con este sessionId
        const disconnectedPlayer = room.disconnectedPlayers.get(sessionId);
        if (!disconnectedPlayer) return false;

        console.log(`🔄 Reconectando jugador ${disconnectedPlayer.name} (sessionId: ${sessionId})`);

        // Cancelar el timer de desconexión si existe
        const timer = room.disconnectTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            room.disconnectTimers.delete(sessionId);
            console.log(`⏰ Timer de desconexión cancelado para ${disconnectedPlayer.name}`);
        }

        // Restaurar el jugador con el nuevo socketId
        room.players.push({
            id: newSocketId,
            name: disconnectedPlayer.name,
            sessionId: sessionId
        });

        // Si era espía, reemplazar el socketId antiguo con el nuevo en el array de spies
        if (disconnectedPlayer.wasSpy) {
            // Buscar si hay algún socketId antiguo de este jugador (no debería estar en players)
            const oldSpyIds = room.state.spies.filter(spyId => {
                // Un spyId es "antiguo" si no corresponde a ningún jugador activo
                return !room.players.some(p => p.id === spyId);
            });

            // Eliminar el primer socketId antiguo encontrado (asumimos que es el del jugador reconectado)
            if (oldSpyIds.length > 0) {
                const oldSocketId = oldSpyIds[0];
                room.state.spies = room.state.spies.filter(spyId => spyId !== oldSocketId);
                console.log(`🕵️ Eliminado socketId antiguo ${oldSocketId} del array de espías`);
            }

            // Agregar el nuevo socketId
            if (!room.state.spies.includes(newSocketId)) {
                room.state.spies.push(newSocketId);
                console.log(`🕵️ Agregado ${newSocketId} al array de espías`);
            }
        }

        // Eliminar de la lista de desconectados
        room.disconnectedPlayers.delete(sessionId);

        console.log(`✅ Jugador ${disconnectedPlayer.name} reconectado exitosamente`);
        return true;
    }

    // Marcar jugador como desconectado temporalmente
    markPlayerDisconnected(roomCode: string, socketId: string, onTimeout: () => void): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socketId);
        if (!player || !player.sessionId) return;

        // Si la partida ya comenzó, guardar información del jugador
        if (room.state.phase !== 'lobby') {
            const wasSpy = room.state.spies.includes(socketId);

            room.disconnectedPlayers.set(player.sessionId, {
                name: player.name,
                wasSpy,
                sessionId: player.sessionId,
                disconnectTime: Date.now()
            });

            console.log(`⏳ Jugador ${player.name} desconectado temporalmente. Esperando reconexión (30s)...`);

            // Configurar timeout de 30 segundos
            const timeout = setTimeout(() => {
                console.log(`⏰ Timeout alcanzado para ${player.name}. Eliminando permanentemente...`);

                // Eliminar del array de spies si era espía
                if (wasSpy) {
                    room.state.spies = room.state.spies.filter(spyId => spyId !== socketId);
                }

                room.disconnectedPlayers.delete(player.sessionId!);
                room.disconnectTimers.delete(player.sessionId!);
                onTimeout();
            }, 30000); // 30 segundos

            room.disconnectTimers.set(player.sessionId, timeout);
        }

        // Remover el jugador de la lista activa (pero mantener en spies si era espía)
        room.players = room.players.filter(p => p.id !== socketId);
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
}

export const RoomManager = new RoomManagerClass();
