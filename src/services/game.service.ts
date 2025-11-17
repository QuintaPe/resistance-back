// src/services/game.service.ts

import { roomService } from './room.service';
import { Player } from '../core/domain';
import { shuffleArray } from '../utils/array/shuffle.util';
import { getTeamSizes, getNumSpies, getFailsRequired } from '../core/rules/game.rules';

/**
 * Servicio para gestionar la lógica del juego
 * Responsable del flujo del juego, votaciones, misiones y victoria
 */
class GameService {
    /**
     * Obtiene el siguiente líder conectado (salta jugadores desconectados)
     */
    private getNextConnectedLeaderIndex(players: Player[], currentIndex: number): number {
        const connectedPlayers = players.filter(p => p.connected);
        if (connectedPlayers.length === 0) return 0;

        let nextIndex = (currentIndex + 1) % players.length;
        let attempts = 0;

        while (!players[nextIndex].connected && attempts < players.length) {
            nextIndex = (nextIndex + 1) % players.length;
            attempts++;
        }

        return nextIndex;
    }

    /**
     * Inicia una nueva partida
     */
    start(roomCode: string, initialLeaderIndex: number = 0): void {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const players = room.players;
        const n = players.length;

        const teamSizes = getTeamSizes(n);
        const numSpies = getNumSpies(n);
        const failsRequired = getFailsRequired(n);

        const shuffled = shuffleArray([...players]);
        const spies = shuffled.slice(0, numSpies).map((p: Player) => p.id);

        console.log('🕵️ Espías asignados (sessionIds):', spies);

        room.state = {
            phase: "proposeTeam",
            leaderIndex: initialLeaderIndex,
            spies,
            currentMission: 0,
            teamSizePerMission: teamSizes,
            failsRequired,
            proposedTeam: [],
            teamVotes: {},
            missionActions: {},
            results: [],
            rejectedTeamsInRow: 0,
            votedPlayers: [],
            playersActed: []
        };

        room.maxPlayers = n;
    }

    /**
     * Reinicia la partida con nuevos roles
     */
    restart(roomCode: string): void {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const currentLeaderIndex = room.state.leaderIndex;
        const nextLeaderIndex = (currentLeaderIndex + 1) % room.players.length;

        this.start(roomCode, nextLeaderIndex);

        console.log(`🔄 Partida reiniciada. Nuevo líder: ${room.players[nextLeaderIndex].name} (índice ${nextLeaderIndex})`);
    }

    /**
     * Vuelve al lobby y resetea el estado del juego
     */
    returnToLobby(roomCode: string): void {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        room.state = {
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
        };

        room.maxPlayers = undefined;
        room.disconnectedPlayers.clear();

        console.log(`🏠 Sala ${roomCode} ha vuelto al lobby. Jugadores actuales: ${room.players.length}`);
    }

    /**
     * Obtiene el estado público del juego
     */
    getPublicState(roomCode: string) {
        return roomService.getPublicState(roomCode);
    }

    /**
     * Propone un equipo para una misión
     */
    proposeTeam(roomCode: string, leaderSessionId: string, teamSessionIds: string[]): void {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const state = room.state;
        const leader = room.players[state.leaderIndex];

        if (!leader.connected) {
            state.leaderIndex = this.getNextConnectedLeaderIndex(room.players, state.leaderIndex);
            return;
        }

        if (leader.id !== leaderSessionId) return;
        if (state.phase !== "proposeTeam") return;

        state.proposedTeam = teamSessionIds;
        state.teamVotes = {};
        state.votedPlayers = [];
        state.phase = "voteTeam";
    }

    /**
     * Registra el voto de un jugador sobre el equipo propuesto
     */
    voteTeam(roomCode: string, playerSessionId: string, vote: "approve" | "reject"): void {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const state = room.state;
        if (state.phase !== "voteTeam") return;

        const player = room.players.find(p => p.id === playerSessionId);
        if (!player || !player.connected) return;

        state.teamVotes[playerSessionId] = vote;

        if (!state.votedPlayers.includes(playerSessionId)) {
            state.votedPlayers.push(playerSessionId);
        }

        const connectedPlayers = room.players.filter(p => p.connected);
        const allVoted = connectedPlayers.every((p) => state.teamVotes[p.id]);

        if (!allVoted) return;

        const approvals = Object.values(state.teamVotes).filter((v) => v === "approve").length;
        const passed = approvals > connectedPlayers.length / 2;

        if (!passed) {
            state.rejectedTeamsInRow += 1;

            if (state.rejectedTeamsInRow >= 5) {
                state.phase = "reveal";
                state.votedPlayers = [];
                return;
            }

            state.leaderIndex = this.getNextConnectedLeaderIndex(room.players, state.leaderIndex);
            state.phase = "proposeTeam";
            state.votedPlayers = [];
            return;
        }

        state.phase = "mission";
        state.missionActions = {};
        state.votedPlayers = [];
        state.playersActed = [];
    }

    /**
     * Registra la acción de un jugador en una misión
     */
    performMissionAction(roomCode: string, playerSessionId: string, action: "success" | "fail"): void {
        const room = roomService.getRoom(roomCode);
        if (!room) return;

        const state = room.state;
        if (state.phase !== "mission") return;
        if (!state.proposedTeam.includes(playerSessionId)) return;

        const player = room.players.find(p => p.id === playerSessionId);
        if (!player || !player.connected) return;

        const isSpy = state.spies.includes(playerSessionId);
        if (action === "fail" && !isSpy) return;

        state.missionActions[playerSessionId] = action;

        if (!state.playersActed.includes(playerSessionId)) {
            state.playersActed.push(playerSessionId);
        }

        const allSubmitted = state.proposedTeam.every((id) => state.missionActions[id]);

        if (!allSubmitted) return;

        const fails = Object.values(state.missionActions).filter((a) => a === "fail").length;
        const failsNeeded = state.failsRequired[state.currentMission];
        const passed = fails < failsNeeded;

        state.results.push({
            team: [...state.proposedTeam],
            fails,
            passed
        });

        const resWins = state.results.filter((r) => r.passed).length >= 3;
        const spyWins = state.results.filter((r) => !r.passed).length >= 3;

        state.currentMission += 1;
        state.proposedTeam = [];
        state.teamVotes = {};
        state.missionActions = {};
        state.playersActed = [];
        state.rejectedTeamsInRow = 0;

        if (resWins || spyWins || state.currentMission >= 5) {
            state.phase = "reveal";
            return;
        }

        state.leaderIndex = this.getNextConnectedLeaderIndex(room.players, state.leaderIndex);
        state.phase = "proposeTeam";
    }
}

export const gameService = new GameService();

