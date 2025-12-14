// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - ElevenLabs Adapter (Cloud TTS)
// ═══════════════════════════════════════════════════════════════════════════

import { withRetry } from '../utils/retry.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

export class ElevenLabsAdapter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.currentAudio = null;
    this._destroyed = false;
    
    // Circuit Breaker para proteger contra fallos repetidos
    this.circuitBreaker = new CircuitBreaker({
      name: 'ElevenLabs',
      failureThreshold: 3,
      resetTimeout: 60000, // 1 minuto
      onStateChange: (newState, oldState) => {
        this.logger.log(`ElevenLabs circuit: ${oldState} → ${newState}`);
      }
    });
    
    // Configuración de retry
    this.retryOptions = {
      maxAttempts: 2,
      baseDelay: 1000,
      maxDelay: 5000,
      shouldRetry: (error) => {
        // Solo reintentar errores de red, no errores 4xx
        if (error.status && error.status >= 400 && error.status < 500) {
          return false;
        }
        return true;
      },
      onRetry: (error, attempt, delay) => {
        this.logger.log(`ElevenLabs: reintento ${attempt} en ${Math.round(delay)}ms`);
      }
    };
    
    // Callbacks
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
  }

  /**
   * @returns {boolean} - Si ElevenLabs está configurado
   */
  get isConfigured() {
    return !!(this.config.ELEVENLABS_API_KEY && this.config.ELEVENLABS_VOICE_ID);
  }

  /**
   * @returns {boolean} - Si el circuit breaker permite llamadas
   */
  get isAvailable() {
    return this.isConfigured && this.circuitBreaker.isAllowed;
  }

  /**
   * Sintetiza y reproduce texto usando ElevenLabs
   * @param {string} text - Texto a sintetizar
   * @returns {Promise<boolean>} - true si tuvo éxito
   */
  async speak(text) {
    if (this._destroyed) return false;
    
    if (!this.isConfigured) {
      this.logger.warn("ElevenLabs no configurado");
      return false;
    }
    
    if (!text || text.trim() === '') {
      return false;
    }

    // Verificar circuit breaker
    if (!this.circuitBreaker.isAllowed) {
      this.logger.warn("ElevenLabs: circuit breaker abierto, usando fallback");
      return false;
    }

    try {
      // Ejecutar con circuit breaker y retry
      return await this.circuitBreaker.execute(() => 
        withRetry(() => this._generateAndPlay(text), this.retryOptions)
      );
    } catch (e) {
      this.logger.error("ElevenLabs error: " + e.message);
      return false;
    }
  }

  /**
   * Genera y reproduce el audio
   * @private
   */
  async _generateAndPlay(text) {
    this.logger.log("☁️ ElevenLabs: generando audio...");
    
    // Crear AbortController para timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.config.ELEVENLABS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": this.config.ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: this.config.ELEVENLABS_MODEL,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const error = new Error(`API respondió ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return await this._playAudio(audioUrl);
    } catch (e) {
      clearTimeout(timeout);
      
      if (e.name === 'AbortError') {
        throw new Error('Timeout de API');
      }
      throw e;
    }
  }

  /**
   * Reproduce el audio generado
   * @private
   */
  _playAudio(audioUrl) {
    return new Promise((resolve, reject) => {
      if (this._destroyed) {
        URL.revokeObjectURL(audioUrl);
        resolve(false);
        return;
      }

      this.stop();
      
      this.currentAudio = new Audio(audioUrl);
      
      this.currentAudio.onplay = () => {
        if (this._destroyed) return;
        this.logger.log("☁️ ElevenLabs: reproduciendo");
        this.onStart?.();
      };
      
      this.currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        if (!this._destroyed) {
          this.onEnd?.();
        }
        resolve(true);
      };
      
      this.currentAudio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        const error = new Error("Error reproduciendo audio ElevenLabs");
        this.logger.error(error.message);
        this.currentAudio = null;
        if (!this._destroyed) {
          this.onError?.(error);
        }
        reject(error);
      };
      
      this.currentAudio.play().catch((e) => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        reject(e);
      });
    });
  }

  /**
   * Detiene la reproducción actual
   */
  stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = '';
      } catch (e) {}
      this.currentAudio = null;
    }
  }

  /**
   * @returns {boolean} - Si está reproduciendo
   */
  get isPlaying() {
    return this.currentAudio && !this.currentAudio.paused;
  }

  /**
   * Obtiene estadísticas del circuit breaker
   */
  getCircuitStats() {
    return this.circuitBreaker.stats;
  }

  /**
   * Resetea el circuit breaker (para admin/debug)
   */
  resetCircuit() {
    this.circuitBreaker.forceReset();
    this.logger.log("ElevenLabs: circuit breaker reseteado");
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    this._destroyed = true;
    this.stop();
    this.circuitBreaker.destroy();
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
  }
}
