# THE RESISTANCE - Backend Documentation for Frontend Development

## 📋 Tabla de Contenidos
1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Tipos de Datos](#tipos-de-datos)
4. [API WebSocket Events](#api-websocket-events)
5. [Lógica del Juego](#lógica-del-juego)
6. [Reglas del Juego](#reglas-del-juego)
7. [Estados y Flujo del Juego](#estados-y-flujo-del-juego)
8. [Constantes y Configuración](#constantes-y-configuración)
9. [Ejemplos de Flujo Completo](#ejemplos-de-flujo-completo)

---

## 🎮 Descripción General

Este backend implementa el juego **"The Resistance"**, un juego de dedución social donde:
- **5-10 jugadores** compiten en equipos
- Hay **Resistencia** (equipo bueno) vs **Espías** (equipo malo)
- El objetivo es completar **5 misiones**
- La Resistencia gana si 3+ misiones tienen éxito
- Los Espías ganan si 3+ misiones fallan o si rechazan 5 equipos seguidos

### Tecnologías
- **Node.js** con **TypeScript**
- **Express** para servidor HTTP
- **Socket.IO** para comunicación en tiempo real
- **CORS** habilitado para desarrollo

### Puerto del Servidor
- **Desarrollo**: `http://localhost:3000`
- **Configuración**: Variable de entorno `PORT` (default: 3000)

---

## 🏗️ Arquitectura del Sistema

### Estructura de Carpetas
```
src/
├── app.ts                    # Configuración Express
├── server.ts                 # Entrada principal
├── config/
│   ├── constants.ts          # Constantes del juego
│   └── env.ts                # Variables de entorno
├── game/
│   ├── types.ts              # Tipos TypeScript
│   ├── state.ts              # Lógica de estado del juego
│   ├── rules.ts              # Reglas del juego
│   └── roomManager.ts        # Gestión de salas
├── sockets/
│   ├── index.ts              # Inicialización Socket.IO
│   ├── room.handlers.ts      # Eventos de sala
│   ├── game.handlers.ts      # Eventos de juego
│   └── utils.handlers.ts     # Utilidades socket
├── middleware/
│   └── errorHandler.ts       # Manejo de errores
└── utils/
    ├── id.ts                 # Generación de IDs
    └── shuffle.ts            # Aleatorización
```

### Componentes Principales

1. **RoomManager**: Gestiona salas y jugadores
2. **GameState**: Controla la lógica del juego
3. **Socket Handlers**: Maneja eventos de clientes
4. **Rules**: Define configuración según número de jugadores

---

## 📦 Tipos de Datos

### Player
Representa un jugador en el juego.

```typescript
type Player = {
    id: string;      // Socket ID único
    name: string;    // Nombre del jugador
};
```

### Room
Representa una sala de juego.

```typescript
type Room = {
    code: string;           // Código de 5 letras (ej: "ABCDE")
    players: Player[];      // Lista de jugadores
    state: Game;            // Estado actual del juego
};
```

### GamePhase
Fases posibles del juego.

```typescript
type GamePhase =
    | "lobby"          // Esperando jugadores
    | "proposeTeam"    // Líder propone equipo
    | "voteTeam"       // Todos votan el equipo
    | "mission"        // Equipo realiza misión
    | "reveal";        // Fin del juego
```

### Game
Estado completo del juego.

```typescript
type Game = {
    phase: GamePhase;                           // Fase actual
    leaderIndex: number;                        // Índice del líder actual
    spies: string[];                            // IDs de espías (PRIVADO)
    currentMission: number;                     // Misión actual (0-4)
    teamSizePerMission: number[];              // Tamaños de equipo [2,3,2,3,3]
    proposedTeam: string[];                     // IDs del equipo propuesto
    teamVotes: Record<string, "approve" | "reject">;  // Votos del equipo
    missionActions: Record<string, "success" | "fail">; // Acciones de misión
    results: MissionResult[];                   // Resultados de misiones
    rejectedTeamsInRow: number;                 // Equipos rechazados consecutivos
};
```

### MissionResult
Resultado de una misión completada.

```typescript
type MissionResult = {
    team: string[];     // IDs del equipo que fue a la misión
    fails: number;      // Número de fallos
    passed: boolean;    // true = misión exitosa, false = fallida
};
```

### PublicState
Estado público (sin información secreta).

```typescript
type PublicState = {
    code: string;
    players: Player[];
    phase: GamePhase;
    leaderIndex: number;
    currentMission: number;
    teamSizePerMission: number[];
    proposedTeam: string[];
    results: MissionResult[];
    rejectedTeamsInRow: number;
    // NO incluye: spies, teamVotes específicos, missionActions específicos
};
```

---

## 🔌 API WebSocket Events

### Conexión
```typescript
// Cliente conecta automáticamente
socket.on('connection', (socket) => {
    // socket.id es el identificador único del jugador
});
```

### 1. Crear Sala

**Evento del Cliente**: `room:create`

```typescript
socket.emit('room:create', 
    { name: "NombreJugador" }, 
    (response) => {
        // response: { roomCode: "ABCDE", playerId: "socket-id-123" }
    }
);
```

**Respuesta (Callback)**:
```typescript
{
    roomCode: string;   // Código de sala
    playerId: string;   // ID del jugador (socket.id)
}
```

**Broadcast a la Sala**: `room:update`
```typescript
// Todos en la sala reciben:
socket.on('room:update', (publicState) => {
    // publicState es el estado público de la sala
});
```

---

### 2. Unirse a Sala

**Evento del Cliente**: `room:join`

```typescript
socket.emit('room:join', 
    { 
        roomCode: "ABCDE", 
        name: "NombreJugador" 
    }, 
    (response) => {
        if (response.error) {
            // Error: "La sala no existe"
        } else {
            // response: { roomCode: "ABCDE", playerId: "socket-id-456" }
        }
    }
);
```

**Respuesta (Callback)**:
```typescript
{
    roomCode?: string;
    playerId?: string;
    error?: string;     // Si la sala no existe
}
```

**Broadcast a la Sala**: `room:update`

---

### 3. Iniciar Juego

**Evento del Cliente**: `game:start`

```typescript
socket.emit('game:start', 
    { roomCode: "ABCDE" }, 
    (response) => {
        // response: { ok: true }
    }
);
```

**Requisitos**:
- Mínimo 5 jugadores
- La sala debe estar en fase "lobby"

**Efecto**:
- Asigna roles (espías) aleatoriamente
- Cambia fase a "proposeTeam"
- Establece líder inicial

**Broadcast a la Sala**: `game:update`

---

### 4. Proponer Equipo

**Evento del Cliente**: `team:propose`

```typescript
socket.emit('team:propose', {
    roomCode: "ABCDE",
    teamIds: ["socket-id-1", "socket-id-2", "socket-id-3"]
});
```

**Requisitos**:
- Solo el líder actual puede proponer
- Fase debe ser "proposeTeam"
- Número de IDs debe coincidir con `teamSizePerMission[currentMission]`

**Efecto**:
- Cambia fase a "voteTeam"
- Establece `proposedTeam`
- Resetea `teamVotes`

**Broadcast a la Sala**: `game:update`

---

### 5. Votar Equipo

**Evento del Cliente**: `team:vote`

```typescript
socket.emit('team:vote', {
    roomCode: "ABCDE",
    vote: "approve"  // o "reject"
});
```

**Requisitos**:
- Fase debe ser "voteTeam"
- Cada jugador vota una vez

**Efecto cuando todos votan**:

**Si el equipo es APROBADO** (más de la mitad aprueba):
- Cambia fase a "mission"
- Resetea `missionActions`
- Resetea `rejectedTeamsInRow` a 0

**Si el equipo es RECHAZADO**:
- Incrementa `rejectedTeamsInRow`
- Si `rejectedTeamsInRow >= 5`: **Espías ganan** (fase "reveal")
- Si no: Pasa al siguiente líder, vuelve a "proposeTeam"

**Broadcast a la Sala**: `game:update`

---

### 6. Realizar Acción de Misión

**Evento del Cliente**: `mission:act`

```typescript
socket.emit('mission:act', {
    roomCode: "ABCDE",
    action: "success"  // o "fail"
});
```

**Requisitos**:
- Fase debe ser "mission"
- Solo jugadores en `proposedTeam` pueden actuar
- **Solo espías** pueden elegir "fail"
- Resistencia solo puede elegir "success"

**Efecto cuando todos actúan**:
- Cuenta los "fail"
- Misión pasa si `fails === 0`
- Añade resultado a `results[]`

**Condiciones de Victoria**:
- **Resistencia gana**: 3+ misiones exitosas
- **Espías ganan**: 3+ misiones fallidas

**Fin del Juego**:
- Si hay ganador o se completan 5 misiones: fase "reveal"
- Si no: Pasa al siguiente líder, fase "proposeTeam"

**Broadcast a la Sala**: `game:update`

---

### 7. Actualización del Juego

**Evento del Servidor**: `game:update`

```typescript
socket.on('game:update', (publicState) => {
    // Actualizar UI con el nuevo estado
});
```

Este evento se envía automáticamente después de:
- `room:create`
- `room:join`
- `game:start`
- `team:propose`
- `team:vote`
- `mission:act`

---

## 🎲 Lógica del Juego

### Inicio del Juego (`GameState.start`)

1. Obtener número de jugadores
2. Determinar tamaños de equipo según `rules.ts`
3. Determinar número de espías según `rules.ts`
4. Aleatorizar jugadores con `shuffle()`
5. Asignar primeros N jugadores como espías
6. Inicializar estado del juego:
   - Fase: "proposeTeam"
   - Líder: índice 0
   - Misión actual: 0

### Proponer Equipo (`GameState.proposeTeam`)

**Validaciones**:
- Solo el líder actual puede proponer
- Fase debe ser "proposeTeam"

**Acción**:
- Guarda `teamIds` en `proposedTeam`
- Cambia a fase "voteTeam"
- Limpia votos anteriores

### Votar Equipo (`GameState.voteTeam`)

**Validaciones**:
- Fase debe ser "voteTeam"

**Acción**:
- Registra voto del jugador
- Espera a que todos voten

**Cuando todos votan**:
- Cuenta votos "approve"
- **Aprobado**: `approvals > players.length / 2`
  - Va a fase "mission"
- **Rechazado**:
  - `rejectedTeamsInRow++`
  - Si `rejectedTeamsInRow >= 5`: **Espías ganan** → fase "reveal"
  - Si no: Siguiente líder → fase "proposeTeam"

### Realizar Acción de Misión (`GameState.performMissionAction`)

**Validaciones**:
- Fase debe ser "mission"
- Solo jugadores en `proposedTeam` pueden actuar
- Solo espías pueden hacer "fail"

**Acción**:
- Registra acción del jugador
- Espera a que todos del equipo actúen

**Cuando todos actúan**:
- Cuenta fallos
- **Misión exitosa**: `fails === 0`
- Guarda resultado en `results[]`

**Verificar Victoria**:
- Cuenta misiones exitosas y fallidas
- Si 3+ misiones exitosas: **Resistencia gana**
- Si 3+ misiones fallidas: **Espías ganan**

**Siguiente Ronda**:
- Si no hay ganador y `currentMission < 5`:
  - Incrementa `currentMission`
  - Limpia equipos y votos
  - Siguiente líder
  - Fase "proposeTeam"
- Si hay ganador: Fase "reveal"

---

## 📏 Reglas del Juego

### Tamaños de Equipo por Misión

Depende del número de jugadores:

```typescript
const TEAM_SIZES = {
    5:  [2, 3, 2, 3, 3],
    6:  [2, 3, 4, 3, 4],
    7:  [2, 3, 3, 4, 4],
    8:  [3, 4, 4, 5, 5],
    9:  [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
};
```

**Ejemplo**: Con 7 jugadores
- Misión 1: 2 personas
- Misión 2: 3 personas
- Misión 3: 3 personas
- Misión 4: 4 personas
- Misión 5: 4 personas

### Número de Espías

```typescript
5-6 jugadores → 2 espías
7-9 jugadores → 3 espías
10 jugadores  → 4 espías
```

### Constantes

```typescript
MAX_PLAYERS = 10
MIN_PLAYERS = 5
ROOM_CODE_LENGTH = 5
```

---

## 🔄 Estados y Flujo del Juego

### Diagrama de Flujo

```
┌─────────────┐
│   LOBBY     │ ← Esperando jugadores (5-10)
└──────┬──────┘
       │ game:start
       ↓
┌─────────────┐
│PROPOSE TEAM │ ← Líder selecciona equipo
└──────┬──────┘
       │ team:propose
       ↓
┌─────────────┐
│  VOTE TEAM  │ ← Todos votan
└──────┬──────┘
       │ team:vote
       ├─ Aprobado → MISSION
       └─ Rechazado → 
           ├─ rejectedTeamsInRow < 5 → PROPOSE TEAM (nuevo líder)
           └─ rejectedTeamsInRow >= 5 → REVEAL (Espías ganan)
       ↓
┌─────────────┐
│   MISSION   │ ← Equipo actúa
└──────┬──────┘
       │ mission:act
       ├─ Resistencia 3+ victorias → REVEAL
       ├─ Espías 3+ victorias → REVEAL
       └─ Continuar → PROPOSE TEAM (siguiente misión, nuevo líder)
       ↓
┌─────────────┐
│   REVEAL    │ ← Fin del juego
└─────────────┘
```

### Transiciones de Fase

| Fase Actual | Acción | Nueva Fase | Condición |
|-------------|--------|------------|-----------|
| lobby | game:start | proposeTeam | 5-10 jugadores |
| proposeTeam | team:propose | voteTeam | Líder propone |
| voteTeam | Aprobado | mission | Más de 50% aprueba |
| voteTeam | Rechazado | reveal | 5 rechazos consecutivos |
| voteTeam | Rechazado | proposeTeam | Menos de 5 rechazos |
| mission | Todos actúan | reveal | 3+ victorias de algún equipo |
| mission | Todos actúan | proposeTeam | Juego continúa |

---

## 🛠️ Constantes y Configuración

### Configuración del Servidor

```typescript
// Puerto
PORT = process.env.PORT || 3000

// CORS
origin: "*"  // Permite todos los orígenes
```

### Constantes del Juego

```typescript
MAX_PLAYERS = 10
MIN_PLAYERS = 5
ROOM_CODE_LENGTH = 5
```

### Generación de Códigos de Sala

```typescript
// Formato: 5 letras mayúsculas
// Ejemplo: "ABCDE", "XYZQW"
generateRoomCode() → "ABCDE"
```

---

## 💡 Ejemplos de Flujo Completo

### Ejemplo 1: Juego Completo con 5 Jugadores

#### 1. Crear Sala y Unirse

```typescript
// Jugador 1 (Anfitrión)
socket.emit('room:create', { name: "Alice" });
// → Recibe: { roomCode: "ABCDE", playerId: "sock1" }

// Jugadores 2-5 se unen
socket2.emit('room:join', { roomCode: "ABCDE", name: "Bob" });
socket3.emit('room:join', { roomCode: "ABCDE", name: "Charlie" });
socket4.emit('room:join', { roomCode: "ABCDE", name: "Diana" });
socket5.emit('room:join', { roomCode: "ABCDE", name: "Eve" });

// Todos reciben room:update con:
{
    code: "ABCDE",
    players: [
        { id: "sock1", name: "Alice" },
        { id: "sock2", name: "Bob" },
        { id: "sock3", name: "Charlie" },
        { id: "sock4", name: "Diana" },
        { id: "sock5", name: "Eve" }
    ],
    phase: "lobby",
    ...
}
```

#### 2. Iniciar Juego

```typescript
socket1.emit('game:start', { roomCode: "ABCDE" });

// Backend asigna roles (ejemplo):
// Espías: [sock2, sock4]  (Bob y Diana)
// Resistencia: [sock1, sock3, sock5]  (Alice, Charlie, Eve)

// Todos reciben game:update:
{
    phase: "proposeTeam",
    leaderIndex: 0,  // Alice es líder
    currentMission: 0,
    teamSizePerMission: [2, 3, 2, 3, 3],  // Para 5 jugadores
    // ... (spies NO se envía)
}
```

#### 3. Misión 1 - Proponer Equipo

```typescript
// Alice (líder) propone equipo de 2
socket1.emit('team:propose', {
    roomCode: "ABCDE",
    teamIds: ["sock1", "sock3"]  // Alice y Charlie
});

// Todos reciben game:update:
{
    phase: "voteTeam",
    proposedTeam: ["sock1", "sock3"],
    ...
}
```

#### 4. Votar Equipo

```typescript
socket1.emit('team:vote', { roomCode: "ABCDE", vote: "approve" });
socket2.emit('team:vote', { roomCode: "ABCDE", vote: "approve" });
socket3.emit('team:vote', { roomCode: "ABCDE", vote: "approve" });
socket4.emit('team:vote', { roomCode: "ABCDE", vote: "reject" });
socket5.emit('team:vote', { roomCode: "ABCDE", vote: "approve" });

// 4 aprobaciones > 2.5 → Equipo aprobado

// Todos reciben game:update:
{
    phase: "mission",
    ...
}
```

#### 5. Realizar Misión

```typescript
// Solo sock1 y sock3 pueden actuar
socket1.emit('mission:act', { roomCode: "ABCDE", action: "success" });
socket3.emit('mission:act', { roomCode: "ABCDE", action: "success" });

// 0 fallos → Misión exitosa

// Todos reciben game:update:
{
    phase: "proposeTeam",
    leaderIndex: 1,  // Ahora Bob es líder
    currentMission: 1,
    results: [
        { team: ["sock1", "sock3"], fails: 0, passed: true }
    ],
    ...
}
```

#### 6. Continuar hasta Misión 3

```typescript
// Después de 3 misiones exitosas:
{
    phase: "reveal",
    results: [
        { team: [...], fails: 0, passed: true },
        { team: [...], fails: 0, passed: true },
        { team: [...], fails: 0, passed: true }
    ],
    // ¡Resistencia gana!
}
```

---

### Ejemplo 2: Equipo Rechazado 5 Veces

```typescript
// Escenario: Los jugadores no logran ponerse de acuerdo

// Votación 1 - Rechazada
{
    phase: "voteTeam",
    rejectedTeamsInRow: 0
}
// → Más rechazos que aprobaciones
// → rejectedTeamsInRow = 1, siguiente líder

// Votación 2 - Rechazada
{
    rejectedTeamsInRow: 1
}
// → rejectedTeamsInRow = 2, siguiente líder

// ... (repetir hasta 4)

// Votación 5 - Rechazada
{
    rejectedTeamsInRow: 4
}
// → rejectedTeamsInRow = 5
// → ¡Espías ganan automáticamente!

// Todos reciben game:update:
{
    phase: "reveal",
    rejectedTeamsInRow: 5,
    // Espías ganan sin completar misiones
}
```

---

### Ejemplo 3: Espía Sabotea Misión

```typescript
// Equipo propuesto: [sock2, sock3]
// sock2 es espía, sock3 es resistencia

{
    phase: "mission",
    proposedTeam: ["sock2", "sock3"]
}

// Acciones:
socket2.emit('mission:act', { roomCode: "ABCDE", action: "fail" });  // Espía sabotea
socket3.emit('mission:act', { roomCode: "ABCDE", action: "success" });

// 1 fallo → Misión fallida

// Todos reciben game:update:
{
    phase: "proposeTeam",
    results: [
        { team: ["sock2", "sock3"], fails: 1, passed: false }
    ],
    // Espías 1 - Resistencia 0
}
```

---

## 🎯 Información Importante para el Frontend

### 1. Gestión de Socket ID

```typescript
// El socket.id del cliente ES el playerId
const myPlayerId = socket.id;

// Comparar si soy el líder:
const isLeader = publicState.players[publicState.leaderIndex].id === socket.id;

// Comprobar si estoy en el equipo propuesto:
const amInTeam = publicState.proposedTeam.includes(socket.id);
```

### 2. Información Privada

**El cliente NO recibe**:
- `spies[]` - Lista de espías
- `teamVotes` - Votos individuales durante votación
- `missionActions` - Acciones individuales durante misión

**El cliente SÍ recibe**:
- Resultado agregado: cuántos "fail" hubo en una misión
- Si un equipo fue aprobado o rechazado (pero no quién votó qué)

### 3. UI Según Fase

**lobby**:
- Mostrar lista de jugadores
- Botón "Iniciar juego" (si eres el anfitrión y hay 5+ jugadores)

**proposeTeam**:
- Si eres líder: Seleccionar `teamSizePerMission[currentMission]` jugadores
- Si no eres líder: Esperar

**voteTeam**:
- Todos votan: Botones "Aprobar" / "Rechazar"
- Mostrar equipo propuesto

**mission**:
- Si estás en `proposedTeam`:
  - Resistencia: Solo botón "Éxito"
  - Espía: Botones "Éxito" / "Fallo"
- Si no estás: Esperar

**reveal**:
- Mostrar resultados finales
- Determinar ganador:
  - `results.filter(r => r.passed).length >= 3` → Resistencia gana
  - `results.filter(r => !r.passed).length >= 3` → Espías ganan
  - `rejectedTeamsInRow >= 5` → Espías ganan

### 4. Callbacks vs Broadcast

**Callbacks**:
- Solo para el emisor del evento
- Confirman que la acción fue recibida
- Útiles para errores (ej: "La sala no existe")

**Broadcasts** (`game:update`, `room:update`):
- Se envían a TODOS en la sala
- Contienen el nuevo estado completo
- Debes actualizar tu UI cuando los recibes

### 5. Validaciones del Cliente

Aunque el servidor valida todo, el cliente debería:
- Deshabilitar botones cuando no es tu turno
- Mostrar solo opciones válidas según tu rol
- Indicar cuántos jugadores faltan por actuar

### 6. Determinar Rol del Jugador

**Importante**: El servidor NO envía directamente "eres espía" o "eres resistencia".

**Para saber tu rol**, necesitas una ruta/evento adicional, o puedes:

**Opción A**: Agregar evento `game:role` (sugerencia)
```typescript
socket.on('game:role', (data) => {
    // data: { role: "spy" } o { role: "resistance" }
});
```

**Opción B**: Inferir del backend
- El backend debería enviar a cada jugador individualmente su rol
- Actualmente NO está implementado en el código
- **Recomendación**: Agregar en `game.handlers.ts`:

```typescript
// Después de GameState.start(), enviar roles individuales:
socket.on('game:start', ({ roomCode }) => {
    const room = RoomManager.getRoom(roomCode);
    GameState.start(roomCode);
    
    // Enviar estado público a todos
    io.to(roomCode).emit('game:update', GameState.getPublicState(roomCode));
    
    // Enviar roles privados a cada jugador
    room.players.forEach(player => {
        const isSpy = room.state.spies.includes(player.id);
        io.to(player.id).emit('game:role', { 
            role: isSpy ? 'spy' : 'resistance',
            spies: isSpy ? room.state.spies : undefined  // Espías conocen a otros espías
        });
    });
});
```

---

## 🚀 Checklist para el Frontend

### Funcionalidades Esenciales

- [ ] **Conexión Socket.IO**
  - [ ] Conectar a `http://localhost:3000`
  - [ ] Guardar `socket.id` como `myPlayerId`

- [ ] **Pantalla de Inicio**
  - [ ] Botón "Crear Sala"
  - [ ] Input para unirse a sala (código + nombre)

- [ ] **Lobby**
  - [ ] Lista de jugadores
  - [ ] Indicador de mínimo jugadores (5+)
  - [ ] Botón "Iniciar Juego" (solo anfitrión, si 5+ jugadores)

- [ ] **Pantalla de Juego - Proponer Equipo**
  - [ ] Indicador de líder actual
  - [ ] Si eres líder: Selector de jugadores
  - [ ] Botón "Proponer Equipo" (deshabilitado si selección incorrecta)
  - [ ] Mostrar tamaño requerido del equipo

- [ ] **Pantalla de Juego - Votar Equipo**
  - [ ] Mostrar equipo propuesto
  - [ ] Botones "Aprobar" / "Rechazar"
  - [ ] Indicador de quién falta por votar

- [ ] **Pantalla de Juego - Misión**
  - [ ] Si estás en el equipo:
    - [ ] Resistencia: Solo "Éxito"
    - [ ] Espía: "Éxito" o "Fallo"
  - [ ] Indicador de progreso

- [ ] **Pantalla de Resultados**
  - [ ] Mostrar historial de misiones
  - [ ] Indicar ganador
  - [ ] Revelar roles de todos

- [ ] **UI Global**
  - [ ] Tracker de misiones (1-5)
  - [ ] Contador de rechazos consecutivos
  - [ ] Tu rol (espía/resistencia)
  - [ ] Lista de espías (si eres espía)

### Mejoras Opcionales

- [ ] Animaciones de transiciones
- [ ] Chat entre jugadores
- [ ] Historial de votaciones
- [ ] Timer para acciones
- [ ] Sonidos y efectos
- [ ] Tema visual del juego
- [ ] Responsive design

---

## 📝 Notas Adicionales

### Seguridad

- Los `spies[]` nunca se envían en el estado público
- Las acciones individuales no se revelan hasta el final
- El servidor valida todas las acciones (no confiar en el cliente)

### Manejo de Desconexiones

**Actualmente NO implementado**, pero debería considerarse:
- ¿Qué pasa si un jugador se desconecta durante el juego?
- ¿Se pausa el juego o se elimina al jugador?
- Implementar eventos `disconnect` en el servidor

### Escalabilidad

- Las salas se guardan en memoria (Map)
- En producción, considerar Redis o base de datos
- Actualmente no hay límite de salas

### Testing

Endpoints de prueba:
- `GET /health` → `{ ok: true }`

---

## 🎨 Sugerencias de UI/UX

### Colores Temáticos
- **Resistencia**: Azul / Verde
- **Espías**: Rojo / Naranja
- **Neutral**: Gris

### Elementos Visuales
- Iconos de jugadores (avatares)
- Badges para líder
- Indicadores de estado (esperando, votando, etc.)
- Progreso visual de misiones

### Feedback
- Notificaciones cuando es tu turno
- Confirmaciones antes de acciones importantes
- Loading states mientras se espera a otros jugadores

---

## 🔗 Conexión Socket.IO - Código de Ejemplo

```typescript
import { io } from 'socket.io-client';

// Conectar al servidor
const socket = io('http://localhost:3000');

// Escuchar conexión
socket.on('connect', () => {
    console.log('Conectado:', socket.id);
});

// Crear sala
socket.emit('room:create', { name: 'MiNombre' }, (response) => {
    console.log('Sala creada:', response.roomCode);
});

// Escuchar actualizaciones
socket.on('room:update', (state) => {
    console.log('Estado actualizado:', state);
});

socket.on('game:update', (state) => {
    console.log('Juego actualizado:', state);
});

// Proponer equipo (si eres líder)
socket.emit('team:propose', {
    roomCode: 'ABCDE',
    teamIds: ['id1', 'id2']
});

// Votar
socket.emit('team:vote', {
    roomCode: 'ABCDE',
    vote: 'approve'
});

// Realizar acción de misión
socket.emit('mission:act', {
    roomCode: 'ABCDE',
    action: 'success'
});
```

---

## ✅ Resumen Final

Este backend proporciona una API completa vía WebSocket para implementar el juego "The Resistance". El frontend debe:

1. **Conectarse** vía Socket.IO
2. **Gestionar salas** (crear/unirse)
3. **Renderizar UI** según la fase del juego
4. **Enviar eventos** para las acciones del jugador
5. **Escuchar** actualizaciones del servidor (`game:update`)
6. **Mostrar información** según el rol del jugador

**La única funcionalidad faltante** es el envío individual de roles (espía/resistencia) al iniciar el juego. Se recomienda implementar un evento `game:role` que envíe el rol privadamente a cada jugador.

Con esta documentación, tienes TODO el conocimiento necesario para construir un frontend completo y funcional para "The Resistance". 🎮✨

