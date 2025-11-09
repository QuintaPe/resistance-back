// src/game/rules.ts

export const TEAM_SIZES: Record<number, number[]> = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
};

export function getTeamSizes(n: number) {
    return TEAM_SIZES[n] || TEAM_SIZES[5];
}

export function getNumSpies(n: number) {
    if (n <= 5) return 2;
    if (n === 6) return 2;
    if (n === 7) return 3;
    if (n === 8) return 3;
    if (n === 9) return 3;
    return 4;
}
