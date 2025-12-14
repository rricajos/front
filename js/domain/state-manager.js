// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN - State Manager (Estado inmutable con eventos)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estado inicial de la aplicación
 */
const InitialState = Object.freeze({
  isPresentationMode: false,
  currentAudioId: null,
  isFullscreen: false,
  isSpeaking: false,
  isConnected: false,
  avatarReady: false,
});

/**
 * Gestor de estado inmutable con notificación de cambios
 */
export class StateManager {
  constructor(eventBus, initialState = InitialState) {
    this._state = Object.freeze({ ...initialState });
    this._eventBus = eventBus;
    this._history = []; // Para debugging
    this._maxHistory = 50;
  }

  /**
   * Obtiene el estado actual (inmutable)
   * @returns {Readonly<object>}
   */
  get state() {
    return this._state;
  }

  /**
   * Obtiene un valor específico del estado
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._state[key];
  }

  /**
   * Actualiza el estado de forma inmutable
   * @param {object} partial - Cambios parciales al estado
   * @returns {Readonly<object>} - Nuevo estado
   */
  update(partial) {
    const oldState = this._state;
    
    // Crear nuevo estado inmutable
    this._state = Object.freeze({
      ...oldState,
      ...partial,
    });

    // Guardar en historial (para debugging)
    this._history.push({
      timestamp: Date.now(),
      changes: partial,
      from: oldState,
      to: this._state,
    });
    
    // Limitar historial
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // Notificar cambios
    this._notifyChanges(oldState, this._state, partial);

    return this._state;
  }

  /**
   * Notifica los cambios a través del EventBus
   * @private
   */
  _notifyChanges(oldState, newState, changes) {
    // Evento general de cambio
    this._eventBus.emit('state:changed', {
      old: oldState,
      new: newState,
      changes,
    });

    // Eventos específicos por cada propiedad cambiada
    for (const [key, value] of Object.entries(changes)) {
      if (oldState[key] !== value) {
        this._eventBus.emit(`state:${key}`, {
          old: oldState[key],
          new: value,
        });
      }
    }
  }

  /**
   * Resetea el estado al inicial
   */
  reset() {
    this.update(InitialState);
  }

  /**
   * Obtiene el historial de cambios (para debugging)
   * @returns {Array}
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Suscribirse a cambios de una propiedad específica
   * @param {string} key - Propiedad a observar
   * @param {Function} callback - Función a ejecutar
   * @returns {Function} - Función para cancelar suscripción
   */
  watch(key, callback) {
    return this._eventBus.on(`state:${key}`, callback);
  }

  /**
   * Suscribirse a cualquier cambio de estado
   * @param {Function} callback
   * @returns {Function}
   */
  onChange(callback) {
    return this._eventBus.on('state:changed', callback);
  }
}

/**
 * Estado inicial exportado para referencia
 */
export { InitialState };
