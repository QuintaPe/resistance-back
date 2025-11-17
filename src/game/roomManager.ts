// src/game/roomManager.ts

import { Room } from "./types";
import { generateRoomCode } from "../utils/id";

class RoomManagerClass {
    private rooms: Map<string, Room> = new Map();

    createRoom(creatorId: string) {
        const code = generateRoomCode();

        const room: Room = {
            code,
            players: [],
            creatorId: creatorId,  // Guardar el ID del creador
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
        console.log(`🏠 Sala ${code} creada por ${creatorId}`);
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

        // Buscar el jugador ANTES de eliminarlo
        const player = room.players.find(p => p.id === playerId);

        // Eliminar el jugador de la lista
        room.players = room.players.filter(p => p.id !== playerId);

        // Eliminar del array de spies si era espía (usando sessionId)
        if (player && player.sessionId) {
            room.state.spies = room.state.spies.filter(spyId => spyId !== player.sessionId);
        }

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
        console.log(`  -> Índice original: ${disconnectedPlayer.playerIndex}, Socket nuevo: ${newSocketId}`);

        // Cancelar el timer de desconexión si existe
        const timer = room.disconnectTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            room.disconnectTimers.delete(sessionId);
            console.log(`⏰ Timer de desconexión cancelado para ${disconnectedPlayer.name}`);
        }

        // Restaurar el jugador en su posición original con el nuevo socketId
        // ✨ El sessionId se mantiene igual, por lo que no necesitamos actualizar nada más
        room.players.splice(disconnectedPlayer.playerIndex, 0, {
            id: newSocketId,
            name: disconnectedPlayer.name,
            sessionId: sessionId
        });

        console.log(`📍 Jugador restaurado en índice ${disconnectedPlayer.playerIndex}`);
        console.log(`✅ Jugador ${disconnectedPlayer.name} reconectado exitosamente (el sessionId persiste, no se requiere actualizar roles)`);

        // Eliminar de la lista de desconectados
        room.disconnectedPlayers.delete(sessionId);

        return true;
    }

    // Marcar jugador como desconectado temporalmente
    markPlayerDisconnected(roomCode: string, socketId: string, onTimeout: () => void): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.id === socketId);
        if (playerIndex === -1) return;

        const player = room.players[playerIndex];
        if (!player.sessionId) return;

        // Si la partida ya comenzó, guardar información del jugador
        if (room.state.phase !== 'lobby') {
            const wasSpy = room.state.spies.includes(player.sessionId);

            room.disconnectedPlayers.set(player.sessionId, {
                name: player.name,
                wasSpy,
                sessionId: player.sessionId,
                disconnectTime: Date.now(),
                playerIndex: playerIndex, // Guardar el índice original
                oldSocketId: socketId // Para referencia (no se usa para spies)
            });

            console.log(`⏳ Jugador ${player.name} desconectado temporalmente (índice: ${playerIndex}, sessionId: ${player.sessionId}). Esperando reconexión (30s)...`);

            // Configurar timeout de 30 segundos
            const timeout = setTimeout(() => {
                console.log(`⏰ Timeout alcanzado para ${player.name}. Eliminando permanentemente...`);

                // Eliminar del array de spies si era espía (usando sessionId)
                if (wasSpy) {
                    room.state.spies = room.state.spies.filter(spyId => spyId !== player.sessionId);
                    console.log(`🕵️ Eliminado ${player.sessionId} del array de espías`);
                }

                room.disconnectedPlayers.delete(player.sessionId!);
                room.disconnectTimers.delete(player.sessionId!);
                onTimeout();
            }, 30000); // 30 segundos

            room.disconnectTimers.set(player.sessionId, timeout);
        }

        // Remover el jugador de la lista activa
        room.players.splice(playerIndex, 1);
        console.log(`📤 Jugador removido del índice ${playerIndex}`);
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

        console.log(`👢 ${creatorId} expulsando a ${targetPlayer.name} (${targetPlayerId}) de la sala ${roomCode}`);

        // Si hay una partida en curso, limpiar el rol del jugador (usando sessionId)
        if (room.state.phase !== 'lobby' && targetPlayer.sessionId) {
            const sessionId = targetPlayer.sessionId;

            // Eliminar de spies si era espía (usando sessionId)
            room.state.spies = room.state.spies.filter(spyId => spyId !== sessionId);

            // Limpiar votaciones pendientes (usando sessionId)
            delete room.state.teamVotes[sessionId];
            delete room.state.missionActions[sessionId];
            room.state.votedPlayers = room.state.votedPlayers.filter(id => id !== sessionId);
            room.state.playersActed = room.state.playersActed.filter(id => id !== sessionId);

            // Eliminar del equipo propuesto si estaba (usando sessionId)
            room.state.proposedTeam = room.state.proposedTeam.filter(id => id !== sessionId);

            console.log(`🧹 Limpiado datos de partida para sessionId: ${sessionId}`);
        }

        // Eliminar al jugador
        room.players = room.players.filter(p => p.id !== targetPlayerId);

        // Limpiar timer si existe
        if (targetPlayer.sessionId) {
            const timer = room.disconnectTimers.get(targetPlayer.sessionId);
            if (timer) {
                clearTimeout(timer);
                room.disconnectTimers.delete(targetPlayer.sessionId);
            }
            room.disconnectedPlayers.delete(targetPlayer.sessionId);
        }

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
