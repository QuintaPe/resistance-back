// src/app.ts

import express from 'express';
import cors from 'cors';
import { errorMiddleware } from './middleware/error.middleware';

/**
 * Crea y configura la aplicación Express
 */
export function createApp() {
  const app = express();

  // Middleware global
  app.use(cors());
  app.use(express.json());

  // Rutas simples (solo para pruebas)
  app.get('/health', (_, res) => {
    res.json({ ok: true });
  });

  // Middleware global de errores
  app.use(errorMiddleware);

  return app;
}
