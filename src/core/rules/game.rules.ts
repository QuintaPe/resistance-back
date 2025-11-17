// src/core/rules/game.rules.ts

/**
 * Reglas del juego The Resistance
 * Define tamaños de equipo, número de espías y fracasos requeridos según número de jugadores
 */

/**
 * Tamaños de equipo por misión según número de jugadores
 */
export const TEAM_SIZES: Record<number, number[]> = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
    11: [4, 5, 5, 5, 6],
    12: [4, 5, 5, 6, 6]
};

/**
 * Obtiene los tamaños de equipo para cada misión según el número de jugadores
 */
export function getTeamSizes(n: number): number[] {
    return TEAM_SIZES[n] || TEAM_SIZES[5];
}

/**
 * Obtiene el número de espías según el número de jugadores
 * - 5-6 jugadores: 2 espías
 * - 7-9 jugadores: 3 espías
 * - 10-11 jugadores: 4 espías
 * - 12 jugadores: 5 espías
 */
export function getNumSpies(n: number): number {
    if (n <= 5) return 2;
    if (n === 6) return 2;
    if (n === 7) return 3;
    if (n === 8) return 3;
    if (n === 9) return 3;
    if (n === 10) return 4;
    if (n === 11) return 4;
    return 5;
}

/**
 * Obtiene los fracasos requeridos para cada misión según el número de jugadores
 * Con 7+ jugadores, la misión 4 (índice 3) requiere 2 fracasos para fallar
 * El resto de misiones solo requieren 1 fracaso
 */
export function getFailsRequired(n: number): number[] {
    if (n >= 7) {
        return [1, 1, 1, 2, 1];
    }
    return [1, 1, 1, 1, 1];
}

