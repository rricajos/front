// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN - Logger
// ═══════════════════════════════════════════════════════════════════════════

export class Logger {
  constructor(debugElement = null) {
    this.debugElement = debugElement;
    this.prefix = "[Avatar]";
    this.maxLogLength = 500;
  }

  /**
   * Log de información general
   * @param {string} msg - Mensaje a mostrar
   */
  log(msg) {
    console.log(this.prefix, msg);
    this._updateDebugElement(msg);
  }

  /**
   * Log de error
   * @param {string} msg - Mensaje de error
   * @param {Error} [error] - Objeto de error opcional
   */
  error(msg, error = null) {
    console.error(this.prefix, msg, error || "");
    this._updateDebugElement(`❌ ${msg}`);
  }

  /**
   * Log de advertencia
   * @param {string} msg - Mensaje de advertencia
   */
  warn(msg) {
    console.warn(this.prefix, msg);
    this._updateDebugElement(`⚠️ ${msg}`);
  }

  /**
   * Log de debug (solo en desarrollo)
   * @param {string} msg - Mensaje de debug
   */
  debug(msg) {
    if (import.meta.env?.DEV || location.hostname === "localhost") {
      console.debug(this.prefix, msg);
    }
  }

  /**
   * Actualiza el elemento de debug en el DOM
   * @private
   */
  _updateDebugElement(msg) {
    if (this.debugElement) {
      const time = new Date().toLocaleTimeString("es", { hour12: false });
      const newContent = `[${time}] ${msg}\n` + this.debugElement.textContent;
      this.debugElement.textContent = newContent.slice(0, this.maxLogLength);
    }
  }

  /**
   * Establece el elemento de debug
   * @param {HTMLElement} element - Elemento del DOM
   */
  setDebugElement(element) {
    this.debugElement = element;
  }
}
