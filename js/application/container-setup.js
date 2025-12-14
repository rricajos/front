// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION - Container Setup (Configuración de DI)
// ═══════════════════════════════════════════════════════════════════════════

import { EventBus, Logger, StateManager, AudioBankLoader } from '../domain/index.js';
import {
  RiveAdapter,
  CSSAvatarAdapter,
  CachedAudioAdapter,
  TTSAdapter,
  ElevenLabsAdapter,
  WebSocketAdapter,
  KaraokeAdapter,
  UIAdapter,
  TelemetryAdapter,
  AvatarService,
  SpeechService,
  DIContainer,
} from '../infrastructure/index.js';

/**
 * Configura el contenedor DI con todos los servicios
 * @param {object} config - Configuración de la aplicación
 * @param {object} RiveCanvas - Módulo de Rive
 * @returns {DIContainer}
 */
export function setupContainer(config, RiveCanvas) {
  const container = new DIContainer();
  
  // ═══════════════════════════════════════════════════════════════════════
  // Constantes
  // ═══════════════════════════════════════════════════════════════════════
  
  container.constant('config', config);
  container.constant('RiveCanvas', RiveCanvas);
  
  // ═══════════════════════════════════════════════════════════════════════
  // Domain - Core Services
  // ═══════════════════════════════════════════════════════════════════════
  
  container.singleton('eventBus', () => new EventBus());
  
  container.singleton('logger', () => 
    new Logger(document.getElementById('debug'))
  );
  
  container.singleton('stateManager', (c) => 
    new StateManager(c.resolve('eventBus'))
  );
  
  container.singleton('audioBankLoader', (c) => 
    new AudioBankLoader(c.resolve('logger'))
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  // Infrastructure - Adapters
  // ═══════════════════════════════════════════════════════════════════════
  
  container.singleton('ui', () => new UIAdapter());
  
  container.singleton('telemetry', (c) => {
    const cfg = c.resolve('config');
    return new TelemetryAdapter({
      endpoint: cfg.TELEMETRY_ENDPOINT || null,
      appName: 'gespropiedad-avatar',
      appVersion: '2.0.0',
      debug: cfg.TELEMETRY_DEBUG || false,
    });
  });
  
  // Panel Rive Adapter
  container.singleton('panelRive', (c) => 
    new RiveAdapter(
      document.getElementById('riveCanvas'),
      c.resolve('config'),
      c.resolve('logger'),
      c.resolve('RiveCanvas')
    )
  );
  
  // Panel CSS Adapter (fallback)
  container.singleton('panelCSS', () => 
    new CSSAvatarAdapter(document.getElementById('cssMouth'))
  );
  
  // Presentation Rive Adapter
  container.singleton('presentationRive', (c) => 
    new RiveAdapter(
      document.getElementById('presentationCanvas'),
      c.resolve('config'),
      c.resolve('logger'),
      c.resolve('RiveCanvas')
    )
  );
  
  // Audio con cache
  container.singleton('audio', (c) => 
    new CachedAudioAdapter(c.resolve('logger'))
  );
  
  // Browser TTS
  container.singleton('browserTTS', (c) => 
    new TTSAdapter(c.resolve('logger'))
  );
  
  // ElevenLabs TTS
  container.singleton('elevenLabs', (c) => 
    new ElevenLabsAdapter(c.resolve('config'), c.resolve('logger'))
  );
  
  // WebSocket
  container.singleton('webSocket', (c) => {
    const cfg = c.resolve('config');
    const host = new URLSearchParams(location.search).get('backend') || cfg.BACKEND_HOST;
    return new WebSocketAdapter(
      host,
      c.resolve('logger'),
      c.resolve('eventBus')
    );
  });
  
  // Karaoke
  container.singleton('karaoke', (c) => 
    new KaraokeAdapter(
      document.getElementById('presentationSubtitle'),
      c.resolve('config')
    )
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  // Infrastructure - Services (Facades)
  // ═══════════════════════════════════════════════════════════════════════
  
  container.singleton('panelAvatar', (c) => 
    new AvatarService(
      c.resolve('panelRive'),
      c.resolve('panelCSS'),
      c.resolve('ui'),
      c.resolve('logger')
    )
  );
  
  container.singleton('speech', (c) => 
    new SpeechService(
      c.resolve('elevenLabs'),
      c.resolve('browserTTS'),
      c.resolve('config'),
      c.resolve('logger')
    )
  );
  
  return container;
}

/**
 * Lista de servicios para destroy automático
 */
export const DESTROYABLE_SERVICES = [
  'telemetry',
  'webSocket',
  'panelAvatar',
  'presentationRive',
  'audio',
  'karaoke',
  'speech',
];
