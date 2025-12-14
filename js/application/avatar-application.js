// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION - Avatar Application (Orquestador principal)
// ═══════════════════════════════════════════════════════════════════════════

import { AudioBank as StaticAudioBank, EventBus, Logger, StateManager } from '../domain/index.js';
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
  TelemetryEventType,
  ProgressAdapter,
  AvatarService,
  SpeechService,
} from '../infrastructure/index.js';

export class AvatarApplication {
  constructor(RiveCanvas, config, options = {}) {
    // Guardar config inyectada
    this.config = config;
    this._destroyed = false;
    
    // AudioBank: dinámico (si se pasa) o estático
    this.audioBank = options.audioBank || StaticAudioBank;
    
    // Settings adapter (opcional)
    this.settings = options.settings || null;
    
    // External services (optional)
    this.toast = options.toast || null;
    this.wakeLock = options.wakeLock || null;
    this.externalEventBus = options.eventBus || null;
    
    // Audio navigation
    this._currentAudioIndex = 0;
    
    // Core
    this.eventBus = new EventBus();
    this.logger = new Logger(document.getElementById("debug"));
    this.ui = new UIAdapter();
    
    // Progress bar para presentación
    this.progress = new ProgressAdapter();
    
    // Telemetría (opcional)
    this.telemetry = new TelemetryAdapter({
      endpoint: config.TELEMETRY_ENDPOINT || null,
      appName: 'gespropiedad-avatar',
      appVersion: '2.0.0',
      debug: config.TELEMETRY_DEBUG || false,
    });
    
    // State Manager (estado inmutable)
    this.state = new StateManager(this.eventBus);
    
    // Panel Avatar (Rive + CSS fallback)
    const panelRive = new RiveAdapter(
      document.getElementById("riveCanvas"), 
      config, 
      this.logger,
      RiveCanvas
    );
    const panelCSS = new CSSAvatarAdapter(
      document.getElementById("cssMouth")
    );
    this.panelAvatar = new AvatarService(panelRive, panelCSS, this.ui, this.logger);
    
    // Presentation Avatar (solo Rive)
    this.presentationRive = new RiveAdapter(
      document.getElementById("presentationCanvas"), 
      config, 
      this.logger,
      RiveCanvas
    );
    
    // Audio (con cache)
    this.audio = new CachedAudioAdapter(this.logger);
    
    // Speech Service (ElevenLabs + Browser TTS fallback)
    const browserTTS = new TTSAdapter(this.logger);
    const elevenLabs = new ElevenLabsAdapter(config, this.logger);
    this.speech = new SpeechService(elevenLabs, browserTTS, config, this.logger);
    
    // Karaoke
    this.karaoke = new KaraokeAdapter(
      document.getElementById("presentationSubtitle"),
      config
    );
    
    // WebSocket
    const backendHost = new URLSearchParams(location.search).get("backend") || config.BACKEND_HOST;
    this.webSocket = new WebSocketAdapter(backendHost, this.logger, this.eventBus);

    // Event cleanup functions
    this._eventCleanups = [];
    this._domCleanups = [];
    
    this._setupEventListeners();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Getters (desde StateManager)
  // ═══════════════════════════════════════════════════════════════════════
  
  get isPresentationMode() { return this.state.get('isPresentationMode'); }
  get currentAudioId() { return this.state.get('currentAudioId'); }
  get isFullscreen() { return this.state.get('isFullscreen'); }
  get isSpeaking() { return this.state.get('isSpeaking'); }

  // ═══════════════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════════════
  
  async initialize() {
    if (this._destroyed) return;
    
    this.logger.log("Iniciando aplicación...");
    
    // Log de configuración (sin secretos)
    this.logger.log("Config: ElevenLabs=" + (this.config.ELEVENLABS_API_KEY ? "✓" : "✗") + 
                    ", Backend=" + (this.config.BACKEND_HOST || "N/A") +
                    ", AudioBank=" + (this.audioBank === StaticAudioBank ? "estático" : "dinámico"));
    
    // Initialize panel avatar
    await this.telemetry.measure('avatar_init', async () => {
      await this.panelAvatar.initialize();
    });
    this.state.update({ avatarReady: true });

    // Load TTS voices
    this._setupVoices();
    
    // Connect WebSocket
    this.webSocket.connect();
    
    // Setup event handlers
    this._setupWebSocketEvents();
    
    this.ui.setBubble("En espera…");
    lucide.createIcons();
    
    this.logger.log("✓ Aplicación lista");
    this.logger.log(`AudioBank: ${Object.keys(this.audioBank).length} entradas`);
  }

  _setupVoices() {
    const loadVoices = () => {
      if (this._destroyed) return;
      const voices = this.speech.loadVoices();
      if (voices.length > 0) {
        const sorted = this.speech.sortedVoices;
        this.ui.populateVoices(sorted);
        this.logger.log("Voces cargadas: " + sorted.length);
      }
    };
    
    if (window.speechSynthesis?.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      this._domCleanups.push(() => {
        window.speechSynthesis.onvoiceschanged = null;
      });
    }
    loadVoices();
  }

  _setupWebSocketEvents() {
    // Guardar unsubscribe functions
    const unsub1 = this.eventBus.on('speak:start', async ({ audioId, text }) => {
      if (this._destroyed) return;
      
      // Si hay audioId, verificar que esté en el banco
      if (audioId) {
        if (!this.audioBank[audioId]) {
          this.logger.log("⏭️ Ignorando: " + audioId);
          return;
        }
        
        this.state.update({ currentAudioId: audioId });
        this.logger.log("🎬 " + audioId);
        this.telemetry.track(TelemetryEventType.AUDIO_PLAY_START, { audioId });
        
        if (audioId === this.config.PRESENTATION_START_ID && this.isPresentationMode) {
          this.ui.showAvatar();
          await this._delay(800);
        }
        
        await this.speak(null, audioId);
        
        if (audioId === this.config.PRESENTATION_END_ID && this.isPresentationMode) {
          this.ui.hideAvatar();
        }
      } 
      // Si hay texto, usar TTS
      else if (text) {
        this.ui.setBubble(text);
        this.telemetry.track(TelemetryEventType.TTS_REQUEST, { length: text.length });
        await this.speak(text);
      }
    });
    this._eventCleanups.push(unsub1);

    const unsub2 = this.eventBus.on('speak:end', () => {
      if (this._destroyed) return;
      
      if (this.currentAudioId === this.config.PRESENTATION_END_ID && this.isPresentationMode) {
        this.ui.hideAvatar();
      }
      this.stop();
      this.state.update({ currentAudioId: null });
    });
    this._eventCleanups.push(unsub2);
    
    const unsub3 = this.eventBus.on('ws:connected', () => {
      this.state.update({ isConnected: true });
      this.telemetry.track(TelemetryEventType.WS_CONNECTED);
    });
    this._eventCleanups.push(unsub3);
    
    const unsub4 = this.eventBus.on('ws:disconnected', () => {
      this.state.update({ isConnected: false });
      this.telemetry.track(TelemetryEventType.WS_DISCONNECTED);
    });
    this._eventCleanups.push(unsub4);
  }

  _setupEventListeners() {
    // Helper para registrar DOM event listeners con cleanup
    const addDOMListener = (elementId, event, handler) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener(event, handler);
        this._domCleanups.push(() => element.removeEventListener(event, handler));
      }
    };

    // Overlay buttons
    addDOMListener("startNormalBtn", "click", async () => {
      await this._unlockAudio();
      this.ui.hideOverlay();
    });

    addDOMListener("startPresentationBtn", "click", async () => {
      await this._unlockAudio();
      this.ui.hideOverlay();
      await this.enterPresentationMode();
    });

    // Panel buttons
    addDOMListener("enterPresentationBtn", "click", () => this.enterPresentationMode());
    addDOMListener("exitPresentationBtn", "click", () => this.exitPresentationMode());

    // Play/Pause y Replay se manejan externamente en main.js

    // Voice select
    addDOMListener("voiceSelect", "change", (e) => {
      const voices = this.speech.voices;
      this.speech.setVoice(voices[e.target.value]);
    });

    // Fullscreen
    this._setupFullscreen();

    // Keyboard (con debounce)
    let escapeTimeout;
    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        clearTimeout(escapeTimeout);
        escapeTimeout = setTimeout(() => {
          if (this._destroyed) return;
          if (this.isPresentationMode) {
            this.exitPresentationMode();
          } else if (this.isFullscreen) {
            this._exitFullscreen();
          }
        }, 100);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    this._domCleanups.push(() => {
      clearTimeout(escapeTimeout);
      document.removeEventListener("keydown", handleKeydown);
    });
  }

  _setupFullscreen() {
    const btn = document.getElementById("fullscreenBtn");
    if (!btn) return;
    
    const handleClick = () => {
      if (this._destroyed) return;
      const newFullscreen = !this.isFullscreen;
      this.state.update({ isFullscreen: newFullscreen });
      this.ui.setFullscreen(newFullscreen);
      btn.innerHTML = newFullscreen 
        ? '<i data-lucide="minimize-2"></i>' 
        : '<i data-lucide="maximize-2"></i>';
      lucide.createIcons();
    };
    
    btn.addEventListener("click", handleClick);
    this._domCleanups.push(() => btn.removeEventListener("click", handleClick));

    const handleFullscreenChange = () => {
      if (this._destroyed) return;
      if (!document.fullscreenElement && this.isFullscreen) {
        this._exitFullscreen();
      }
    };
    
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    this._domCleanups.push(() => document.removeEventListener("fullscreenchange", handleFullscreenChange));
  }

  _exitFullscreen() {
    this.state.update({ isFullscreen: false });
    this.ui.setFullscreen(false);
    const btn = document.getElementById("fullscreenBtn");
    if (btn) {
      btn.innerHTML = '<i data-lucide="maximize-2"></i>';
      lucide.createIcons();
    }
  }

  async _unlockAudio() {
    if (this._destroyed) return;
    await this.audio.unlock();
    this.speech.unlock();
    this.logger.log("Audio desbloqueado ✓");
  }

  async _testSpeak() {
    if (this._destroyed) return;
    const text = "Hola, soy tu asistente virtual. ¿En qué puedo ayudarte?";
    this.ui.setBubble(text);
    if (this.isPresentationMode) this.karaoke.showStatic(text);
    await this.speak(text);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // USE CASE: Speak
  // ═══════════════════════════════════════════════════════════════════════
  
  async speak(text, audioId = null) {
    if (this._destroyed) return;
    if (this.isSpeaking) this.stop();
    this.state.update({ isSpeaking: true });

    const avatar = this._getActiveAvatar();

    try {
      // Audio pregrabado del banco
      if (audioId && this.audioBank[audioId]) {
        const entry = this.audioBank[audioId];
        this.ui.setBubble(entry.text);
        
        this.audio.onPlay = () => {
          if (this._destroyed) return;
          avatar.startLipSync(entry.pauses || []);
          if (this.isPresentationMode) {
            this.karaoke.start(entry.segments);
          }
        };
        
        this.audio.onEnded = () => {
          if (this._destroyed) return;
          avatar.stopLipSync();
          this.karaoke.stop();
          this.state.update({ isSpeaking: false });
          this.telemetry.track(TelemetryEventType.AUDIO_PLAY_END, { audioId });
        };

        await this.audio.play(entry.audio);
        return;
      }

      // TTS (ElevenLabs con fallback a navegador)
      if (text) {
        this.speech.onStart = () => {
          if (this._destroyed) return;
          avatar.startLipSync([]);
        };
        this.speech.onEnd = () => {
          if (this._destroyed) return;
          avatar.stopLipSync();
          this.state.update({ isSpeaking: false });
          
          // Track qué TTS se usó
          const adapter = this.speech.lastUsedAdapter;
          if (adapter === 'browser') {
            this.telemetry.track(TelemetryEventType.TTS_FALLBACK);
          } else {
            this.telemetry.track(TelemetryEventType.TTS_SUCCESS);
          }
        };
        
        await this.speech.speak(text);
      }
    } catch (e) {
      this.logger.error("Error en speak: " + e.message);
      this.state.update({ isSpeaking: false });
      this.telemetry.trackError(e, { context: 'speak', audioId, textLength: text?.length });
    }
  }

  stop() {
    if (this._destroyed) return;
    this.audio.stop();
    this.speech.stop();
    this._getActiveAvatar()?.stopLipSync();
    this.karaoke.stop();
    this.state.update({ isSpeaking: false });
    this.ui.setBubble("En espera…");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // USE CASE: Presentation Mode
  // ═══════════════════════════════════════════════════════════════════════
  
  async enterPresentationMode() {
    if (this._destroyed) return;
    this.logger.log("→ Modo presentación");
    this.state.update({ isPresentationMode: true });
    this.ui.enterPresentationMode();
    this.telemetry.track(TelemetryEventType.PRESENTATION_START);
    
    // Activar wake lock para evitar que se apague la pantalla
    this.wakeLock?.acquire();
    
    // Inicializar Rive de presentación si no está listo
    if (!this.presentationRive.isReady) {
      await this.presentationRive.initialize();
    }
    
    // Precargar todos los audios del banco
    const audioUrls = Object.values(this.audioBank).map(entry => entry.audio);
    await this.audio.preload(audioUrls);
    
    // Configurar progress bar
    const audioIds = this.getAudioIds();
    if (audioIds.length > 0) {
      const items = audioIds.map(id => ({
        id,
        title: this.audioBank[id]?.title || id,
      }));
      this.progress.setItems(items);
      this.progress.setCurrent(this._currentAudioIndex);
      this.progress.show();
    }
  }

  exitPresentationMode() {
    if (this._destroyed) return;
    this.logger.log("← Saliendo de presentación");
    this.state.update({ isPresentationMode: false });
    this.ui.exitPresentationMode();
    this.karaoke.stop();
    this.stop();
    this.telemetry.track(TelemetryEventType.PRESENTATION_END);
    
    // Liberar wake lock
    this.wakeLock?.release();
    
    // Ocultar progress bar
    this.progress.hide();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════
  
  _getActiveAvatar() {
    if (this._destroyed) return null;
    if (this.isPresentationMode) {
      return this.presentationRive;
    }
    return this.panelAvatar;
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Reproduce un audio del banco
   * @param {string} audioId - ID del audio en el banco
   */
  async playAudio(audioId) {
    await this.speak(null, audioId);
  }

  /**
   * Reproduce texto usando TTS
   * @param {string} text - Texto a sintetizar
   */
  async sayText(text) {
    this.ui.setBubble(text);
    await this.speak(text);
  }

  /**
   * Obtiene el estado actual (solo lectura)
   * @returns {Readonly<object>}
   */
  getState() {
    return this.state.state;
  }

  /**
   * Suscribirse a cambios de estado
   * @param {Function} callback
   * @returns {Function} - Unsubscribe function
   */
  onStateChange(callback) {
    return this.state.onChange(callback);
  }

  /**
   * Obtiene métricas de telemetría
   * @returns {object}
   */
  getMetrics() {
    return this.telemetry.getMetrics();
  }

  /**
   * Obtiene las entradas del AudioBank
   * @returns {string[]}
   */
  getAudioIds() {
    return Object.keys(this.audioBank);
  }

  /**
   * Establece el volumen de reproducción
   * @param {number} volume - Volumen entre 0 y 1
   */
  setVolume(volume) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.audio.setVolume?.(clampedVolume);
    this.speech.setVolume?.(clampedVolume);
    this._volume = clampedVolume;
  }

  /**
   * Obtiene el volumen actual
   * @returns {number}
   */
  getVolume() {
    return this._volume ?? 1;
  }

  /**
   * Toggle play/pause
   */
  togglePlay() {
    if (this.isSpeaking) {
      this.stop();
      this.toast?.info('Reproducción pausada');
    } else {
      // Reproducir audio de test o el primero del banco
      const ids = this.getAudioIds();
      if (ids.length > 0) {
        this.playAudio(ids[0]);
      } else {
        this._testSpeak();
      }
    }
  }

  /**
   * Toggle fullscreen
   */
  toggleFullscreen() {
    if (this.isPresentationMode) return; // En presentación, ESC sale
    
    const newFullscreen = !this.isFullscreen;
    this.state.update({ isFullscreen: newFullscreen });
    this.ui.setFullscreen(newFullscreen);
    
    const btn = document.getElementById("fullscreenBtn");
    if (btn) {
      btn.innerHTML = newFullscreen 
        ? '<i data-lucide="minimize-2"></i>' 
        : '<i data-lucide="maximize-2"></i>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  /**
   * Reproduce el siguiente audio del banco
   * @returns {string|null} - ID del audio reproducido
   */
  nextAudio() {
    const ids = this.getAudioIds();
    if (ids.length === 0) {
      this.toast?.warning('No hay audios disponibles');
      return null;
    }
    
    this._currentAudioIndex = (this._currentAudioIndex + 1) % ids.length;
    const audioId = ids[this._currentAudioIndex];
    
    // Actualizar progress si está visible
    this.progress.setCurrent(this._currentAudioIndex);
    
    // Mostrar indicador
    this._showNavIndicator('next', audioId);
    
    this.playAudio(audioId);
    return audioId;
  }

  /**
   * Reproduce el audio anterior del banco
   * @returns {string|null} - ID del audio reproducido
   */
  prevAudio() {
    const ids = this.getAudioIds();
    if (ids.length === 0) {
      this.toast?.warning('No hay audios disponibles');
      return null;
    }
    
    this._currentAudioIndex = (this._currentAudioIndex - 1 + ids.length) % ids.length;
    const audioId = ids[this._currentAudioIndex];
    
    // Actualizar progress si está visible
    this.progress.setCurrent(this._currentAudioIndex);
    
    // Mostrar indicador
    this._showNavIndicator('prev', audioId);
    
    this.playAudio(audioId);
    return audioId;
  }

  /**
   * Obtiene el índice de audio actual
   * @returns {number}
   */
  getCurrentAudioIndex() {
    return this._currentAudioIndex;
  }

  /**
   * Establece el índice de audio actual
   * @param {number} index
   */
  setCurrentAudioIndex(index) {
    const ids = this.getAudioIds();
    if (ids.length > 0) {
      this._currentAudioIndex = Math.max(0, Math.min(index, ids.length - 1));
      this.progress.setCurrent(this._currentAudioIndex);
    }
  }

  /**
   * Muestra indicador de navegación
   * @private
   */
  _showNavIndicator(direction, audioId) {
    // Buscar o crear indicador
    let indicator = document.querySelector(`.audio-nav-indicator.${direction}`);
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = `audio-nav-indicator ${direction}`;
      document.body.appendChild(indicator);
    }
    
    // Obtener título del audio
    const entry = this.audioBank[audioId];
    const title = entry?.title || audioId;
    const icon = direction === 'next' ? 'chevron-right' : 'chevron-left';
    
    indicator.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span>${title}</span>
    `;
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Mostrar y ocultar
    indicator.classList.add('visible');
    clearTimeout(indicator._timeout);
    indicator._timeout = setTimeout(() => {
      indicator.classList.remove('visible');
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Destroy (Cleanup)
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Destruye la aplicación y libera todos los recursos
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    
    this.logger.log("Destruyendo aplicación...");
    
    // 1. Detener todo lo que esté en curso
    this.stop();
    
    // 2. Liberar wake lock
    this.wakeLock?.release();
    
    // 3. Limpiar event listeners del EventBus
    this._eventCleanups.forEach(unsub => {
      try { unsub(); } catch (e) {}
    });
    this._eventCleanups = [];
    
    // 4. Limpiar event listeners del DOM
    this._domCleanups.forEach(cleanup => {
      try { cleanup(); } catch (e) {}
    });
    this._domCleanups = [];
    
    // 5. Destruir adaptadores
    this.webSocket.disconnect();
    this.panelAvatar.destroy();
    this.presentationRive.destroy();
    this.audio.destroy();
    this.karaoke.destroy();
    this.speech.destroy();
    this.telemetry.destroy();
    this.progress.destroy();
    
    // 6. Resetear estado
    this.state.reset();
    
    this.logger.log("✓ Aplicación destruida");
  }
}
