// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Karaoke Adapter (Subtítulos sincronizados)
// ═══════════════════════════════════════════════════════════════════════════

export class KaraokeAdapter {
  constructor(subtitleElement, config) {
    this.element = subtitleElement;
    this.config = config;
    this.timer = null;
    this.segments = [];
    this.currentIndex = 0;
    this._destroyed = false;
  }

  /**
   * Inicia la sincronización de subtítulos
   * @param {Array<{text: string, start: number}>} segments - Segmentos con tiempo
   */
  start(segments) {
    if (this._destroyed) return;
    
    this.stop();
    
    this.segments = segments || [];
    if (this.segments.length === 0) return;

    const startTime = performance.now();
    this.currentIndex = 0;

    // Mostrar primer segmento
    this._updateText(this.segments[0].text);
    this.show();

    this.timer = setInterval(() => {
      if (this._destroyed) {
        this.stop();
        return;
      }
      
      const elapsed = performance.now() - startTime;
      let newIndex = 0;
      
      // Encontrar el segmento actual basado en el tiempo
      for (let i = 0; i < this.segments.length; i++) {
        if (elapsed >= this.segments[i].start) {
          newIndex = i;
        }
      }
      
      // Solo actualizar si cambió el índice
      if (newIndex !== this.currentIndex) {
        this.currentIndex = newIndex;
        this._updateText(this.segments[this.currentIndex].text);
      }
    }, this.config.KARAOKE_INTERVAL);
  }

  /**
   * Detiene la sincronización
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.segments = [];
    this.currentIndex = 0;
    this._updateText('');
    this.hide();
  }

  /**
   * Muestra texto estático (sin sincronización)
   * @param {string} text
   */
  showStatic(text) {
    if (this._destroyed) return;
    this.stop();
    this._updateText(text);
    this.show();
  }

  /**
   * Muestra el elemento de subtítulos
   */
  show() {
    if (this.element && !this._destroyed) {
      this.element.classList.add("visible");
    }
  }

  /**
   * Oculta el elemento de subtítulos
   */
  hide() {
    if (this.element) {
      this.element.classList.remove("visible");
    }
  }

  /**
   * Actualiza el texto del subtítulo
   * @private
   */
  _updateText(text) {
    if (this.element && !this._destroyed) {
      this.element.textContent = text;
    }
  }

  /**
   * @returns {boolean} - Si está activo
   */
  get isActive() {
    return this.timer !== null;
  }

  /**
   * @returns {string} - Texto actual
   */
  get currentText() {
    if (this.segments.length > 0 && this.currentIndex < this.segments.length) {
      return this.segments[this.currentIndex].text;
    }
    return '';
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    this._destroyed = true;
    this.stop();
    this.element = null;
  }
}
