// src/middleware/error.middleware.ts

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware global para manejo de errores
 * Captura errores no controlados y devuelve una respuesta apropiada
 */
export function errorMiddleware(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    console.error('Error capturado:', err);

    res.status(500).json({
        error: 'Internal Server Error',
        message: err?.message || 'Something went wrong'
    });
}

