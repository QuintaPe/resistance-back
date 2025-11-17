// src/game/types.ts

export type Player = {
    id: string;         // sessionId - identificador persistente del jugador
    sessionId?: string; // alias explícito para compatibilidad (apunta al mismo valor que id)
    name: string;
    connected: boolean; // ⭐ indica si el jugador está conectado actualmente
    disconnectedAt: Date | null; // ⭐ timestamp de cuándo se desconectó
};

export type DisconnectedPlayer = {
    name: string;
    wasSpy: boolean;
    sessionId: string;
    disconnectTime: number; // timestamp
    playerIndex: number; // índice original del jugador en el array
};

export type Room = {
    code: string;
    players: Player[];
    creatorId: string;      // sessionId del jugador que creó la sala (tiene permisos especiales)
    state: Game;            // estado de la partida
    maxPlayers?: number;    // número de jugadores al inicio (solo se setea cuando empieza la partida)
    disconnectedPlayers: Map<string, DisconnectedPlayer>; // sessionId -> info del jugador desconectado
    disconnectTimers: Map<string, NodeJS.Timeout>; // sessionId -> timeout para eliminar al jugador
    socketMapping: Map<string, string>; // sessionId -> socket.id actual (para emitir eventos)
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
    votedPlayers: string[];             // ids de jugadores que ya votaron
    playersActed: string[];             // ids de jugadores que ya actuaron en la misión
};

export type MissionResult = {
    team: string[];
    fails: number;
    passed: boolean;
};
