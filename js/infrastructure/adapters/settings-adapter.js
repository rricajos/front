// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Settings Adapter (Panel de ajustes)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuración por defecto
 */
const DefaultSettings = {
  theme: 'dark',           // 'dark' | 'light' | 'system'
  subtitlesEnabled: true,
  soundEnabled: true,
  debugPanel: true,
};

/**
 * Adaptador para gestión de ajustes y preferencias
 */
export class SettingsAdapter {
  constructor() {
    this.STORAGE_KEY = 'avatar-settings';
    this._settings = this._load();
    this._listeners = new Set();
    this._panelElement = null;
    this._overlayElement = null;
    
    // Aplicar tema inicial
    this._applyTheme(this._settings.theme);
    
    // Escuchar cambios de tema del sistema
    this._setupSystemThemeListener();
  }

  /**
   * Obtiene todos los ajustes
   * @returns {object}
   */
  get settings() {
    return { ...this._settings };
  }

  /**
   * Obtiene un ajuste específico
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._settings[key];
  }

  /**
   * Actualiza un ajuste
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    const oldValue = this._settings[key];
    this._settings[key] = value;
    this._save();
    
    // Acciones específicas por ajuste
    if (key === 'theme') {
      this._applyTheme(value);
    }
    
    if (key === 'debugPanel') {
      this._toggleDebugPanel(value);
    }
    
    // Notificar listeners
    this._notify(key, value, oldValue);
  }

  /**
   * Suscribirse a cambios
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Carga ajustes desde localStorage
   * @private
   */
  _load() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...DefaultSettings, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('[Settings] Error loading:', e);
    }
    return { ...DefaultSettings };
  }

  /**
   * Guarda ajustes en localStorage
   * @private
   */
  _save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.warn('[Settings] Error saving:', e);
    }
  }

  /**
   * Notifica a los listeners
   * @private
   */
  _notify(key, newValue, oldValue) {
    this._listeners.forEach(cb => {
      try {
        cb({ key, newValue, oldValue, settings: this.settings });
      } catch (e) {
        console.error('[Settings] Listener error:', e);
      }
    });
  }

  /**
   * Aplica el tema
   * @private
   */
  _applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  /**
   * Escucha cambios de tema del sistema
   * @private
   */
  _setupSystemThemeListener() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (this._settings.theme === 'system') {
        this._applyTheme('system');
      }
    });
  }

  /**
   * Toggle del panel de debug
   * @private
   */
  _toggleDebugPanel(visible) {
    const debug = document.getElementById('debug');
    if (debug) {
      debug.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Abre el panel de ajustes
   */
  openPanel() {
    if (this._panelElement) {
      this._panelElement.classList.add('open');
      this._overlayElement?.classList.add('open');
      return;
    }
    
    this._createPanel();
  }

  /**
   * Cierra el panel de ajustes
   */
  closePanel() {
    this._panelElement?.classList.remove('open');
    this._overlayElement?.classList.remove('open');
  }

  /**
   * Toggle del panel
   */
  togglePanel() {
    if (this._panelElement?.classList.contains('open')) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  /**
   * Crea el panel de ajustes en el DOM
   * @private
   */
  _createPanel() {
    // Overlay
    this._overlayElement = document.createElement('div');
    this._overlayElement.className = 'settings-overlay';
    this._overlayElement.onclick = () => this.closePanel();
    document.body.appendChild(this._overlayElement);

    // Panel
    this._panelElement = document.createElement('div');
    this._panelElement.className = 'settings-panel';
    this._panelElement.innerHTML = `
      <div class="settings-header">
        <h2>
          <i data-lucide="settings"></i>
          Ajustes
        </h2>
        <button class="settings-close" id="settingsCloseBtn">
          <i data-lucide="x"></i>
        </button>
      </div>
      
      <div class="settings-content">
        <!-- Tema -->
        <div class="settings-section">
          <h3>Apariencia</h3>
          
          <div class="settings-item">
            <label>Tema</label>
            <div class="theme-selector">
              <button class="theme-btn ${this._settings.theme === 'light' ? 'active' : ''}" data-theme="light">
                <i data-lucide="sun"></i>
                Claro
              </button>
              <button class="theme-btn ${this._settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                <i data-lucide="moon"></i>
                Oscuro
              </button>
              <button class="theme-btn ${this._settings.theme === 'system' ? 'active' : ''}" data-theme="system">
                <i data-lucide="monitor"></i>
                Sistema
              </button>
            </div>
          </div>
        </div>

        <!-- Opciones -->
        <div class="settings-section">
          <h3>Opciones</h3>
          
          <div class="settings-item">
            <label for="subtitlesToggle">Subtítulos</label>
            <label class="toggle">
              <input type="checkbox" id="subtitlesToggle" ${this._settings.subtitlesEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="settings-item">
            <label for="soundToggle">Sonido</label>
            <label class="toggle">
              <input type="checkbox" id="soundToggle" ${this._settings.soundEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="settings-item">
            <label for="debugToggle">Panel de debug</label>
            <label class="toggle">
              <input type="checkbox" id="debugToggle" ${this._settings.debugPanel ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- PWA -->
        <div class="settings-section">
          <h3>Aplicación</h3>
          
          <div class="settings-item install-section" id="installSection" style="display: none;">
            <label>Instalar app</label>
            <button class="install-btn" id="installBtn">
              <i data-lucide="download"></i>
              Instalar
            </button>
          </div>
          
          <div class="settings-item">
            <label>Versión</label>
            <span class="settings-value">2.0.0</span>
          </div>
          
          <div class="settings-item">
            <label>Cache</label>
            <button class="cache-btn" id="clearCacheBtn">
              <i data-lucide="trash-2"></i>
              Limpiar
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this._panelElement);
    
    // Inicializar iconos
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Event listeners
    this._setupPanelEvents();
    
    // Mostrar
    requestAnimationFrame(() => {
      this._panelElement.classList.add('open');
      this._overlayElement.classList.add('open');
    });
  }

  /**
   * Configura eventos del panel
   * @private
   */
  _setupPanelEvents() {
    // Cerrar
    document.getElementById('settingsCloseBtn')?.addEventListener('click', () => {
      this.closePanel();
    });

    // Tema
    this._panelElement.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        this.set('theme', theme);
        
        // Update UI
        this._panelElement.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Toggles
    document.getElementById('subtitlesToggle')?.addEventListener('change', (e) => {
      this.set('subtitlesEnabled', e.target.checked);
    });

    document.getElementById('soundToggle')?.addEventListener('change', (e) => {
      this.set('soundEnabled', e.target.checked);
    });

    document.getElementById('debugToggle')?.addEventListener('change', (e) => {
      this.set('debugPanel', e.target.checked);
    });

    // Clear cache
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage('clearCache');
      }
      // También limpiar localStorage de settings
      // localStorage.removeItem(this.STORAGE_KEY);
      alert('Cache limpiado. Recarga la página.');
    });

    // Install PWA
    document.getElementById('installBtn')?.addEventListener('click', () => {
      this._installPWA();
    });
  }

  /**
   * Configura el prompt de instalación PWA
   * @param {Event} deferredPrompt
   */
  setInstallPrompt(deferredPrompt) {
    this._deferredPrompt = deferredPrompt;
    
    // Mostrar botón de instalar
    const section = document.getElementById('installSection');
    if (section) {
      section.style.display = 'flex';
    }
  }

  /**
   * Instala la PWA
   * @private
   */
  async _installPWA() {
    if (!this._deferredPrompt) {
      alert('La app ya está instalada o no es compatible.');
      return;
    }

    this._deferredPrompt.prompt();
    const { outcome } = await this._deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('[PWA] Usuario aceptó instalar');
    }
    
    this._deferredPrompt = null;
    document.getElementById('installSection').style.display = 'none';
  }

  /**
   * Resetea ajustes a valores por defecto
   */
  reset() {
    this._settings = { ...DefaultSettings };
    this._save();
    this._applyTheme(this._settings.theme);
    this._toggleDebugPanel(this._settings.debugPanel);
  }
}
