// src/utils/generators/id.generator.ts

/**
 * Utilidades para generación de identificadores únicos
 */

/**
 * Genera un código de sala aleatorio
 * @param length Longitud del código (por defecto 5)
 * @returns Código de sala en mayúsculas
 * @example generateRoomCode() // "ABCDE"
 */
export function generateRoomCode(length = 5): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

