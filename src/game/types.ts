// src/game/types.ts

export type Player = {
    id: string;
    name: string;
};

export type DisconnectedPlayer = {
    name: string;
    wasSpy: boolean;
};

export type Room = {
    code: string;
    players: Player[];
    state: Game;            // estado de la partida
    maxPlayers?: number;    // número de jugadores al inicio (solo se setea cuando empieza la partida)
    disconnectedPlayers: Map<string, DisconnectedPlayer>; // id -> info del jugador desconectado
};

export type GamePhase =
    | "lobby"
    | "proposeTeam"
    | "voteTeam"
    | "mission"
    | "reveal";

export type Game = {
    phase: GamePhase;
    leaderIndex: number;
    spies: string[];                    // ids de espías
    currentMission: number;             // 0..4
    teamSizePerMission: number[];
    failsRequired: number[];            // fracasos necesarios por misión
    proposedTeam: string[];             // ids
    teamVotes: Record<string, "approve" | "reject">;
    missionActions: Record<string, "success" | "fail">;
    results: MissionResult[];
    rejectedTeamsInRow: number;
};

export type MissionResult = {
    team: string[];
    fails: number;
    passed: boolean;
};
