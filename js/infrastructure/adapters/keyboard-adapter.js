// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Keyboard Adapter (Atajos de teclado)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapa de atajos de teclado
 */
const DEFAULT_SHORTCUTS = {
  ' ': 'toggle-play',           // Space - Play/Pause
  'f': 'toggle-fullscreen',     // F - Fullscreen
  's': 'toggle-settings',       // S - Settings panel
  'm': 'toggle-mute',           // M - Mute/Unmute
  'Escape': 'exit-mode',        // ESC - Exit presentation/fullscreen
  'p': 'toggle-presentation',   // P - Presentation mode
  'ArrowRight': 'next-audio',   // → - Next audio
  'ArrowLeft': 'prev-audio',    // ← - Previous audio
  'ArrowUp': 'volume-up',       // ↑ - Volume up
  'ArrowDown': 'volume-down',   // ↓ - Volume down
  '?': 'show-shortcuts',        // ? - Show shortcuts help
};

/**
 * Adaptador para gestión de atajos de teclado
 */
export class KeyboardAdapter {
  constructor(eventBus, options = {}) {
    this.eventBus = eventBus;
    this.shortcuts = { ...DEFAULT_SHORTCUTS, ...options.shortcuts };
    this._enabled = true;
    this._boundHandler = this._handleKeydown.bind(this);
    
    document.addEventListener('keydown', this._boundHandler);
  }

  /**
   * Maneja eventos de teclado
   * @private
   */
  _handleKeydown(e) {
    if (!this._enabled) return;
    
    // Ignorar si está escribiendo en un input
    const target = e.target;
    if (target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.tagName === 'SELECT' ||
        target.isContentEditable) {
      return;
    }
    
    // Buscar acción para la tecla
    const key = e.key;
    const action = this.shortcuts[key];
    
    if (action) {
      e.preventDefault();
      this.eventBus.emit(`shortcut:${action}`, { key, originalEvent: e });
    }
  }

  /**
   * Habilita los atajos
   */
  enable() {
    this._enabled = true;
  }

  /**
   * Deshabilita los atajos
   */
  disable() {
    this._enabled = false;
  }

  /**
   * Registra un nuevo atajo
   * @param {string} key - Tecla
   * @param {string} action - Nombre de la acción
   */
  register(key, action) {
    this.shortcuts[key] = action;
  }

  /**
   * Elimina un atajo
   * @param {string} key - Tecla
   */
  unregister(key) {
    delete this.shortcuts[key];
  }

  /**
   * Obtiene la lista de atajos para mostrar ayuda
   * @returns {Array<{key: string, action: string, description: string}>}
   */
  getShortcutsList() {
    const descriptions = {
      'toggle-play': 'Reproducir / Pausar',
      'toggle-fullscreen': 'Pantalla completa',
      'toggle-settings': 'Abrir / Cerrar ajustes',
      'toggle-mute': 'Silenciar / Activar sonido',
      'exit-mode': 'Salir del modo actual',
      'toggle-presentation': 'Modo presentación',
      'next-audio': 'Siguiente audio',
      'prev-audio': 'Audio anterior',
      'volume-up': 'Subir volumen',
      'volume-down': 'Bajar volumen',
      'show-shortcuts': 'Mostrar atajos',
    };

    const keyLabels = {
      ' ': 'Espacio',
      'Escape': 'ESC',
      'ArrowRight': '→',
      'ArrowLeft': '←',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
    };

    return Object.entries(this.shortcuts).map(([key, action]) => ({
      key: keyLabels[key] || key.toUpperCase(),
      action,
      description: descriptions[action] || action,
    }));
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    document.removeEventListener('keydown', this._boundHandler);
    this._enabled = false;
  }
}
