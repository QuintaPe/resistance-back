// src/core/domain/room.types.ts

import { Player, DisconnectedPlayer } from './player.types';
import { Game } from './game.types';

/**
 * Representa una sala de juego
 */
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

