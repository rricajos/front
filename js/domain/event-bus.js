// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN - Event Bus (Comunicación entre capas)
// ═══════════════════════════════════════════════════════════════════════════

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Suscribirse a un evento
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Función a ejecutar
   * @returns {Function} - Función para cancelar la suscripción
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Retorna función para cancelar suscripción
    return () => this.off(event, callback);
  }

  /**
   * Cancelar suscripción a un evento
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Función a remover
   */
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emitir un evento
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos a enviar
   */
  emit(event, data) {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`Error en listener de "${event}":`, e);
      }
    });
  }

  /**
   * Suscribirse a un evento una sola vez
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Función a ejecutar
   */
  once(event, callback) {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      callback(data);
    });
    return unsubscribe;
  }
}
