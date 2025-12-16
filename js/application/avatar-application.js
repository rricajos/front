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
    this.settings = options.settings || null;
    
    // Audio navigation
    this._currentAudioIndex = 0;
    
    // Audio unlock state
    this._audioUnlocked = false;
    this._pendingMessages = []; // Cola de mensajes antes del desbloqueo
    
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
    this.elevenlabs = new ElevenLabsAdapter(config, this.logger);
    this.speech = new SpeechService(this.elevenlabs, browserTTS, config, this.logger);
    
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
    
    // No sobrescribir el texto inicial del textarea
    lucide.createIcons();
    
    this.logger.log("✓ Aplicación lista");
    this.logger.log(`AudioBank: ${Object.keys(this.audioBank).length} entradas`);
    
    // Log inicial en consola UI
    if (this.settings?.addLog) {
      this.settings.addLog('✓ App iniciada', 'success');
      this.settings.addLog(`AudioBank: ${Object.keys(this.audioBank).length} audios`, 'info');
    }
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
      
      // Si el audio no está desbloqueado, encolar el mensaje
      if (!this._audioUnlocked) {
        this.logger.log("⏸️ Audio no desbloqueado, encolando mensaje");
        this._pendingMessages.push({ audioId, text });
        return;
      }
      
      await this._processMessage({ audioId, text });
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
      // Actualizar debug console
      if (this.settings?.updateDebugStatus) {
        this.settings.updateDebugStatus('ws', 'ok', 'Conectado');
        this.settings.addLog('WebSocket conectado', 'success');
      }
    });
    this._eventCleanups.push(unsub3);
    
    const unsub4 = this.eventBus.on('ws:disconnected', () => {
      this.state.update({ isConnected: false });
      this.telemetry.track(TelemetryEventType.WS_DISCONNECTED);
      // Actualizar debug console
      if (this.settings?.updateDebugStatus) {
        this.settings.updateDebugStatus('ws', 'error', 'Desconectado');
        this.settings.addLog('WebSocket desconectado', 'warning');
      }
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
    if (this._audioUnlocked) return;
    
    await this.audio.unlock();
    this.speech.unlock();
    this._audioUnlocked = true;
    this.logger.log("Audio desbloqueado ✓");
    
    // Log en consola UI
    if (this.settings?.addLog) {
      this.settings.addLog('🔊 Audio desbloqueado', 'success');
    }
    
    // Descartar mensajes pendientes - no reproducir nada automáticamente
    if (this._pendingMessages.length > 0) {
      this.logger.log(`Descartando ${this._pendingMessages.length} mensaje(s) pendiente(s)`);
      this._pendingMessages = [];
    }
  }

  /**
   * Procesa un mensaje de audio/texto del WebSocket
   * @private
   */
  async _processMessage({ audioId, text }) {
    if (this._destroyed) return;
    
    // Log del mensaje recibido
    if (this.settings?.addLog) {
      const msgType = audioId ? `Audio: ${audioId}` : `TTS: "${text?.substring(0, 30)}..."`;
      this.settings.addLog(`📨 Mensaje WS: ${msgType}`, 'info');
    }
    
    // Si hay audioId, SOLO reproducir audio pregrabado (ignorar texto)
    if (audioId) {
      if (!this.audioBank[audioId]) {
        this.logger.log("⏭️ Ignorando audioId desconocido: " + audioId);
        if (this.settings?.addLog) {
          this.settings.addLog(`⚠️ Audio no encontrado: ${audioId}`, 'warning');
        }
        return;
      }
      
      this.state.update({ currentAudioId: audioId });
      this.logger.log("🎬 Reproduciendo: " + audioId);
      this.telemetry.track(TelemetryEventType.AUDIO_PLAY_START, { audioId });
      
      if (audioId === this.config.PRESENTATION_START_ID && this.isPresentationMode) {
        this.ui.showAvatar();
        await this._delay(800);
      }
      
      // SOLO audio pregrabado, sin TTS
      await this.speak(null, audioId);
      
      if (audioId === this.config.PRESENTATION_END_ID && this.isPresentationMode) {
        this.ui.hideAvatar();
      }
      
      // Terminar aquí - NO continuar con TTS
      return;
    }
    
    // SOLO si NO hay audioId, usar TTS
    if (text) {
      this.ui.setBubble(text);
      this.telemetry.track(TelemetryEventType.TTS_REQUEST, { length: text.length });
      await this.speak(text);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // USE CASE: Speak
  // ═══════════════════════════════════════════════════════════════════════
  
  async speak(text, audioId = null, lipSyncText = null) {
    if (this._destroyed) return;
    if (this.isSpeaking) this.stop();
    this.state.update({ isSpeaking: true });

    const avatar = this._getActiveAvatar();

    try {
      // Audio pregrabado del banco
      if (audioId && this.audioBank[audioId]) {
        const entry = this.audioBank[audioId];
        
        // Verificar que entry.audio existe
        if (!entry.audio) {
          this.logger.warn(`AudioBank[${audioId}] sin archivo de audio`);
          // Usar el texto del entry como fallback SOLO si no hay audio
          if (entry.text) {
            this.ui.setBubble(entry.text);
            await this._speakWithTTS(entry.text, avatar, entry.lipSyncText);
          }
          this.state.update({ isSpeaking: false });
          return;
        }
        
        // Activar modo AudioBank en UI
        this.ui.setAudioBankMode(true);
        this.ui.setBubble(entry.text);
        
        // Establecer LipSync text si existe
        if (entry.lipSyncText) {
          this.ui.setLipSyncText(entry.lipSyncText);
        }
        
        // Guardar audioId actual para referencia
        this._currentPlayingAudioId = audioId;
        
        this.logger.log(`Reproduciendo audio pregrabado: ${audioId}`);
        
        // Log en consola UI
        if (this.settings?.addLog) {
          this.settings.addLog(`▶️ Audio: ${audioId}`, 'info');
        }
        
        this.audio.onPlay = () => {
          if (this._destroyed) return;
          avatar.startLipSync(entry.pauses || []);
          if (this.isPresentationMode) {
            this.karaoke.start(entry.segments);
          }
        };
        
        this.audio.onEnded = () => {
          if (this._destroyed) return;
          this.logger.log(`Audio finalizado: ${audioId}`);
          avatar.stopLipSync();
          this.karaoke.stop();
          this.state.update({ isSpeaking: false });
          // Desactivar modo AudioBank
          this.ui.setAudioBankMode(false);
          this._currentPlayingAudioId = null;
          this.telemetry.track(TelemetryEventType.AUDIO_PLAY_END, { audioId });
          // Log en consola UI
          if (this.settings?.addLog) {
            this.settings.addLog(`⏹️ Fin: ${audioId}`, 'info');
          }
        };

        await this.audio.play(entry.audio);
        // NO hacer nada más después de reproducir audio pregrabado
        return;
      }

      // TTS (solo si se pide explícitamente con texto y sin audioId)
      if (text && !audioId) {
        await this._speakWithTTS(text, avatar, lipSyncText);
      } else {
        this.state.update({ isSpeaking: false });
      }
    } catch (e) {
      this.logger.error("Error en speak: " + e.message);
      this.state.update({ isSpeaking: false });
      this.telemetry.trackError(e, { context: 'speak', audioId, textLength: text?.length });
    }
  }

  /**
   * Reproduce texto con TTS
   * @param {string} text - Texto a reproducir
   * @param {AvatarService} avatar - Servicio de avatar para lip-sync
   * @param {string} lipSyncText - Texto con marcadores :: para pausas (opcional)
   * @private
   */
  async _speakWithTTS(text, avatar, lipSyncText = null) {
    this.logger.log(`Usando TTS para: "${text.substring(0, 50)}..."`);
    
    // Verificar que tenemos avatar
    if (!avatar) {
      this.logger.warn("TTS: No hay avatar disponible para LipSync");
    } else {
      const hasMethod = typeof avatar.startLipSync === 'function';
      this.logger.log(`TTS: Avatar tipo=${avatar.constructor?.name}, isReady=${avatar.isReady}, hasStartLipSync=${hasMethod}`);
    }
    
    // Parsear pausas del lipSyncText si existe, si no del texto normal
    const textForPauses = lipSyncText || text;
    const pauseTimestamps = this._parseLipSyncPauses(textForPauses);
    if (pauseTimestamps.length > 0) {
      this.logger.log(`TTS: ${pauseTimestamps.length} pausas detectadas: [${pauseTimestamps.join(', ')}]ms`);
    }
    
    // Log en consola UI
    if (this.settings?.addLog) {
      this.settings.addLog(`🗣️ TTS: "${text.substring(0, 25)}..."`, 'info');
    }
    
    // Crear funciones de callback que capturan las referencias
    const self = this;
    
    this.speech.onStart = function() {
      if (self._destroyed) return;
      self.logger.log("TTS onStart callback ejecutándose");
      
      if (avatar) {
        self.logger.log(`TTS: Intentando iniciar LipSync en avatar`);
        try {
          avatar.startLipSync(pauseTimestamps);
          self.logger.log("TTS: startLipSync llamado correctamente");
        } catch (e) {
          self.logger.error("Error iniciando LipSync: " + e.message);
          console.error(e);
        }
      } else {
        self.logger.warn("TTS: avatar es null en callback");
      }
    };
    
    this.speech.onEnd = function() {
      if (self._destroyed) return;
      self.logger.log("TTS onEnd: deteniendo LipSync");
      
      if (avatar) {
        try {
          avatar.stopLipSync();
        } catch (e) {
          self.logger.error("Error deteniendo LipSync: " + e.message);
        }
      }
      
      self.state.update({ isSpeaking: false });
      
      // Track qué TTS se usó
      const adapter = self.speech.lastUsedAdapter;
      if (adapter === 'browser') {
        self.telemetry.track(TelemetryEventType.TTS_FALLBACK);
        if (self.settings?.addLog) {
          self.settings.addLog('⏹️ TTS fin (navegador)', 'info');
        }
      } else {
        self.telemetry.track(TelemetryEventType.TTS_SUCCESS);
        if (self.settings?.addLog) {
          self.settings.addLog('⏹️ TTS fin (ElevenLabs)', 'success');
        }
      }
    };
    
    await this.speech.speak(text);
  }

  /**
   * Parsea texto con :: para obtener timestamps de pausas
   * @param {string} text - Texto con :: como marcadores de pausa
   * @returns {number[]} - Array de timestamps en ms
   * @private
   */
  _parseLipSyncPauses(text) {
    if (!text || !text.includes('::')) return [];
    
    const pauseTimestamps = [];
    const parts = text.split('::');
    
    // Estimar duración por caracter (aproximadamente 60-80ms por caracter en TTS)
    const msPerChar = 70;
    let accumulatedLength = 0;
    
    for (let i = 0; i < parts.length - 1; i++) {
      accumulatedLength += parts[i].length;
      // El timestamp de la pausa es donde termina cada parte
      pauseTimestamps.push(accumulatedLength * msPerChar);
    }
    
    return pauseTimestamps;
  }

  stop() {
    if (this._destroyed) return;
    this.audio.stop();
    this.speech.stop();
    this._getActiveAvatar()?.stopLipSync();
    this.karaoke.stop();
    this.state.update({ isSpeaking: false });
    // Desactivar modo AudioBank si estaba activo
    this.ui.setAudioBankMode(false);
    this._currentPlayingAudioId = null;
    // No cambiar el texto del textarea al parar
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
    
    // Log en consola UI
    if (this.settings?.addLog) {
      this.settings.addLog('🎬 Modo presentación activado', 'success');
    }
    
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
    
    // Log en consola UI
    if (this.settings?.addLog) {
      this.settings.addLog('🎬 Modo presentación desactivado', 'info');
    }
    
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
   * Solo detiene, no reproduce automáticamente
   */
  togglePlay() {
    if (this.isSpeaking) {
      this.stop();
      this.toast?.info('Reproducción pausada');
    }
    // No reproducir automáticamente - el usuario debe usar el botón Reproducir
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
  // AudioBank Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Obtiene el audioId que se está reproduciendo actualmente
   * @returns {string|null}
   */
  get currentPlayingAudioId() {
    return this._currentPlayingAudioId || null;
  }

  /**
   * Obtiene una entrada del audiobank (con overrides de localStorage)
   * @param {string} audioId
   * @returns {object|null}
   */
  getAudioBankEntry(audioId) {
    const baseEntry = this.audioBank[audioId];
    if (!baseEntry) return null;
    
    // Buscar override en localStorage
    const overrides = this._getAudioBankOverrides();
    const override = overrides[audioId];
    
    if (override) {
      return { ...baseEntry, ...override };
    }
    return baseEntry;
  }

  /**
   * Guarda un override para una entrada del audiobank
   * @param {string} audioId
   * @param {object} data - { text?, lipSyncText? }
   */
  saveAudioBankOverride(audioId, data) {
    const overrides = this._getAudioBankOverrides();
    overrides[audioId] = { ...(overrides[audioId] || {}), ...data };
    localStorage.setItem('audiobank-overrides', JSON.stringify(overrides));
    
    // Actualizar también el audioBank en memoria
    if (this.audioBank[audioId]) {
      Object.assign(this.audioBank[audioId], data);
    }
    
    this.logger.log(`AudioBank[${audioId}] guardado`);
  }

  /**
   * Obtiene overrides del localStorage
   * @private
   */
  _getAudioBankOverrides() {
    try {
      return JSON.parse(localStorage.getItem('audiobank-overrides') || '{}');
    } catch {
      return {};
    }
  }

  /**
   * Genera texto limpio (sin ::) desde lipSyncText
   * @param {string} lipSyncText
   * @returns {string}
   */
  cleanLipSyncText(lipSyncText) {
    return lipSyncText.replace(/::/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Genera audio con ElevenLabs y lo guarda
   * @param {string} audioId - ID del audio en el bank
   * @param {string} text - Texto para generar
   * @returns {Promise<Blob|null>}
   */
  async generateAudio(audioId, text) {
    if (!this.elevenlabs) {
      throw new Error('ElevenLabs no está configurado');
    }
    
    this.logger.log(`Generando audio para: ${audioId}`);
    if (this.settings?.addLog) {
      this.settings.addLog(`🎙️ Generando: ${audioId}...`, 'info');
    }
    
    try {
      const blob = await this.elevenlabs.speak(text);
      
      if (!blob) {
        throw new Error('No se generó audio');
      }
      
      // Crear URL para el blob y guardarlo
      const url = URL.createObjectURL(blob);
      
      // Guardar en audioBank
      if (this.audioBank[audioId]) {
        this.audioBank[audioId].generatedAudio = url;
        this.audioBank[audioId].text = text;
      }
      
      this.logger.log(`Audio generado: ${audioId} (${(blob.size / 1024).toFixed(1)}KB)`);
      if (this.settings?.addLog) {
        this.settings.addLog(`✓ Audio generado: ${(blob.size / 1024).toFixed(1)}KB`, 'success');
      }
      
      return blob;
    } catch (e) {
      this.logger.error(`Error generando audio: ${e.message}`);
      if (this.settings?.addLog) {
        this.settings.addLog(`❌ Error: ${e.message}`, 'error');
      }
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WebSocket Control
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Conecta el WebSocket
   */
  connectWebSocket() {
    if (this._destroyed) return;
    this.webSocket.resetReconnectAttempts();
    this.webSocket.connect();
  }

  /**
   * Desconecta el WebSocket
   */
  disconnectWebSocket() {
    this.webSocket.disconnect();
    this.eventBus.emit('ws:disconnected', { code: 1000 });
  }

  /**
   * @returns {boolean} Estado de conexión del WebSocket
   */
  get isWebSocketConnected() {
    return this.webSocket.isConnected;
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
