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
                proposedTeam: [],
                teamVotes: {},
                missionActions: {},
                results: [],
                rejectedTeamsInRow: 0
            }
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
            proposedTeam: state.proposedTeam,
            results: state.results,
            rejectedTeamsInRow: state.rejectedTeamsInRow
            // roles ocultos no se envían aquí
        };
    }
}

export const RoomManager = new RoomManagerClass();
