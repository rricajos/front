# 📊 Análisis del Proyecto Avatar Gespropiedad

## 🔴 PUNTOS DÉBILES

### 1. **Seguridad**

| Problema | Severidad | Ubicación |
|----------|-----------|-----------|
| API Key de ElevenLabs hardcodeada | 🔴 CRÍTICO | `config.js:3` |
| Sin validación de origen en WebSocket | 🟠 ALTO | `websocket-adapter.js` |
| Sin sanitización de mensajes WS | 🟠 ALTO | `websocket-adapter.js:52` |

```javascript
// PROBLEMA: API key expuesta en código fuente
ELEVENLABS_API_KEY: "sk_ed00c8630aeb0240abba435c3f0a4afcd6794a79c0d1aba6"
```

### 2. **Gestión de Estado**

| Problema | Impacto |
|----------|---------|
| Estado mutable sin inmutabilidad | Race conditions potenciales |
| Sin patrón de estado centralizado | Difícil debugging |
| Callbacks mutables en runtime | Comportamiento impredecible |
| `isSpeaking` se puede desincronizar | Lip-sync inconsistente |

```javascript
// PROBLEMA: Mutación directa sin protección
this.state.isSpeaking = true;
this.audio.onPlay = () => { ... }; // Callback sobrescrito cada vez
```

### 3. **Manejo de Errores**

| Problema | Ubicación |
|----------|-----------|
| Sin retry en llamadas a ElevenLabs | `elevenlabs-adapter.js` |
| Errores silenciados en algunos catch | `speech-service.js:59` |
| Sin circuit breaker para APIs externas | Todo el proyecto |
| Sin timeout en fetch a ElevenLabs | `elevenlabs-adapter.js:30` |

### 4. **Memory Leaks Potenciales**

| Problema | Ubicación |
|----------|-----------|
| Event listeners no removidos | `avatar-application.js:166-201` |
| Timers no limpiados en destroy() | `rive-adapter.js`, `karaoke-adapter.js` |
| Sin cleanup de instancias Rive | `rive-adapter.js:99` |
| URLs de blob no revocadas en errores | `elevenlabs-adapter.js` |

```javascript
// PROBLEMA: Sin removeEventListener
document.getElementById("startNormalBtn").onclick = async () => { ... };
// Si se recrea la app, el listener anterior sigue ahí
```

### 5. **Acoplamiento**

| Problema | Impacto |
|----------|---------|
| `AvatarApplication` conoce demasiado del DOM | Difícil de testear |
| `UIAdapter` tiene referencias directas a IDs | Frágil ante cambios HTML |
| Dependencia global de `lucide` | No declarada explícitamente |
| `AudioBank` hardcodeado en domain | Debería ser configurable |

### 6. **Rendimiento**

| Problema | Impacto |
|----------|-----------|
| Sin lazy loading de Rive presentation | Carga innecesaria |
| Sin caché de audios pregrabados | Re-descarga cada vez |
| setInterval de 90ms para lip-sync | CPU en móviles |
| Sin debounce en eventos de teclado | Múltiples disparos |

### 7. **Resiliencia**

| Problema | Escenario |
|----------|-----------|
| Sin fallback si Rive falla en presentación | Pantalla negra |
| Sin reconexión exponencial backoff | Spam al servidor |
| Sin offline support | Falla sin internet |
| Sin validación de archivos de audio | Crash si falta archivo |

---

## 🟢 MEJORAS PROPUESTAS

### 1. **Seguridad** (Prioridad: CRÍTICA)

```javascript
// SOLUCIÓN: Variables de entorno o backend proxy
// config.js
export const Config = Object.freeze({
  ELEVENLABS_API_KEY: import.meta.env.VITE_ELEVENLABS_KEY || null,
  // O mejor: usar un proxy backend
  ELEVENLABS_PROXY: "/api/tts/elevenlabs",
});

// SOLUCIÓN: Validar origen WebSocket
class WebSocketAdapter {
  _handleMessage(event) {
    // Validar estructura del mensaje
    const schema = { type: 'string', audioId: 'string?' };
    if (!this._validateMessage(msg, schema)) {
      this.logger.warn("Mensaje WS inválido");
      return;
    }
  }
}
```

### 2. **State Management** (Prioridad: ALTA)

```javascript
// SOLUCIÓN: Estado inmutable con eventos
// domain/state-manager.js
export class StateManager {
  constructor(eventBus) {
    this._state = Object.freeze({
      isPresentationMode: false,
      currentAudioId: null,
      isFullscreen: false,
      isSpeaking: false,
    });
    this.eventBus = eventBus;
  }

  update(partial) {
    const oldState = this._state;
    this._state = Object.freeze({ ...oldState, ...partial });
    this.eventBus.emit('state:changed', { old: oldState, new: this._state });
    return this._state;
  }

  get state() { return this._state; }
}
```

### 3. **Retry y Circuit Breaker** (Prioridad: ALTA)

```javascript
// infrastructure/utils/retry.js
export async function withRetry(fn, { maxAttempts = 3, delay = 1000 } = {}) {
  let lastError;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// infrastructure/utils/circuit-breaker.js
export class CircuitBreaker {
  constructor(threshold = 5, resetTimeout = 30000) {
    this.failures = 0;
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
    }
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (e) {
      this._onFailure();
      throw e;
    }
  }
}
```

### 4. **Cleanup y Memory Management** (Prioridad: ALTA)

```javascript
// application/avatar-application.js
export class AvatarApplication {
  _eventCleanups = [];

  _setupEventListeners() {
    // Guardar referencias para cleanup
    const handleEscape = (e) => { ... };
    document.addEventListener("keydown", handleEscape);
    this._eventCleanups.push(() => 
      document.removeEventListener("keydown", handleEscape)
    );
  }

  destroy() {
    // Limpiar todos los event listeners
    this._eventCleanups.forEach(cleanup => cleanup());
    this._eventCleanups = [];
    
    // Destruir adaptadores
    this.panelAvatar.destroy();
    this.presentationRive.destroy();
    this.webSocket.disconnect();
    this.audio.stop();
    this.speech.stop();
    
    this.logger.log("Aplicación destruida");
  }
}
```

### 5. **Dependency Injection Container** (Prioridad: MEDIA)

```javascript
// infrastructure/di-container.js
export class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  register(name, factory, singleton = false) {
    this.services.set(name, { factory, singleton });
  }

  resolve(name) {
    const service = this.services.get(name);
    if (!service) throw new Error(`Service ${name} not found`);
    
    if (service.singleton) {
      if (!this.singletons.has(name)) {
        this.singletons.set(name, service.factory(this));
      }
      return this.singletons.get(name);
    }
    return service.factory(this);
  }
}

// Uso:
const container = new DIContainer();
container.register('logger', () => new Logger(), true);
container.register('eventBus', () => new EventBus(), true);
container.register('tts', (c) => new TTSAdapter(c.resolve('logger')));
```

### 6. **Audio Cache** (Prioridad: MEDIA)

```javascript
// infrastructure/adapters/cached-audio-adapter.js
export class CachedAudioAdapter extends AudioAdapter {
  constructor(logger) {
    super(logger);
    this.cache = new Map();
  }

  async play(url) {
    // Precargar si no está en caché
    if (!this.cache.has(url)) {
      const response = await fetch(url);
      const blob = await response.blob();
      this.cache.set(url, URL.createObjectURL(blob));
    }
    
    return super.play(this.cache.get(url));
  }

  preload(urls) {
    return Promise.all(urls.map(url => 
      fetch(url).then(r => r.blob()).then(b => {
        this.cache.set(url, URL.createObjectURL(b));
      })
    ));
  }

  clearCache() {
    this.cache.forEach(url => URL.revokeObjectURL(url));
    this.cache.clear();
  }
}
```

### 7. **Configuración Externa** (Prioridad: MEDIA)

```javascript
// domain/config-loader.js
export class ConfigLoader {
  static async load(url = './config.json') {
    try {
      const response = await fetch(url);
      const external = await response.json();
      return Object.freeze({ ...DefaultConfig, ...external });
    } catch {
      return DefaultConfig;
    }
  }
}

// config.json (externo, no en repo)
{
  "BACKEND_HOST": "production-api.example.com",
  "ELEVENLABS_API_KEY": null,
  "USE_BROWSER_TTS_FALLBACK": true
}
```

### 8. **AudioBank Dinámico** (Prioridad: MEDIA)

```javascript
// domain/audio-bank-loader.js
export class AudioBankLoader {
  static async load(url = './audio-bank.json') {
    const response = await fetch(url);
    return await response.json();
  }

  static validate(bank) {
    const required = ['text', 'audio', 'segments', 'pauses'];
    for (const [id, entry] of Object.entries(bank)) {
      for (const field of required) {
        if (!(field in entry)) {
          throw new Error(`Audio ${id} missing field: ${field}`);
        }
      }
    }
    return true;
  }
}
```

### 9. **Testing Support** (Prioridad: MEDIA)

```javascript
// Interfaces para mocking
// infrastructure/ports/speech-port.js
export class SpeechPort {
  async speak(text) { throw new Error('Not implemented'); }
  stop() { throw new Error('Not implemented'); }
  get isSpeaking() { throw new Error('Not implemented'); }
}

// Para tests:
class MockSpeechAdapter extends SpeechPort {
  constructor() {
    super();
    this.speakCalls = [];
  }
  async speak(text) {
    this.speakCalls.push(text);
  }
  stop() {}
  get isSpeaking() { return false; }
}
```

### 10. **Observabilidad** (Prioridad: BAJA)

```javascript
// infrastructure/adapters/telemetry-adapter.js
export class TelemetryAdapter {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.buffer = [];
  }

  track(event, data = {}) {
    this.buffer.push({
      event,
      data,
      timestamp: Date.now(),
      sessionId: this._sessionId,
    });
    
    if (this.buffer.length >= 10) {
      this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const events = [...this.buffer];
    this.buffer = [];
    
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        body: JSON.stringify(events),
      });
    } catch {
      // Re-add on failure
      this.buffer.unshift(...events);
    }
  }
}
```

---

## 📋 RESUMEN DE PRIORIDADES

| Prioridad | Mejora | Esfuerzo | Impacto | Estado |
|-----------|--------|----------|---------|--------|
| 🔴 P0 | Sacar API key del código | 1h | Seguridad | ✅ HECHO |
| 🔴 P0 | Validar mensajes WebSocket | 2h | Seguridad | ✅ HECHO |
| 🟠 P1 | State Manager inmutable | 4h | Estabilidad | ✅ HECHO |
| 🟠 P1 | Cleanup y destroy() | 3h | Memory leaks | ✅ HECHO |
| 🟠 P1 | Retry con backoff | 2h | Resiliencia | ✅ HECHO |
| 🟡 P2 | Circuit breaker | 3h | Resiliencia | ✅ HECHO |
| 🟡 P2 | Audio cache | 2h | Rendimiento | ✅ HECHO |
| 🟡 P2 | Config externa | 2h | Mantenibilidad | ✅ HECHO |
| 🟢 P3 | DI Container | 4h | Testabilidad | Pendiente |
| 🟢 P3 | AudioBank dinámico | 2h | Flexibilidad | Pendiente |
| 🟢 P3 | Telemetría | 3h | Observabilidad | Pendiente |

---

## 🎯 QUICK WINS (< 1 hora cada uno)

1. **Timeout en ElevenLabs fetch**
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
const response = await fetch(url, { signal: controller.signal });
```

2. **Debounce en ESC**
```javascript
let escapeTimeout;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    clearTimeout(escapeTimeout);
    escapeTimeout = setTimeout(() => this._handleEscape(), 100);
  }
});
```

3. **Precargar audio de presentación**
```javascript
async enterPresentationMode() {
  const audioUrls = Object.values(AudioBank).map(e => e.audio);
  await this.audio.preload(audioUrls);
}
```

4. **Validar existencia de elementos DOM**
```javascript
_getElement(id) {
  const el = document.getElementById(id);
  if (!el) this.logger.warn(`Elemento #${id} no encontrado`);
  return el;
}
```
