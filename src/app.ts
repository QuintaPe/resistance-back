// src/app.ts
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Rutas simples (solo para pruebas)
  app.get('/health', (_, res) => {
    res.json({ ok: true });
  });

  // Middleware global de errores
  app.use(errorHandler);

  return app;
}
