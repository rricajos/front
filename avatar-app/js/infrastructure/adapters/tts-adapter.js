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
    
    // Callbacks
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
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
    
    // Filtrar voces Microsoft (causan eco en algunos navegadores)
    this.voices = allVoices.filter(v => 
      !v.name.toLowerCase().includes('microsoft')
    );
    
    // Seleccionar voz española por defecto
    const spanish = this.voices.filter(v => v.lang.startsWith('es'));
    if (spanish.length > 0 && !this.selectedVoice) {
      this.selectedVoice = spanish[0];
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
        resolve();
        return;
      }
      
      // Cancelar cualquier síntesis anterior
      this.stop();
      
      this.currentUtterance = new SpeechSynthesisUtterance(text);
      
      if (this.selectedVoice) {
        this.currentUtterance.voice = this.selectedVoice;
      }
      
      this.currentUtterance.lang = 'es-ES';
      this.currentUtterance.rate = 1.0;
      this.currentUtterance.pitch = 1.0;
      
      this.currentUtterance.onstart = () => {
        this.logger.log("🔊 TTS: reproduciendo");
        this.onStart?.();
      };
      
      this.currentUtterance.onend = () => {
        this.logger.log("🔊 TTS: finalizado");
        this.currentUtterance = null;
        this.onEnd?.();
        resolve();
      };
      
      this.currentUtterance.onerror = (event) => {
        const error = new Error("Error TTS: " + event.error);
        this.logger.error(error.message);
        this.currentUtterance = null;
        this.onError?.(error);
        reject(error);
      };
      
      this.synth.speak(this.currentUtterance);
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
