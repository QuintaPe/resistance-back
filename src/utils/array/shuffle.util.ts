// src/utils/array/shuffle.util.ts

/**
 * Utilidades para manipulación de arrays
 */

/**
 * Mezcla aleatoriamente los elementos de un array usando el algoritmo Fisher-Yates
 * @param array Array a mezclar
 * @returns Nuevo array con elementos mezclados
 * @example shuffleArray([1, 2, 3, 4, 5]) // [3, 1, 5, 2, 4]
 */
export function shuffleArray<T>(array: T[]): T[] {
    return array
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

