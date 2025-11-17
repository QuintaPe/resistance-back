// src/core/constants/game.constants.ts

/**
 * Constantes del juego The Resistance
 */

/**
 * Número máximo de jugadores permitidos en una sala
 */
export const MAX_PLAYERS = 12;

/**
 * Número mínimo de jugadores requeridos para iniciar una partida
 */
export const MIN_PLAYERS = 5;

/**
 * Longitud del código de sala generado
 */
export const ROOM_CODE_LENGTH = 5;

/**
 * Tiempo de gracia para reconexión (en minutos)
 */
export const RECONNECTION_TIMEOUT_MINUTES = 5;

/**
 * Tiempo de gracia para reconexión (en milisegundos)
 */
export const RECONNECTION_TIMEOUT_MS = RECONNECTION_TIMEOUT_MINUTES * 60 * 1000;

