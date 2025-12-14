// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Audio Adapter (Reproducción de audio)
// ═══════════════════════════════════════════════════════════════════════════

export class AudioAdapter {
  constructor(logger) {
    this.logger = logger;
    this.currentAudio = null;
    this.onPlay = null;
    this.onEnded = null;
    this.onError = null;
    this._destroyed = false;
    this._cleanupFunctions = [];
  }

  /**
   * Reproduce un archivo de audio
   * @param {string} url - URL del archivo de audio
   * @returns {Promise<void>}
   */
  async play(url) {
    if (this._destroyed) return;
    
    this.stop();
    
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.currentAudio = audio;

      const cleanup = () => {
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        // Remover de lista de cleanups
        const idx = this._cleanupFunctions.indexOf(cleanup);
        if (idx > -1) this._cleanupFunctions.splice(idx, 1);
      };

      // Guardar función de cleanup
      this._cleanupFunctions.push(cleanup);

      const handlePlay = () => {
        if (this._destroyed) return;
        const filename = url.split('/').pop();
        this.logger.log("▶ Reproduciendo: " + filename);
        this.onPlay?.();
      };

      const handleEnded = () => {
        cleanup();
        if (!this._destroyed) {
          this.onEnded?.();
        }
        this.currentAudio = null;
        resolve();
      };

      const handleError = (e) => {
        cleanup();
        const error = new Error("Error reproduciendo audio: " + e.message);
        if (!this._destroyed) {
          this.logger.error(error.message);
          this.onError?.(error);
        }
        this.currentAudio = null;
        reject(error);
      };

      audio.addEventListener('play', handlePlay);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);

      audio.src = url;
      audio.play().catch((e) => {
        cleanup();
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
      } catch (e) {
        // Ignorar errores
      }
      this.currentAudio = null;
    }
  }

  /**
   * Desbloquea el audio en navegadores que lo requieren
   * @returns {Promise<boolean>}
   */
  async unlock() {
    if (this._destroyed) return false;
    
    try {
      const silentAudio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleCAHQJnx+aCFNgRDmvz/mXoxBEaZ/P+YdywFR5r8/5d3KgZIm/z/lnkpB0mc/P+VeigISp38/5R7JwlLnfz/k3wmCkye/P+SfSULTZ/8/5F+JAxOoPz/kH8jDU+h/P+PgCIOUKL8/46BIQ9Ro/z/jYIfEFKk/P+MgyAQU6X8/4uEHxFUpvz/ioUeElWn/P+Jhh0TV6j8/4iHHBRYqfz/h4gcFVqq/P+GiRsWW6v8/4WKGhdcrPz/hIoZGF2t/P+DixgZXq78/4KMGB5fr/z/gY0XH2Cw/P+AjhYgYbH8/3+PFSFisfz/fpAUI2Oz/P99kRMkZLT8/3ySEiVltfz/e5MSJGW1");
      silentAudio.volume = 0.01;
      await silentAudio.play();
      silentAudio.pause();
      return true;
    } catch (e) {
      this.logger.warn("No se pudo desbloquear audio: " + e.message);
      return false;
    }
  }

  /**
   * @returns {boolean} - Si hay audio reproduciéndose
   */
  get isPlaying() {
    return this.currentAudio && !this.currentAudio.paused;
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    this._destroyed = true;
    this.stop();
    
    // Ejecutar todas las funciones de cleanup pendientes
    this._cleanupFunctions.forEach(fn => {
      try { fn(); } catch (e) {}
    });
    this._cleanupFunctions = [];
    
    // Limpiar callbacks
    this.onPlay = null;
    this.onEnded = null;
    this.onError = null;
    
    this.logger.log("AudioAdapter destruido");
  }
}
