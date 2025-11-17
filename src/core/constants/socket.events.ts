// src/core/constants/socket.events.ts

/**
 * Eventos de Socket.IO del juego The Resistance
 * Centralizados para evitar strings hardcodeados
 */

/**
 * Eventos relacionados con salas
 */
export const ROOM_EVENTS = {
    CREATE: 'room:create',
    JOIN: 'room:join',
    UPDATE: 'room:update',
    CHANGE_LEADER: 'room:changeLeader',
} as const;

/**
 * Eventos relacionados con jugadores
 */
export const PLAYER_EVENTS = {
    KICK: 'player:kick',
    KICKED: 'player:kicked',
    DISCONNECTED: 'player:disconnected',
    RECONNECTED: 'player:reconnected',
    REMOVED: 'player:removed',
} as const;

/**
 * Eventos relacionados con el juego
 */
export const GAME_EVENTS = {
    START: 'game:start',
    UPDATE: 'game:update',
    ROLE: 'game:role',
    REQUEST_ROLE: 'game:requestRole',
    RESTART: 'game:restart',
    RETURN_TO_LOBBY: 'game:returnToLobby',
} as const;

/**
 * Eventos relacionados con equipos
 */
export const TEAM_EVENTS = {
    PROPOSE: 'team:propose',
    VOTE: 'team:vote',
} as const;

/**
 * Eventos relacionados con misiones
 */
export const MISSION_EVENTS = {
    ACT: 'mission:act',
} as const;

/**
 * Eventos relacionados con el creador
 */
export const CREATOR_EVENTS = {
    CHANGED: 'creator:changed',
} as const;

/**
 * Todos los eventos del socket
 */
export const SOCKET_EVENTS = {
    ...ROOM_EVENTS,
    ...PLAYER_EVENTS,
    ...GAME_EVENTS,
    ...TEAM_EVENTS,
    ...MISSION_EVENTS,
    ...CREATOR_EVENTS,
} as const;

