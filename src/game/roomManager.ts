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
                rejectedTeamsInRow: 0
            },
            disconnectedPlayers: new Map()
        };

        this.rooms.set(code, room);
        return room;
    }

    getRoom(code: string) {
        return this.rooms.get(code) || null;
    }

    addPlayer(roomCode: string, id: string, name: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.players.push({ id, name });
    }

    removePlayer(roomCode: string, playerId: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        // Eliminar el jugador de la lista
        room.players = room.players.filter(p => p.id !== playerId);

        // Si la sala queda vacía, eliminarla
        if (room.players.length === 0) {
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
            rejectedTeamsInRow: state.rejectedTeamsInRow
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

        const [oldPlayerId, playerInfo] = disconnectedEntry;

        // Si era espía, reemplazar en el array de spies
        if (playerInfo.wasSpy) {
            const spyIndex = room.state.spies.indexOf(oldPlayerId);
            if (spyIndex !== -1) {
                room.state.spies[spyIndex] = newPlayerId;
            }
        }

        // Eliminar de la lista de desconectados
        room.disconnectedPlayers.delete(oldPlayerId);
    }
}

export const RoomManager = new RoomManagerClass();
