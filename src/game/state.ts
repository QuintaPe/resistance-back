// src/game/state.ts

import { RoomManager } from "./roomManager";
import { Player, Game } from "./types";
import { shuffle } from "../utils/shuffle";
import { getTeamSizes, getNumSpies, getFailsRequired } from "./rules";

class GameStateClass {
    // Obtener el siguiente líder conectado (salta jugadores desconectados)
    private getNextConnectedLeaderIndex(players: Player[], currentIndex: number): number {
        const connectedPlayers = players.filter(p => p.connected);
        if (connectedPlayers.length === 0) return 0; // Fallback si no hay jugadores conectados
        
        let nextIndex = (currentIndex + 1) % players.length;
        let attempts = 0;
        
        // Buscar el siguiente jugador conectado (con límite para evitar loops infinitos)
        while (!players[nextIndex].connected && attempts < players.length) {
            nextIndex = (nextIndex + 1) % players.length;
            attempts++;
        }
        
        return nextIndex;
    }
    start(roomCode: string, initialLeaderIndex: number = 0) {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        const players = room.players;
        const n = players.length;

        const teamSizes = getTeamSizes(n);
        const numSpies = getNumSpies(n);
        const failsRequired = getFailsRequired(n);

        const shuffled = shuffle([...players]);
        // Usar sessionId para los espías (persiste entre reconexiones)
        // player.id ES sessionId
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

        // Establecer el número máximo de jugadores al inicio
        room.maxPlayers = n;
    }

    restart(roomCode: string) {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        // Obtener el índice del líder actual antes de reiniciar
        const currentLeaderIndex = room.state.leaderIndex;

        // Calcular el índice del siguiente líder
        const nextLeaderIndex = (currentLeaderIndex + 1) % room.players.length;

        // Reiniciar el juego con el nuevo líder
        this.start(roomCode, nextLeaderIndex);

        console.log(`🔄 Partida reiniciada. Nuevo líder: ${room.players[nextLeaderIndex].name} (índice ${nextLeaderIndex})`);
    }

    returnToLobby(roomCode: string) {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        // Resetear el estado del juego a lobby
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

        // Limpiar el maxPlayers para permitir que entren más jugadores
        room.maxPlayers = undefined;

        // Limpiar jugadores desconectados
        room.disconnectedPlayers.clear();

        console.log(`🏠 Sala ${roomCode} ha vuelto al lobby. Jugadores actuales: ${room.players.length}`);
    }

    getPublicState(roomCode: string) {
        return RoomManager.getPublicState(roomCode);
    }

    proposeTeam(roomCode: string, leaderSessionId: string, teamSessionIds: string[]) {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        const state = room.state;
        const leader = room.players[state.leaderIndex];

        // Verificar que el líder esté conectado
        if (!leader.connected) {
            // Si el líder actual no está conectado, pasar al siguiente
            state.leaderIndex = this.getNextConnectedLeaderIndex(room.players, state.leaderIndex);
            return;
        }

        // leader.id ES sessionId
        if (leader.id !== leaderSessionId) return;
        if (state.phase !== "proposeTeam") return;

        state.proposedTeam = teamSessionIds;
        state.teamVotes = {};
        state.votedPlayers = []; // Limpiar para la nueva votación
        state.phase = "voteTeam";
    }

    voteTeam(roomCode: string, playerSessionId: string, vote: "approve" | "reject") {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        const state = room.state;
        if (state.phase !== "voteTeam") return;

        // ✅ Verificar que el jugador esté conectado
        const player = room.players.find(p => p.id === playerSessionId);
        if (!player || !player.connected) return;

        state.teamVotes[playerSessionId] = vote;

        // Agregar el jugador a votedPlayers si no está ya
        if (!state.votedPlayers.includes(playerSessionId)) {
            state.votedPlayers.push(playerSessionId);
        }

        // Comprobar si todos los jugadores CONECTADOS votaron
        const connectedPlayers = room.players.filter(p => p.connected);
        const allVoted = connectedPlayers.every((p) => state.teamVotes[p.id]);

        if (!allVoted) return;

        const approvals = Object.values(state.teamVotes).filter((v) => v === "approve").length;
        const passed = approvals > connectedPlayers.length / 2;

        if (!passed) {
            state.rejectedTeamsInRow += 1;

            if (state.rejectedTeamsInRow >= 5) {
                state.phase = "reveal";
                state.votedPlayers = []; // Limpiar
                return;
            }

            // Pasar al siguiente líder conectado
            state.leaderIndex = this.getNextConnectedLeaderIndex(room.players, state.leaderIndex);
            state.phase = "proposeTeam";
            state.votedPlayers = []; // Limpiar para la próxima votación
            return;
        }

        // Equipo aprobado
        state.phase = "mission";
        state.missionActions = {};
        state.votedPlayers = []; // Limpiar
        state.playersActed = []; // Limpiar para la nueva misión
    }

    performMissionAction(roomCode: string, playerSessionId: string, action: "success" | "fail") {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        const state = room.state;
        if (state.phase !== "mission") return;
        if (!state.proposedTeam.includes(playerSessionId)) return;

        // ✅ Verificar que el jugador esté conectado
        const player = room.players.find(p => p.id === playerSessionId);
        if (!player || !player.connected) return;

        const isSpy = state.spies.includes(playerSessionId);
        if (action === "fail" && !isSpy) return;

        state.missionActions[playerSessionId] = action;

        // Agregar el jugador a playersActed si no está ya
        if (!state.playersActed.includes(playerSessionId)) {
            state.playersActed.push(playerSessionId);
        }

        const allSubmitted = state.proposedTeam.every((id) => state.missionActions[id]);

        if (!allSubmitted) return;

        // Contar fracasos
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
        state.playersActed = []; // Limpiar para la próxima misión
        state.rejectedTeamsInRow = 0;

        if (resWins || spyWins || state.currentMission >= 5) {
            state.phase = "reveal";
            return;
        }

        // Pasar al siguiente líder conectado
        state.leaderIndex = this.getNextConnectedLeaderIndex(room.players, state.leaderIndex);
        state.phase = "proposeTeam";
    }
}

export const GameState = new GameStateClass();
