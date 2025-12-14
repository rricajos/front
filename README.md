# 🎭 Avatar Gespropiedad

Sistema de avatar interactivo con lip-sync y TTS para presentaciones.

## 📁 Estructura

```
avatar-app/
├── index.html              # HTML principal
├── config.local.json       # ⚠️ API Keys (NO subir a git)
├── config.local.example.json
├── .gitignore
├── css/
│   └── styles.css
├── js/
│   ├── main.js             # Punto de entrada
│   ├── domain/             # Lógica de negocio
│   │   ├── config.js
│   │   ├── audio-bank.js
│   │   ├── event-bus.js
│   │   ├── logger.js
│   │   └── message-validator.js
│   ├── infrastructure/     # Adaptadores externos
│   │   ├── adapters/
│   │   │   ├── rive-adapter.js
│   │   │   ├── css-avatar-adapter.js
│   │   │   ├── audio-adapter.js
│   │   │   ├── tts-adapter.js
│   │   │   ├── elevenlabs-adapter.js
│   │   │   ├── websocket-adapter.js
│   │   │   ├── karaoke-adapter.js
│   │   │   └── ui-adapter.js
│   │   └── services/
│   │       ├── avatar-service.js
│   │       └── speech-service.js
│   └── application/
│       └── avatar-application.js
├── audio/                  # Audios pregrabados
│   ├── intro_1.mp3
│   ├── que_es_1.mp3
│   ├── aprendizaje_1.mp3
│   └── despedida_1.mp3
├── avatar.riv              # Animación Rive
└── gestpropiedad.jpg       # Logo
```

## 🚀 Instalación

1. Clonar o descomprimir el proyecto
2. Copiar `config.local.example.json` a `config.local.json`
3. Añadir las API keys reales en `config.local.json`
4. Copiar los assets necesarios:
   - `avatar.riv`
   - `gestpropiedad.jpg`
   - Carpeta `audio/` con los MP3

## ⚙️ Configuración

```json
// config.local.json
{
  "ELEVENLABS_API_KEY": "tu-api-key",
  "ELEVENLABS_VOICE_ID": "tu-voice-id",
  "BACKEND_HOST": "tu-backend.com"
}
```

### Sin ElevenLabs
Si no tienes API key de ElevenLabs, el sistema usará automáticamente el TTS del navegador.

### Sin Backend
Si no hay backend, puedes usar el botón "Test" para probar el avatar con TTS local.

## 🔒 Seguridad

- **NUNCA** subir `config.local.json` a un repositorio público
- Las API keys se cargan en runtime, no están en el código fuente
- Los mensajes WebSocket son validados contra un esquema
- Los audioIds son sanitizados antes de usarse

## 🐳 Docker

```bash
# Build
docker build -t gespropiedad-avatar .

# Run
docker run -d -p 8080:80 --name avatar gespropiedad-avatar

# Acceder en http://localhost:8080
```

### Estructura necesaria antes del build
```
avatar-app/
├── Dockerfile
├── config.local.json      # Con API keys
├── avatar.riv
├── gestpropiedad.jpg
├── audio/
│   ├── intro_1.mp3
│   ├── que_es_1.mp3
│   ├── aprendizaje_1.mp3
│   └── despedida_1.mp3
└── ... (resto de archivos)
```

## 🛠️ Desarrollo

```bash
# Servidor local simple
npx serve .

# O con Python
python -m http.server 8000
```

## 📋 API Pública

```javascript
// Accesible desde consola en localhost
const app = window.avatarApp;

// Reproducir audio del banco
await app.playAudio('intro_1');

// Reproducir texto con TTS
await app.sayText('Hola mundo');

// Detener
app.stop();

// Modo presentación
await app.enterPresentationMode();
app.exitPresentationMode();

// Estado actual (inmutable)
const state = app.getState();
console.log(state.isSpeaking, state.isPresentationMode);

// Suscribirse a cambios de estado
const unsubscribe = app.onStateChange(({ old, new: newState, changes }) => {
  console.log('Estado cambió:', changes);
});
// Para cancelar: unsubscribe();

// Cache de audio
console.log(app.audio.getCacheStats());

// Circuit breaker de ElevenLabs
console.log(app.speech.getElevenLabsStats());
app.speech.resetElevenLabsCircuit(); // Reset manual

// Telemetría
console.log(app.getMetrics());

// AudioBank dinámico
console.log(app.getAudioIds());

// Recargar AudioBank (desde audioBankLoader global)
await window.audioBankLoader.load('./audio-bank.json');

// Destruir la app (libera todos los recursos)
app.destroy();
```

## 🏗️ Inyección de Dependencias

```javascript
// Uso del DI Container (para tests o configuración avanzada)
import { setupContainer } from './js/application/index.js';

const container = setupContainer(config, RiveCanvas);

// Resolver servicios
const logger = container.resolve('logger');
const speech = container.resolve('speech');

// Crear scope para tests
const testContainer = container.createScope();
testContainer.constant('logger', mockLogger);

// Limpiar
container.destroy();
```

## 📊 Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                         DOMAIN                               │
│  Config, AudioBank, EventBus, Logger, MessageValidator      │
│  StateManager (estado inmutable)                            │
├─────────────────────────────────────────────────────────────┤
│                      APPLICATION                             │
│  AvatarApplication (Orquestador)                            │
│  - destroy() para cleanup completo                          │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                            │
│  Adapters: Rive, CSS, Audio, TTS, ElevenLabs, WebSocket     │
│  Services: AvatarService, SpeechService                     │
│  - Todos con destroy() y _destroyed flag                    │
└─────────────────────────────────────────────────────────────┘
```

## 🧹 Cleanup y Memory Management

Todos los adaptadores implementan:
- `destroy()` - Libera recursos y limpia timers
- `_destroyed` flag - Previene operaciones post-destrucción
- Event listener cleanup automático

```javascript
// La app limpia automáticamente:
// - Event listeners del DOM
// - Suscripciones al EventBus
// - Timers de lip-sync y karaoke
// - Instancias de Rive
// - Audio en reproducción
```

## 📝 Licencia

Propiedad de Conexiatec / Gestpropiedad.
