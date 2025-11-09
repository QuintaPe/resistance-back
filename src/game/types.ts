// src/game/types.ts

export type Player = {
    id: string;
    name: string;
};

export type Room = {
    code: string;
    players: Player[];
    state: Game;            // estado de la partida
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
