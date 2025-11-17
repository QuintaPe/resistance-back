// src/server.ts

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { createApp } from './app';
import { initSocket } from './sockets';
import { PORT } from './config/env.config';

// Crear Express
const app = createApp();

// Crear servidor HTTP para Socket.IO
const server = http.createServer(app);

// Inicializar Socket.IO
initSocket(server);

// Arrancar servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
