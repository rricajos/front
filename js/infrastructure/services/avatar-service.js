// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Avatar Service (Facade para Rive + CSS Fallback)
// ═══════════════════════════════════════════════════════════════════════════

export class AvatarService {
  constructor(riveAdapter, cssAdapter, ui, logger) {
    this.rive = riveAdapter;
    this.css = cssAdapter;
    this.ui = ui;
    this.logger = logger;
    this._useRive = false;
    this._initialized = false;
    this._destroyed = false;
  }

  /**
   * Inicializa el servicio de avatar
   * @returns {Promise<boolean>} - true si Rive cargó correctamente
   */
  async initialize() {
    if (this._destroyed) return false;
    if (this._initialized) return this._useRive;
    
    const success = await this.rive.initialize();
    this._useRive = success;
    this._initialized = true;
    
    if (success) {
      this.ui.showRiveAvatar();
      this.ui.setStatus("Avatar listo", "ok");
      this.logger.log("✓ Usando Rive");
    } else {
      this.ui.showCSSAvatar();
      this.ui.setStatus("CSS fallback", "error");
      this.logger.log("⚠️ Usando CSS fallback");
    }
    
    return success;
  }

  /**
   * @returns {boolean} - Si el avatar está listo
   */
  get isReady() {
    if (this._destroyed) return false;
    return this._useRive ? this.rive.isReady : this.css.isReady;
  }

  /**
   * @returns {boolean} - Si está usando Rive
   */
  get isUsingRive() {
    return this._useRive;
  }

  /**
   * Obtiene el adaptador activo
   * @returns {RiveAdapter|CSSAvatarAdapter}
   */
  get activeAdapter() {
    return this._useRive ? this.rive : this.css;
  }

  /**
   * Inicia lip-sync
   * @param {number[]} pauseTimestamps - Timestamps de pausas en ms
   */
  startLipSync(pauseTimestamps = []) {
    if (this._destroyed) {
      this.logger.warn("AvatarService: startLipSync en servicio destruido");
      return;
    }
    this.logger.log(`AvatarService: startLipSync (usando ${this._useRive ? 'Rive' : 'CSS'})`);
    this.activeAdapter.startLipSync(pauseTimestamps);
  }

  /**
   * Detiene lip-sync
   */
  stopLipSync() {
    if (this._destroyed) return;
    this.activeAdapter.stopLipSync();
  }

  /**
   * Destruye el servicio y libera recursos
   */
  destroy() {
    this._destroyed = true;
    
    if (this.rive) {
      this.rive.destroy();
      this.rive = null;
    }
    
    if (this.css) {
      this.css.destroy();
      this.css = null;
    }
    
    this.logger.log("AvatarService destruido");
  }
}
