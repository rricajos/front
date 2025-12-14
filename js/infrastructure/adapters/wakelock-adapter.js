// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - WakeLock Adapter (Evitar apagado de pantalla)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adaptador para mantener la pantalla encendida durante presentaciones
 * Usa la Screen Wake Lock API
 */
export class WakeLockAdapter {
  constructor(logger) {
    this.logger = logger;
    this._wakeLock = null;
    this._isSupported = 'wakeLock' in navigator;
    
    // Re-adquirir wake lock cuando la pestaña vuelve a ser visible
    this._boundVisibilityHandler = this._handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this._boundVisibilityHandler);
    
    if (!this._isSupported) {
      this.logger?.warn('[WakeLock] No soportado en este navegador');
    }
  }

  /**
   * @returns {boolean} - Si el wake lock está activo
   */
  get isActive() {
    return this._wakeLock !== null && !this._wakeLock.released;
  }

  /**
   * @returns {boolean} - Si el navegador soporta Wake Lock API
   */
  get isSupported() {
    return this._isSupported;
  }

  /**
   * Adquiere el wake lock (mantiene la pantalla encendida)
   * @returns {Promise<boolean>} - Si se adquirió exitosamente
   */
  async acquire() {
    if (!this._isSupported) {
      return false;
    }

    if (this.isActive) {
      return true; // Ya está activo
    }

    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      
      this._wakeLock.addEventListener('release', () => {
        this.logger?.log('[WakeLock] Liberado');
        this._wakeLock = null;
      });
      
      this.logger?.log('[WakeLock] ✓ Pantalla bloqueada');
      return true;
    } catch (e) {
      this.logger?.warn('[WakeLock] No se pudo adquirir:', e.message);
      this._wakeLock = null;
      return false;
    }
  }

  /**
   * Libera el wake lock (permite apagado de pantalla)
   * @returns {Promise<void>}
   */
  async release() {
    if (!this._wakeLock) {
      return;
    }

    try {
      await this._wakeLock.release();
      this._wakeLock = null;
      this.logger?.log('[WakeLock] Pantalla desbloqueada');
    } catch (e) {
      this.logger?.warn('[WakeLock] Error al liberar:', e.message);
    }
  }

  /**
   * Maneja cambios de visibilidad de la pestaña
   * Re-adquiere el wake lock si la pestaña vuelve a ser visible
   * @private
   */
  async _handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this._wakeLock?.released) {
      // La pestaña volvió a ser visible y el wake lock fue liberado
      // Intentar re-adquirir
      await this.acquire();
    }
  }

  /**
   * Destruye el adaptador
   */
  async destroy() {
    document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
    await this.release();
  }
}
