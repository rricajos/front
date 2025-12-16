// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - TTS Adapter (Browser Speech Synthesis)
// ═══════════════════════════════════════════════════════════════════════════

export class TTSAdapter {
  constructor(logger) {
    this.logger = logger;
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.selectedVoice = null;
    this.currentUtterance = null;
    this._volume = 1;
    this._isReady = false;
    
    // Callbacks
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    
    // Inicializar voces cuando estén listas
    this._initVoices();
  }
  
  /**
   * Inicializa las voces (espera a que estén disponibles)
   * @private
   */
  _initVoices() {
    if (!this.synth) return;
    
    // Cargar voces inmediatamente
    this.loadVoices();
    
    // Chrome necesita esperar al evento voiceschanged
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => {
        this.loadVoices();
        this._isReady = true;
      };
    }
    
    // Workaround para Chrome: warmup del synth
    this._warmupSynth();
  }
  
  /**
   * Workaround para Chrome: hace un "warmup" del synth
   * @private
   */
  _warmupSynth() {
    if (!this.synth) return;
    
    // Cancelar cualquier cosa pendiente
    this.synth.cancel();
    
    // Crear un utterance vacío para "despertar" el synth
    const warmup = new SpeechSynthesisUtterance('');
    warmup.volume = 0;
    this.synth.speak(warmup);
    this.synth.cancel();
  }

  /**
   * Establece el volumen
   * @param {number} volume - Entre 0 y 1
   */
  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.currentUtterance) {
      this.currentUtterance.volume = this._volume;
    }
  }

  /**
   * Obtiene el volumen actual
   * @returns {number}
   */
  getVolume() {
    return this._volume;
  }

  /**
   * Carga las voces disponibles
   * @returns {SpeechSynthesisVoice[]}
   */
  loadVoices() {
    if (!this.synth) {
      this.logger.warn("Speech Synthesis no disponible");
      return [];
    }

    const allVoices = this.synth.getVoices();
    
    // Usar todas las voces disponibles (el filtro de Microsoft causaba problemas)
    this.voices = allVoices;
    
    // Seleccionar voz española por defecto
    const spanish = this.voices.filter(v => v.lang.startsWith('es'));
    if (spanish.length > 0 && !this.selectedVoice) {
      // Preferir voces de Google si están disponibles
      const googleSpanish = spanish.find(v => v.name.toLowerCase().includes('google'));
      this.selectedVoice = googleSpanish || spanish[0];
    } else if (!this.selectedVoice && this.voices.length > 0) {
      this.selectedVoice = this.voices[0];
    }
    
    return this.voices;
  }

  /**
   * Establece la voz a usar
   * @param {SpeechSynthesisVoice} voice
   */
  setVoice(voice) {
    this.selectedVoice = voice;
  }

  /**
   * Sintetiza y reproduce texto
   * @param {string} text - Texto a hablar
   * @returns {Promise<void>}
   */
  speak(text) {
    return new Promise((resolve, reject) => {
      if (!this.synth) {
        reject(new Error("Speech Synthesis no disponible"));
        return;
      }
      
      if (!text || text.trim() === '') {
        this.logger.warn("TTS: texto vacío, ignorando");
        resolve();
        return;
      }
      
      this.logger.log(`TTS: preparando "${text.substring(0, 30)}..."`);
      
      // Cancelar cualquier síntesis anterior
      this.stop();
      
      // Workaround para Chrome: cancelar y esperar
      this.synth.cancel();
      
      // Pequeño delay para que Chrome procese el cancel
      setTimeout(() => {
        // Verificar voces
        if (this.voices.length === 0) {
          this.loadVoices();
        }
        
        this.currentUtterance = new SpeechSynthesisUtterance(text);
        
        // Usar voz seleccionada o la primera española disponible
        let voiceToUse = this.selectedVoice;
        if (!voiceToUse && this.voices.length > 0) {
          // Buscar una voz española primero
          voiceToUse = this.voices.find(v => v.lang.startsWith('es')) || this.voices[0];
        }
        
        if (voiceToUse) {
          this.currentUtterance.voice = voiceToUse;
          this.logger.log(`TTS: usando voz "${voiceToUse.name}"`);
        } else {
          this.logger.warn("TTS: sin voz seleccionada, usando default");
        }
        
        this.currentUtterance.lang = 'es-ES';
        this.currentUtterance.rate = 1.0;
        this.currentUtterance.pitch = 1.0;
        this.currentUtterance.volume = this._volume;
        
        let hasStarted = false;
        let startTime = Date.now();
        let retryCount = 0;
        const maxRetries = 3;
        
        const attemptSpeak = () => {
          this.synth.speak(this.currentUtterance);
          
          // Workaround para Chrome: resume si está pausado
          if (this.synth.paused) {
            this.logger.log("TTS: resumiendo synth pausado");
            this.synth.resume();
          }
        };
        
        this.currentUtterance.onstart = () => {
          hasStarted = true;
          this.logger.log("🔊 TTS: reproduciendo");
          this.onStart?.();
        };
        
        this.currentUtterance.onend = () => {
          const duration = Date.now() - startTime;
          
          // Si terminó muy rápido sin empezar, reintentar
          if (!hasStarted && duration < 100 && retryCount < maxRetries) {
            retryCount++;
            this.logger.warn(`TTS: terminó sin reproducir, reintento ${retryCount}/${maxRetries}`);
            this.synth.cancel();
            setTimeout(() => {
              if (this.currentUtterance) {
                attemptSpeak();
              }
            }, 150 * retryCount); // Incrementar delay en cada reintento
            return;
          }
          
          if (!hasStarted) {
            this.logger.warn(`TTS: falló después de ${retryCount} reintentos`);
          } else {
            this.logger.log(`🔊 TTS: finalizado (${duration}ms)`);
          }
          
          this.onEnd?.();
          this.currentUtterance = null;
          resolve();
        };
        
        this.currentUtterance.onerror = (event) => {
          // Ignorar errores de "interrupted" que ocurren al cancelar
          if (event.error === 'interrupted' || event.error === 'canceled') {
            this.logger.log("TTS: interrumpido (normal)");
            this.currentUtterance = null;
            resolve();
            return;
          }
          const error = new Error("Error TTS: " + event.error);
          this.logger.error(error.message);
          this.currentUtterance = null;
          this.onError?.(error);
          reject(error);
        };
        
        // Primer intento
        attemptSpeak();
        
        // Workaround: Chrome a veces necesita un "empujón"
        // Si después de 500ms no ha empezado, reintentar
        const retryTimeout = setTimeout(() => {
          if (!hasStarted && this.currentUtterance && retryCount < maxRetries) {
            retryCount++;
            this.logger.warn(`TTS: no inició en 500ms, reintento ${retryCount}/${maxRetries}`);
            this.synth.cancel();
            setTimeout(() => {
              if (this.currentUtterance && !hasStarted) {
                attemptSpeak();
              }
            }, 100);
          }
        }, 500);
        
        // Limpiar timeout cuando termine
        const originalOnEnd = this.currentUtterance.onend;
        this.currentUtterance.onend = (e) => {
          clearTimeout(retryTimeout);
          originalOnEnd(e);
        };
        
      }, 150); // Aumentado el delay inicial para Chrome
    });
  }

  /**
   * Detiene la síntesis actual
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
  }

  /**
   * Desbloquea el TTS (necesario en algunos navegadores)
   */
  unlock() {
    if (this.synth) {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      this.synth.speak(u);
      this.synth.cancel();
    }
  }

  /**
   * @returns {boolean} - Si el TTS está disponible
   */
  get isAvailable() {
    return !!this.synth;
  }

  /**
   * @returns {boolean} - Si está hablando actualmente
   */
  get isSpeaking() {
    return this.synth?.speaking || false;
  }

  /**
   * Obtiene voces ordenadas (español primero)
   * @returns {SpeechSynthesisVoice[]}
   */
  getSortedVoices() {
    const spanish = this.voices.filter(v => v.lang.startsWith('es'));
    const others = this.voices.filter(v => !v.lang.startsWith('es'));
    return [...spanish, ...others];
  }
}
