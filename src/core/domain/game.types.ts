// src/core/domain/game.types.ts

/**
 * Fases posibles del juego
 */
export type GamePhase =
    | "lobby"          // Esperando jugadores
    | "proposeTeam"    // Líder propone equipo
    | "voteTeam"       // Todos votan el equipo
    | "mission"        // Equipo realiza misión
    | "reveal";        // Fin del juego

/**
 * Estado completo del juego
 */
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

/**
 * Resultado de una misión completada
 */
export type MissionResult = {
    team: string[];     // IDs del equipo que fue a la misión
    fails: number;      // Número de fallos
    passed: boolean;    // true = misión exitosa, false = fallida
};

