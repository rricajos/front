// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Speech Service (Facade para ElevenLabs + Browser TTS)
// ═══════════════════════════════════════════════════════════════════════════

export class SpeechService {
  constructor(elevenLabsAdapter, ttsAdapter, config, logger) {
    this.elevenLabs = elevenLabsAdapter;
    this.browserTTS = ttsAdapter;
    this.config = config;
    this.logger = logger;
    
    // Callbacks (se propagan a los adaptadores)
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    
    // Estado
    this._isSpeaking = false;
    this._usedAdapter = null; // 'elevenlabs' | 'browser' | null
  }

  /**
   * Sintetiza y reproduce texto
   * Intenta ElevenLabs primero, luego fallback a TTS del navegador
   * @param {string} text - Texto a hablar
   * @returns {Promise<void>}
   */
  async speak(text) {
    if (!text || text.trim() === '') return;
    
    this.stop();
    this._isSpeaking = true;
    
    // Propagar callbacks a los adaptadores
    this._setupCallbacks();

    // Intentar ElevenLabs primero (si está disponible - considera circuit breaker)
    if (this.elevenLabs.isAvailable) {
      try {
        this.logger.log("Intentando ElevenLabs...");
        const success = await this.elevenLabs.speak(text);
        if (success) {
          this._usedAdapter = 'elevenlabs';
          this._isSpeaking = false;
          return;
        }
      } catch (e) {
        this.logger.warn("ElevenLabs falló: " + e.message);
        // Continuar con fallback
      }
    } else if (this.elevenLabs.isConfigured) {
      // Está configurado pero circuit breaker está abierto
      this.logger.log("ElevenLabs: circuit breaker activo, usando fallback");
    }

    // Fallback a TTS del navegador
    if (this.config.USE_BROWSER_TTS_FALLBACK && this.browserTTS.isAvailable) {
      try {
        this.logger.log("Usando TTS del navegador (fallback)");
        this._usedAdapter = 'browser';
        await this.browserTTS.speak(text);
      } catch (e) {
        this.logger.error("TTS navegador falló: " + e.message);
        this.onError?.(e);
      }
    } else {
      this.logger.warn("No hay TTS disponible");
    }
    
    this._isSpeaking = false;
  }

  /**
   * Configura los callbacks en los adaptadores
   * @private
   */
  _setupCallbacks() {
    // ElevenLabs
    this.elevenLabs.onStart = () => {
      this.logger.log("☁️ ElevenLabs: iniciando");
      this.onStart?.();
    };
    this.elevenLabs.onEnd = () => {
      this.logger.log("☁️ ElevenLabs: finalizado");
      this.onEnd?.();
    };
    this.elevenLabs.onError = (e) => this.onError?.(e);

    // Browser TTS
    this.browserTTS.onStart = () => {
      this.logger.log("🔊 TTS navegador: iniciando");
      this.onStart?.();
    };
    this.browserTTS.onEnd = () => {
      this.logger.log("🔊 TTS navegador: finalizado");
      this.onEnd?.();
    };
    this.browserTTS.onError = (e) => this.onError?.(e);
  }

  /**
   * Detiene la síntesis actual
   */
  stop() {
    this.elevenLabs.stop();
    this.browserTTS.stop();
    this._isSpeaking = false;
    this._usedAdapter = null;
  }

  /**
   * Carga las voces disponibles del navegador
   * @returns {SpeechSynthesisVoice[]}
   */
  loadVoices() {
    return this.browserTTS.loadVoices();
  }

  /**
   * Establece la voz del TTS del navegador
   * @param {SpeechSynthesisVoice} voice
   */
  setVoice(voice) {
    this.browserTTS.setVoice(voice);
  }

  /**
   * @returns {SpeechSynthesisVoice[]} - Voces disponibles
   */
  get voices() {
    return this.browserTTS.voices;
  }

  /**
   * @returns {SpeechSynthesisVoice[]} - Voces ordenadas (español primero)
   */
  get sortedVoices() {
    return this.browserTTS.getSortedVoices();
  }

  /**
   * Desbloquea el TTS del navegador
   */
  unlock() {
    this.browserTTS.unlock();
  }

  /**
   * @returns {boolean} - Si está hablando
   */
  get isSpeaking() {
    return this._isSpeaking || this.elevenLabs.isPlaying || this.browserTTS.isSpeaking;
  }

  /**
   * @returns {boolean} - Si ElevenLabs está disponible
   */
  get hasElevenLabs() {
    return this.elevenLabs.isConfigured;
  }

  /**
   * @returns {boolean} - Si el TTS del navegador está disponible
   */
  get hasBrowserTTS() {
    return this.browserTTS.isAvailable;
  }

  /**
   * @returns {string|null} - Adaptador usado en la última síntesis
   */
  get lastUsedAdapter() {
    return this._usedAdapter;
  }

  /**
   * Obtiene estadísticas del circuit breaker de ElevenLabs
   * @returns {object}
   */
  getElevenLabsStats() {
    return this.elevenLabs.getCircuitStats?.() || null;
  }

  /**
   * Resetea el circuit breaker de ElevenLabs
   */
  resetElevenLabsCircuit() {
    this.elevenLabs.resetCircuit?.();
  }

  /**
   * Establece el volumen para ambos adaptadores
   * @param {number} volume - Entre 0 y 1
   */
  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
    this.browserTTS.setVolume?.(this._volume);
    this.elevenLabs.setVolume?.(this._volume);
  }

  /**
   * Obtiene el volumen actual
   * @returns {number}
   */
  getVolume() {
    return this._volume ?? 1;
  }

  /**
   * Destruye el servicio
   */
  destroy() {
    this.stop();
    this.elevenLabs.destroy?.();
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
  }
}
