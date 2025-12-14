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
  debugPanel: false,       // Desactivado por defecto
  volume: 100,             // 0-100
  ttsProvider: 'elevenlabs', // 'elevenlabs' | 'browser'
  elevenLabsVoiceId: null, // null = usar el de config
  browserVoiceName: null,  // null = auto-seleccionar español
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
    this._deferredPrompt = null;
    this._toast = null; // Referencia a ToastAdapter
    
    // Detectar si está instalado como PWA
    this._isInstalled = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    
    // Aplicar tema inicial
    this._applyTheme(this._settings.theme);
    
    // Aplicar visibilidad del debug panel
    this._toggleDebugPanel(this._settings.debugPanel);
    
    // Escuchar cambios de tema del sistema
    this._setupSystemThemeListener();
    
    // Escuchar cambios en display-mode
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      this._isInstalled = e.matches;
      this._updateInstallUI();
    });
  }

  /**
   * Inyecta el adaptador de toast
   * @param {ToastAdapter} toast
   */
  setToast(toast) {
    this._toast = toast;
  }

  /**
   * Inyecta el servicio de voz para configurar voces
   * @param {SpeechService} speechService
   */
  setSpeechService(speechService) {
    this._speechService = speechService;
  }

  /**
   * Muestra un mensaje (toast si disponible, si no alert)
   * @private
   */
  _notify(message, type = 'info') {
    if (this._toast) {
      this._toast[type]?.(message) || this._toast.info(message);
    } else {
      alert(message);
    }
  }

  /**
   * @returns {boolean} - Si la app está instalada como PWA
   */
  get isInstalled() {
    return this._isInstalled;
  }

  /**
   * @returns {boolean} - Si se puede instalar
   */
  get canInstall() {
    return !!this._deferredPrompt && !this._isInstalled;
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
   * Actualiza el icono de volumen según el nivel
   * @private
   */
  _updateVolumeIcon(volume, iconElement) {
    if (!iconElement) return;
    
    let iconName = 'volume-2';
    if (volume === 0) {
      iconName = 'volume-x';
    } else if (volume < 50) {
      iconName = 'volume-1';
    }
    
    iconElement.setAttribute('data-lucide', iconName);
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  /**
   * Abre el panel de ajustes
   */
  openPanel() {
    if (this._panelElement) {
      this._panelElement.classList.add('open');
      this._overlayElement?.classList.add('open');
      this._updateInstallUI();
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
          
          <div class="settings-item theme-item">
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
          
          <div class="settings-item volume-item">
            <label>Volumen</label>
            <div class="volume-control">
              <i data-lucide="volume-2" id="volumeIcon"></i>
              <input type="range" min="0" max="100" value="${this._settings.volume}" class="volume-slider" id="volumeSlider">
              <span class="volume-value" id="volumeValue">${this._settings.volume}%</span>
            </div>
          </div>
          
          <div class="settings-item">
            <label for="debugToggle">Panel de debug</label>
            <label class="toggle">
              <input type="checkbox" id="debugToggle" ${this._settings.debugPanel ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Voces -->
        <div class="settings-section">
          <h3>Voces</h3>
          
          <div class="settings-item voice-item">
            <label>
              <i data-lucide="mic" class="label-icon"></i>
              Proveedor TTS
            </label>
            <select class="voice-select" id="ttsProviderSelect">
              <option value="elevenlabs" ${this._settings.ttsProvider === 'elevenlabs' ? 'selected' : ''}>☁️ ElevenLabs (IA)</option>
              <option value="browser" ${this._settings.ttsProvider === 'browser' ? 'selected' : ''}>🔊 Navegador (Local)</option>
            </select>
          </div>
          
          <div class="settings-item voice-item" id="voiceItemSettings">
            <label>
              <i data-lucide="volume-2" class="label-icon"></i>
              Voz
            </label>
            <select class="voice-select" id="voiceSelectSettings" disabled>
              <option value="">Cargando...</option>
            </select>
          </div>
          
          <div class="voice-help">
            <i data-lucide="info"></i>
            <span>ElevenLabs ofrece voces de IA de alta calidad. La voz del navegador se usa como respaldo.</span>
          </div>
        </div>

        <!-- PWA -->
        <div class="settings-section">
          <h3>Aplicación</h3>
          
          <div class="settings-item" id="installSettingsItem">
            <label id="installLabel">Instalar app</label>
            <button class="install-btn" id="settingsInstallBtn">
              <i data-lucide="download"></i>
              <span>Instalar</span>
            </button>
          </div>
          
          <div class="install-help" id="installHelp">
            <i data-lucide="info"></i>
            <span>Para instalar necesitas: HTTPS y navegador compatible (Chrome, Edge, Safari)</span>
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
    
    // Actualizar UI de instalación
    this._updateInstallUI();
    
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

    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const volumeIcon = document.getElementById('volumeIcon');
    
    volumeSlider?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      if (volumeValue) volumeValue.textContent = `${value}%`;
      this._updateVolumeIcon(value, volumeIcon);
      this.set('volume', value);
    });

    // Clear cache
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage('clearCache');
      }
      this._notify('Cache limpiado. Recarga la página para aplicar.', 'success');
    });

    // Install/Uninstall PWA
    document.getElementById('settingsInstallBtn')?.addEventListener('click', () => {
      if (this._isInstalled) {
        this._showUninstallInstructions();
      } else {
        this.installPWA();
      }
    });

    // Voice selectors
    document.getElementById('ttsProviderSelect')?.addEventListener('change', (e) => {
      const provider = e.target.value;
      this.set('ttsProvider', provider);
      this._updateVoiceSelector();
      this._notify(`Proveedor TTS: ${provider === 'elevenlabs' ? 'ElevenLabs' : 'Navegador'}`, 'success');
    });

    document.getElementById('voiceSelectSettings')?.addEventListener('change', (e) => {
      const value = e.target.value;
      const provider = this._settings.ttsProvider || 'elevenlabs';
      
      if (provider === 'elevenlabs') {
        this.set('elevenLabsVoiceId', value);
        this._speechService?.elevenLabs?.setVoice(value);
      } else {
        this.set('browserVoiceName', value);
        const voices = this._speechService?.browserTTS?.voices || [];
        const voice = voices.find(v => v.name === value);
        if (voice) this._speechService?.browserTTS?.setVoice(voice);
      }
      this._notify('Voz actualizada', 'success');
    });

    // Cargar voces
    this._loadVoices();
  }

  /**
   * Actualiza el selector de voz según el proveedor seleccionado
   * @private
   */
  _updateVoiceSelector() {
    const select = document.getElementById('voiceSelectSettings');
    const voiceItem = document.getElementById('voiceItemSettings');
    if (!select) return;
    
    const provider = this._settings.ttsProvider || 'elevenlabs';
    
    if (provider === 'elevenlabs') {
      // Mostrar voces de ElevenLabs
      const voices = this._elevenLabsVoices || [];
      
      if (voices.length > 0) {
        const currentVoiceId = this._settings.elevenLabsVoiceId || this._speechService?.elevenLabs?.getSelectedVoiceId();
        select.innerHTML = voices.map(voice => {
          const selected = voice.voice_id === currentVoiceId ? 'selected' : '';
          const category = voice.category ? ` (${voice.category})` : '';
          return `<option value="${voice.voice_id}" ${selected}>${voice.name}${category}</option>`;
        }).join('');
        select.disabled = false;
        voiceItem?.classList.remove('disabled');
      } else {
        const error = this._elevenLabsError;
        const errorMessages = {
          'no_api_key': 'Sin API key',
          'invalid_api_key': 'API key inválida',
          'no_credits': 'Sin créditos',
          'api_error': 'Error de API',
          'network_error': 'Sin conexión',
        };
        select.innerHTML = `<option value="">${errorMessages[error] || 'No disponible'}</option>`;
        select.disabled = true;
        voiceItem?.classList.add('disabled');
      }
    } else {
      // Mostrar voces del navegador
      const voices = this._browserVoices || [];
      
      if (voices.length > 0) {
        const currentVoiceName = this._settings.browserVoiceName || this._speechService?.browserTTS?.selectedVoice?.name;
        select.innerHTML = voices.map(voice => {
          const selected = voice.name === currentVoiceName ? 'selected' : '';
          const lang = voice.lang ? ` [${voice.lang}]` : '';
          return `<option value="${voice.name}" ${selected}>${voice.name}${lang}</option>`;
        }).join('');
        select.disabled = false;
        voiceItem?.classList.remove('disabled');
      } else {
        select.innerHTML = '<option value="">Sin voces</option>';
        select.disabled = true;
        voiceItem?.classList.add('disabled');
      }
    }
  }

  /**
   * Carga las voces disponibles
   * @private
   */
  async _loadVoices() {
    // Inicializar cache
    this._elevenLabsVoices = [];
    this._browserVoices = [];
    this._elevenLabsError = null;
    
    // Cargar voces de ElevenLabs
    if (this._speechService?.elevenLabs) {
      try {
        const voices = await this._speechService.elevenLabs.loadVoices();
        this._elevenLabsVoices = [...voices].sort((a, b) => a.name.localeCompare(b.name));
        this._elevenLabsError = this._speechService.elevenLabs.getLoadError?.() || null;
      } catch (e) {
        this._elevenLabsError = 'network_error';
      }
    } else {
      this._elevenLabsError = 'no_api_key';
    }
    
    // Cargar voces del navegador
    const loadBrowser = () => {
      if (this._speechService?.browserTTS) {
        this._speechService.browserTTS.loadVoices();
        this._browserVoices = this._speechService.browserTTS.getSortedVoices?.() || this._speechService.browserTTS.voices || [];
      }
      this._updateVoiceSelector();
    };
    
    if (window.speechSynthesis?.getVoices().length > 0) {
      loadBrowser();
    } else {
      window.speechSynthesis?.addEventListener('voiceschanged', loadBrowser, { once: true });
      setTimeout(loadBrowser, 1000);
    }
    
    // Actualizar UI inicial
    this._updateVoiceSelector();
  }

  /**
   * Actualiza la UI de instalación en el panel y overlay
   * @private
   */
  _updateInstallUI() {
    // Botón del overlay
    const overlayBtn = document.getElementById('installAppBtn');
    if (overlayBtn) {
      if (this.canInstall) {
        overlayBtn.classList.remove('hidden');
      } else {
        overlayBtn.classList.add('hidden');
      }
    }
    
    // Sección en settings
    const settingsItem = document.getElementById('installSettingsItem');
    const settingsBtn = document.getElementById('settingsInstallBtn');
    const settingsLabel = document.getElementById('installLabel');
    const installHelp = document.getElementById('installHelp');
    
    if (settingsItem && settingsBtn && settingsLabel) {
      settingsItem.style.display = 'flex';
      
      if (this._isInstalled) {
        // App instalada - mostrar opción de desinstalar
        settingsLabel.textContent = 'App instalada ✓';
        settingsBtn.innerHTML = '<i data-lucide="external-link"></i><span>Cómo desinstalar</span>';
        settingsBtn.className = 'uninstall-btn';
        settingsBtn.disabled = false;
        if (installHelp) installHelp.style.display = 'none';
      } else if (this.canInstall) {
        // Se puede instalar
        settingsLabel.textContent = 'Instalar como app';
        settingsBtn.innerHTML = '<i data-lucide="download"></i><span>Instalar</span>';
        settingsBtn.className = 'install-btn';
        settingsBtn.disabled = false;
        if (installHelp) installHelp.style.display = 'none';
      } else {
        // No se puede instalar aún (esperando prompt o navegador no compatible)
        settingsLabel.textContent = 'Instalar como app';
        settingsBtn.innerHTML = '<i data-lucide="download"></i><span>No disponible</span>';
        settingsBtn.className = 'install-btn disabled-btn';
        settingsBtn.disabled = true;
        if (installHelp) installHelp.style.display = 'flex';
      }
      
      // Reinicializar iconos
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }

  /**
   * Configura el prompt de instalación PWA
   * @param {Event} deferredPrompt
   */
  setInstallPrompt(deferredPrompt) {
    this._deferredPrompt = deferredPrompt;
    this._updateInstallUI();
  }

  /**
   * Instala la PWA
   */
  async installPWA() {
    if (!this._deferredPrompt) {
      this._notify('La instalación no está disponible en este navegador.', 'warning');
      return false;
    }

    this._deferredPrompt.prompt();
    const { outcome } = await this._deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('[PWA] Usuario aceptó instalar');
      this._isInstalled = true;
      this._deferredPrompt = null;
      this._updateInstallUI();
      return true;
    }
    
    this._deferredPrompt = null;
    this._updateInstallUI();
    return false;
  }

  /**
   * Muestra instrucciones para desinstalar
  _showUninstallInstructions() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    let instructions = '';
    
    if (isIOS) {
      instructions = `Para desinstalar en iOS:
      
1. Mantén pulsado el icono de la app
2. Toca "Eliminar app" o el icono (-)
3. Confirma la eliminación`;
    } else if (isAndroid) {
      instructions = `Para desinstalar en Android:

1. Mantén pulsado el icono de la app
2. Arrastra a "Desinstalar" o toca "Desinstalar"
3. Confirma la eliminación`;
    } else {
      instructions = `Para desinstalar:

Chrome:
1. Menú (⋮) → "Más herramientas"
2. "Desinstalar Avatar Gespropiedad..."

Edge:
1. Menú (⋯) → "Apps"
2. Clic derecho en la app → "Desinstalar"

O desde la configuración del sistema operativo.`;
    }
    
    alert(instructions);
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
