// src/core/domain/player.types.ts

/**
 * Representa un jugador en el juego
 */
export type Player = {
    id: string;         // sessionId - identificador persistente del jugador
    sessionId?: string; // alias explícito para compatibilidad (apunta al mismo valor que id)
    name: string;
    connected: boolean; // indica si el jugador está conectado actualmente
    disconnectedAt: Date | null; // timestamp de cuándo se desconectó
};

/**
 * Información de un jugador desconectado temporalmente
 */
export type DisconnectedPlayer = {
    name: string;
    wasSpy: boolean;
    sessionId: string;
    disconnectTime: number; // timestamp
    playerIndex: number; // índice original del jugador en el array
};

