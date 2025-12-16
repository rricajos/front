// ═══════════════════════════════════════════════════════════════════════════
// MAIN - Punto de entrada de la aplicación
// ═══════════════════════════════════════════════════════════════════════════

import RiveCanvas from "https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.21.6/+esm";
import { loadConfig, validateConfig, audioBankLoader, EventBus } from './domain/index.js';
import { SettingsAdapter, ToastAdapter, KeyboardAdapter, WakeLockAdapter } from './infrastructure/index.js';
import { AvatarApplication } from './application/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helper para Lucide Icons - solo procesa iconos pendientes
// ═══════════════════════════════════════════════════════════════════════════

function refreshIcons() {
  if (typeof lucide === 'undefined') return;
  
  // Solo procesamos elementos <i> pendientes (los SVG ya convertidos no tienen tag <i>)
  const pendingIcons = document.querySelectorAll('i[data-lucide]');
  if (pendingIcons.length > 0) {
    lucide.createIcons();
    cleanupLucideIcons();
  }
}

// Limpia atributos data-lucide de SVGs ya procesados para evitar warnings
function cleanupLucideIcons() {
  document.querySelectorAll('svg[data-lucide]').forEach(svg => {
    svg.removeAttribute('data-lucide');
  });
}

// Envolver lucide.createIcons para limpiar automáticamente
if (typeof lucide !== 'undefined') {
  const originalCreateIcons = lucide.createIcons.bind(lucide);
  lucide.createIcons = function(options) {
    originalCreateIcons(options);
    cleanupLucideIcons();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PWA - Service Worker Registration
// ═══════════════════════════════════════════════════════════════════════════

let deferredInstallPrompt = null;

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('[PWA] Service Worker registrado:', registration.scope);
      
      // Verificar actualizaciones
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] Nueva versión disponible');
          }
        });
      });
    } catch (e) {
      console.warn('[PWA] Error registrando Service Worker:', e);
    }
  }
}

// Capturar el evento beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  console.log('[PWA] Install prompt capturado');
});

// Detectar instalación exitosa
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  console.log('[PWA] App instalada');
});

// ═══════════════════════════════════════════════════════════════════════════
// Loader helpers
// ═══════════════════════════════════════════════════════════════════════════

function hideLoader() {
  const loader = document.getElementById('appLoader');
  if (loader) {
    loader.classList.add('hiding');
    setTimeout(() => loader.remove(), 300);
  }
}

function showLoaderError(message) {
  const loader = document.getElementById('appLoader');
  if (loader) {
    loader.innerHTML = `
      <div style="color: #ef4444; text-align: center; padding: 20px;">
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
        <h2 style="margin: 0 0 8px 0; font-size: 18px;">Error de carga</h2>
        <p style="margin: 0 0 16px 0; color: var(--text-muted);">${message}</p>
        <button onclick="location.reload()" style="
          padding: 10px 20px; 
          cursor: pointer;
          background: var(--brand-primary);
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 500;
        ">Reintentar</button>
      </div>
    `;
    refreshIcons();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  try {
    // 1. Registrar Service Worker
    registerServiceWorker();
    
    // 2. Inicializar servicios globales
    const eventBus = new EventBus();
    const toast = new ToastAdapter();
    const settings = new SettingsAdapter();
    const keyboard = new KeyboardAdapter(eventBus);
    const wakeLock = new WakeLockAdapter(console);
    
    // Conectar toast con settings
    settings.setToast(toast);
    
    // 3. Botón de settings - respuesta inmediata
    const debugBtn = document.getElementById('debugConsoleBtn');
    if (debugBtn) {
      // Handler único para click
      const handleDebugClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        settings.togglePanel();
      };
      
      debugBtn.addEventListener('click', handleDebugClick);
    } else {
      console.warn('debugConsoleBtn no encontrado');
    }
    
    // 4. Botón de instalar en overlay
    const installOverlayBtn = document.getElementById('installAppBtn');
    if (installOverlayBtn) {
      installOverlayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!settings.canInstall) return;
        
        toast.info('Instalando...');
        settings.installPWA().then(installed => {
          if (installed) {
            toast.success('¡App instalada correctamente!');
          }
        });
      });
    }
    
    // 5. Pasar el prompt de instalación al settings
    if (deferredInstallPrompt) {
      settings.setInstallPrompt(deferredInstallPrompt);
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      settings.setInstallPrompt(e);
    });
    
    // 6. Cargar configuración externa (API keys, etc.)
    const config = await loadConfig('./config.local.json');
    
    // 7. Validar configuración
    const { warnings } = validateConfig(config);
    warnings.forEach(w => console.warn('[Config]', w));
    
    // 8. Intentar cargar AudioBank dinámico (fallback a estático)
    let audioBank = null;
    try {
      audioBank = await audioBankLoader.load('./audio-bank.json');
    } catch (e) {
      console.warn('[AudioBank] Usando banco estático:', e.message);
    }
    
    // 9. Inicializar aplicación
    const app = new AvatarApplication(RiveCanvas, config, {
      audioBank,
      settings,
      eventBus,
      toast,
      wakeLock,
    });
    await app.initialize();
    
    // Actualizar debug console con estados
    settings.updateDebugStatus('avatar', 'ok', 'Listo');
    settings.addLog('Avatar Rive cargado correctamente', 'success');
    
    // Detectar estado de TTS
    const ttsProvider = settings.get('ttsProvider') || 'elevenlabs';
    if (ttsProvider === 'elevenlabs') {
      const elevenLabs = app.speech?.elevenLabs;
      if (elevenLabs?.isReady) {
        settings.updateDebugStatus('tts', 'ok', 'ElevenLabs OK');
        settings.addLog('ElevenLabs conectado', 'success');
      } else {
        settings.updateDebugStatus('tts', 'error', 'ElevenLabs Error');
        settings.addLog('ElevenLabs no disponible', 'warning');
      }
    } else {
      settings.updateDebugStatus('tts', 'ok', 'Navegador OK');
      settings.addLog('TTS del navegador activo', 'success');
    }
    
    // Estado de audio bank
    if (audioBank && Object.keys(audioBank).length > 0) {
      settings.updateDebugStatus('audio', 'ok', `${Object.keys(audioBank).length} audios`);
      settings.addLog(`Audio bank cargado: ${Object.keys(audioBank).length} archivos`, 'success');
    } else {
      settings.updateDebugStatus('audio', '', 'Sin audios');
      settings.addLog('Audio bank vacío o no disponible', 'info');
    }
    
    // 10. Conectar speechService con settings para selector de voces
    settings.setSpeechService(app.speech);
    
    // 11. Aplicar configuración de voces guardada
    if (settings.get('ttsProvider')) {
      app.speech.setProvider(settings.get('ttsProvider'));
    }
    if (settings.get('elevenLabsVoiceId')) {
      app.speech.elevenLabs?.setVoice(settings.get('elevenLabsVoiceId'));
    }
    if (settings.get('browserVoiceName')) {
      const voices = app.speech.browserTTS?.voices || [];
      const voice = voices.find(v => v.name === settings.get('browserVoiceName'));
      if (voice) app.speech.browserTTS?.setVoice(voice);
    }
    
    // 12. Conectar settings con la app
    settings.onChange(({ key, newValue }) => {
      if (key === 'subtitlesEnabled') {
        const subtitle = document.getElementById('presentationSubtitle');
        if (subtitle) {
          subtitle.style.display = newValue ? 'block' : 'none';
        }
      }
      if (key === 'soundEnabled' && !newValue) {
        app.stop();
      }
      if (key === 'volume') {
        app.setVolume(newValue / 100);
      }
      if (key === 'ttsProvider') {
        app.speech.setProvider(newValue);
      }
    });
    
    // 13. Conectar keyboard shortcuts
    eventBus.on('shortcut:toggle-play', () => app.togglePlay?.());
    eventBus.on('shortcut:toggle-fullscreen', () => app.toggleFullscreen?.());
    eventBus.on('shortcut:toggle-settings', () => settings.togglePanel());
    eventBus.on('shortcut:toggle-mute', () => {
      const current = settings.get('soundEnabled');
      settings.set('soundEnabled', !current);
      toast.info(current ? 'Sonido silenciado' : 'Sonido activado');
    });
    eventBus.on('shortcut:exit-mode', () => {
      if (app.isPresentationMode) {
        app.exitPresentationMode();
      } else if (settings._panelElement?.classList.contains('open')) {
        settings.closePanel();
      }
    });
    eventBus.on('shortcut:toggle-presentation', () => {
      if (app.isPresentationMode) {
        app.exitPresentationMode();
      } else {
        app.enterPresentationMode();
      }
    });
    eventBus.on('shortcut:next-audio', () => {
      const id = app.nextAudio();
      if (id) {
        const entry = app.audioBank[id];
        toast.info(`▶ ${entry?.title || id}`);
      }
    });
    eventBus.on('shortcut:prev-audio', () => {
      const id = app.prevAudio();
      if (id) {
        const entry = app.audioBank[id];
        toast.info(`◀ ${entry?.title || id}`);
      }
    });
    eventBus.on('shortcut:volume-up', () => {
      const current = settings.get('volume');
      const newVol = Math.min(100, current + 10);
      settings.set('volume', newVol);
      toast.info(`Volumen: ${newVol}%`);
    });
    eventBus.on('shortcut:volume-down', () => {
      const current = settings.get('volume');
      const newVol = Math.max(0, current - 10);
      settings.set('volume', newVol);
      toast.info(`Volumen: ${newVol}%`);
    });
    eventBus.on('shortcut:show-shortcuts', () => {
      showShortcutsHelp(keyboard);
    });
    
    // 14. Ocultar loader y mostrar app
    hideLoader();
    
    // 15. Aplicar volumen inicial
    app.setVolume(settings.get('volume') / 100);
    
    // 16. Inicializar panel de voz
    initVoicePanel(app, settings, toast);
    
    // 17. Inicializar controles de reproducción
    initPlaybackControls(app, toast);
    
    // 18. Inicializar herramientas de AudioBank
    initAudioBankTools(app, toast);
    
    // 19. Inicializar controles de ajustes en panel principal
    initMainSettings(app, settings, toast);
    
    // 20. Exponer globalmente para debug (solo en desarrollo)
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      window.avatarApp = app;
      window.settings = settings;
      window.toast = toast;
      window.audioBankLoader = audioBankLoader;
      console.log('[Avatar] App expuesta en window.avatarApp');
    }
    
  } catch (e) {
    console.error("[Avatar] Error fatal:", e);
    showLoaderError(e.message);
  }
})();

// ═══════════════════════════════════════════════════════════════════════════
// Shortcuts Help Modal
// ═══════════════════════════════════════════════════════════════════════════

function showShortcutsHelp(keyboard) {
  // Remover modal existente
  document.querySelector('.shortcuts-modal')?.remove();
  document.querySelector('.shortcuts-modal-overlay')?.remove();
  
  const shortcuts = keyboard.getShortcutsList();
  
  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay open';
  overlay.style.zIndex = '20000';
  document.body.appendChild(overlay);
  
  // Modal
  const modal = document.createElement('div');
  modal.className = 'shortcuts-modal';
  modal.innerHTML = `
    <button class="shortcuts-close"><i data-lucide="x"></i></button>
    <h3><i data-lucide="keyboard"></i> Atajos de teclado</h3>
    <div class="shortcuts-list">
      ${shortcuts.map(s => `
        <div class="shortcut-item">
          <span class="shortcut-key">${s.key}</span>
          <span class="shortcut-desc">${s.description}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Inicializar iconos
  refreshIcons();
  
  // Mostrar con animación
  requestAnimationFrame(() => modal.classList.add('visible'));
  
  // Cerrar
  const close = () => {
    modal.classList.remove('visible');
    overlay.classList.remove('open');
    setTimeout(() => {
      modal.remove();
      overlay.remove();
    }, 200);
  };
  
  modal.querySelector('.shortcuts-close').onclick = close;
  overlay.onclick = close;
}

// ═══════════════════════════════════════════════════════════════════════════
// Voice Panel Initialization
// ═══════════════════════════════════════════════════════════════════════════

function initVoicePanel(app, settings, toast) {
  const providerSelect = document.getElementById('ttsProviderSelectPanel');
  const voiceSelect = document.getElementById('voiceSelectPanel');
  const voicePicker = document.getElementById('voicePickerPanel');
  const ttsStatusDot = document.getElementById('ttsStatusDot');
  const ttsStatusText = document.getElementById('ttsStatusText');
  
  // Cache de voces cargadas
  let elevenLabsVoices = [];
  let browserVoices = [];
  let elevenLabsError = null;
  
  // Función para actualizar el estado del TTS
  const updateTTSStatus = () => {
    const provider = settings.get('ttsProvider') || 'elevenlabs';
    
    if (provider === 'elevenlabs') {
      if (elevenLabsVoices.length > 0) {
        setTTSStatus('ok', '☁️ ElevenLabs: Conectado');
      } else if (elevenLabsError === 'no_credits') {
        setTTSStatus('error', '☁️ ElevenLabs: Sin créditos');
      } else if (elevenLabsError === 'invalid_api_key') {
        setTTSStatus('error', '☁️ ElevenLabs: API key inválida');
      } else if (elevenLabsError === 'no_api_key') {
        setTTSStatus('error', '☁️ ElevenLabs: Sin API key');
      } else if (elevenLabsError) {
        setTTSStatus('error', '☁️ ElevenLabs: Error');
      } else {
        setTTSStatus('loading', '☁️ ElevenLabs: Verificando...');
      }
    } else {
      if (browserVoices.length > 0) {
        setTTSStatus('ok', '🔊 Navegador: Listo');
      } else if (app.speech.browserTTS?.isAvailable) {
        setTTSStatus('loading', '🔊 Navegador: Cargando...');
      } else {
        setTTSStatus('error', '🔊 Navegador: No disponible');
      }
    }
  };
  
  const setTTSStatus = (status, text) => {
    if (ttsStatusDot) ttsStatusDot.className = 'tts-status-dot ' + status;
    if (ttsStatusText) ttsStatusText.textContent = text;
  };
  
  // Actualizar selector de voz según proveedor
  const updateVoiceSelector = () => {
    if (!voiceSelect) return;
    
    const provider = settings.get('ttsProvider') || 'elevenlabs';
    
    if (provider === 'elevenlabs') {
      // Mostrar voces de ElevenLabs
      if (elevenLabsVoices.length > 0) {
        const currentVoiceId = settings.get('elevenLabsVoiceId') || app.speech.elevenLabs?.getSelectedVoiceId();
        voiceSelect.innerHTML = elevenLabsVoices.map(voice => {
          const selected = voice.voice_id === currentVoiceId ? 'selected' : '';
          const category = voice.category ? ` (${voice.category})` : '';
          return `<option value="${voice.voice_id}" ${selected}>${voice.name}${category}</option>`;
        }).join('');
        voiceSelect.disabled = false;
        voicePicker?.classList.remove('disabled');
      } else {
        // Error o sin voces
        const errorMessages = {
          'no_api_key': 'Sin API key',
          'invalid_api_key': 'API key inválida',
          'no_credits': 'Sin créditos',
          'api_error': 'Error de API',
          'network_error': 'Sin conexión',
        };
        voiceSelect.innerHTML = `<option value="">${errorMessages[elevenLabsError] || 'No disponible'}</option>`;
        voiceSelect.disabled = true;
        voicePicker?.classList.add('disabled');
      }
    } else {
      // Mostrar voces del navegador
      if (browserVoices.length > 0) {
        const currentVoiceName = settings.get('browserVoiceName') || app.speech.browserTTS?.selectedVoice?.name;
        voiceSelect.innerHTML = browserVoices.map(voice => {
          const selected = voice.name === currentVoiceName ? 'selected' : '';
          const lang = voice.lang ? ` [${voice.lang}]` : '';
          return `<option value="${voice.name}" ${selected}>${voice.name}${lang}</option>`;
        }).join('');
        voiceSelect.disabled = false;
        voicePicker?.classList.remove('disabled');
      } else {
        voiceSelect.innerHTML = '<option value="">Sin voces</option>';
        voiceSelect.disabled = true;
        voicePicker?.classList.add('disabled');
      }
    }
    
    updateTTSStatus();
  };
  
  // Cargar voces de ElevenLabs
  const loadElevenLabsVoices = async () => {
    if (!app.speech.elevenLabs) {
      elevenLabsError = 'no_api_key';
      updateVoiceSelector();
      return;
    }
    
    try {
      const voices = await app.speech.elevenLabs.loadVoices();
      elevenLabsVoices = [...voices].sort((a, b) => a.name.localeCompare(b.name));
      elevenLabsError = app.speech.elevenLabs.getLoadError?.() || null;
    } catch (e) {
      elevenLabsError = 'network_error';
    }
    
    updateVoiceSelector();
  };
  
  // Cargar voces del navegador
  const loadBrowserVoices = () => {
    if (!app.speech.browserTTS) {
      updateVoiceSelector();
      return;
    }
    
    const doLoad = () => {
      app.speech.browserTTS.loadVoices();
      browserVoices = app.speech.browserTTS.getSortedVoices?.() || app.speech.browserTTS.voices || [];
      updateVoiceSelector();
    };
    
    if (window.speechSynthesis?.getVoices().length > 0) {
      doLoad();
    } else {
      window.speechSynthesis?.addEventListener('voiceschanged', doLoad, { once: true });
      setTimeout(doLoad, 1000);
    }
  };
  
  // Event: cambio de proveedor
  providerSelect?.addEventListener('change', (e) => {
    const provider = e.target.value;
    settings.set('ttsProvider', provider);
    app.speech.setProvider(provider);
    updateVoiceSelector();
    
    // Actualizar estado en consola de debug
    const isReady = provider === 'browser' 
      ? app.speech.browserTTS?.isAvailable 
      : app.speech.elevenLabs?.isReady;
    settings.updateTTSProviderStatus(provider, isReady);
    
    toast.info(`Proveedor: ${provider === 'elevenlabs' ? 'ElevenLabs' : 'Navegador'}`);
  });
  
  // Event: cambio de voz
  voiceSelect?.addEventListener('change', (e) => {
    const value = e.target.value;
    const provider = settings.get('ttsProvider') || 'elevenlabs';
    
    if (provider === 'elevenlabs') {
      settings.set('elevenLabsVoiceId', value);
      app.speech.elevenLabs?.setVoice(value);
      toast.success('Voz actualizada');
    } else {
      settings.set('browserVoiceName', value);
      const voice = browserVoices.find(v => v.name === value);
      if (voice) app.speech.browserTTS?.setVoice(voice);
      toast.success('Voz actualizada');
    }
  });
  
  // Sincronizar con settings modal
  settings.onChange(({ key, newValue }) => {
    if (key === 'ttsProvider' && providerSelect) {
      providerSelect.value = newValue;
      updateVoiceSelector();
    }
    if (key === 'elevenLabsVoiceId' || key === 'browserVoiceName') {
      updateVoiceSelector();
    }
  });
  
  // Inicializar
  const currentProvider = settings.get('ttsProvider') || 'elevenlabs';
  if (providerSelect) providerSelect.value = currentProvider;
  
  // Estado inicial
  setTTSStatus('loading', 'TTS: Cargando...');
  if (voiceSelect) {
    voiceSelect.innerHTML = '<option value="">Cargando...</option>';
    voiceSelect.disabled = true;
  }
  
  // Cargar voces
  loadElevenLabsVoices();
  loadBrowserVoices();
}

// ═══════════════════════════════════════════════════════════════════════════
// Playback Controls (Play/Pause, Replay)
// ═══════════════════════════════════════════════════════════════════════════

function initAudioBankTools(app, toast) {
  const toggleLipsyncBtn = document.getElementById('toggleLipsyncBtn');
  const generateAudioBtn = document.getElementById('generateAudioBtn');
  const textInput = document.getElementById('textInput');
  const lipsyncModeLabel = document.getElementById('lipsyncModeLabel');
  const lipsyncHint = document.getElementById('lipsyncHint');
  
  // Estado del modo LipSync
  let isLipsyncMode = false;
  let cleanText = textInput?.value || '';      // Texto sin ::
  let lipSyncText = '';                         // Texto con :: (si existe)
  
  /**
   * Actualiza la UI según el modo
   */
  function updateLipsyncUI() {
    if (isLipsyncMode) {
      lipsyncModeLabel?.removeAttribute('hidden');
      lipsyncHint?.removeAttribute('hidden');
      toggleLipsyncBtn?.classList.add('active');
      textInput?.classList.add('lipsync-mode');
    } else {
      lipsyncModeLabel?.setAttribute('hidden', '');
      lipsyncHint?.setAttribute('hidden', '');
      toggleLipsyncBtn?.classList.remove('active');
      textInput?.classList.remove('lipsync-mode');
    }
  }
  
  /**
   * Limpia :: del texto
   */
  function removePauseMarkers(text) {
    return text.replace(/::/g, '').replace(/\s+/g, ' ').trim();
  }
  
  // Toggle LipSync mode
  toggleLipsyncBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    
    const currentText = textInput?.value || '';
    
    if (!isLipsyncMode) {
      // Cambiando a modo LipSync
      cleanText = currentText;
      
      // Si ya teníamos lipSyncText guardado, mostrarlo; si no, usar el texto actual
      if (lipSyncText) {
        textInput.value = lipSyncText;
      }
      // Si el texto actual no tiene ::, lo dejamos tal cual para que el usuario añada ::
      
      isLipsyncMode = true;
      toast.info('Modo LipSync: usa :: para pausas');
      
      // Log en consola UI
      if (app.settings?.addLog) {
        app.settings.addLog('✏️ Modo LipSync activado', 'info');
      }
    } else {
      // Cambiando a modo normal
      lipSyncText = currentText; // Guardar el texto con ::
      cleanText = removePauseMarkers(currentText);
      textInput.value = cleanText;
      
      // Contar pausas guardadas
      const pauseCount = (lipSyncText.match(/::/g) || []).length;
      
      isLipsyncMode = false;
      toast.info('Modo normal');
      
      // Log en consola UI
      if (app.settings?.addLog) {
        if (pauseCount > 0) {
          app.settings.addLog(`✏️ LipSync guardado: ${pauseCount} pausas`, 'success');
        } else {
          app.settings.addLog('✏️ Modo normal activado', 'info');
        }
      }
    }
    
    updateLipsyncUI();
    refreshIcons();
  });
  
  // Cuando el textarea cambia, actualizar el texto correspondiente
  textInput?.addEventListener('input', () => {
    if (isLipsyncMode) {
      lipSyncText = textInput.value;
      cleanText = removePauseMarkers(textInput.value);
    } else {
      cleanText = textInput.value;
      // Si el usuario añade :: en modo normal, detectarlo
      if (textInput.value.includes('::')) {
        lipSyncText = textInput.value;
      }
    }
  });
  
  // Exponer método para obtener lipSyncText desde fuera
  window.getLipSyncText = () => {
    const currentText = textInput?.value || '';
    // Si está en modo LipSync o el texto tiene ::, devolverlo
    if (isLipsyncMode || currentText.includes('::')) {
      return currentText;
    }
    // Si hay lipSyncText guardado con ::, devolverlo
    if (lipSyncText && lipSyncText.includes('::')) {
      return lipSyncText;
    }
    return null;
  };
  
  // Generar audio con ElevenLabs
  generateAudioBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Obtener texto limpio para TTS
    let text = cleanText || removePauseMarkers(textInput?.value || '');
    
    if (!text) {
      toast.warning('Escribe un texto primero');
      return;
    }
    
    // Verificar si hay API key
    if (!app.config.ELEVENLABS_API_KEY) {
      toast.error('ElevenLabs no configurado');
      return;
    }
    
    // Generar ID único si no hay uno actual
    let audioId = app.currentPlayingAudioId;
    if (!audioId) {
      audioId = 'custom_' + Date.now();
    }
    
    // Confirmar si ya existe audio
    const existingEntry = app.audioBank[audioId];
    if (existingEntry?.audio || existingEntry?.generatedAudio) {
      const confirm = window.confirm(`¿Sobreescribir audio "${existingEntry.title || audioId}"?`);
      if (!confirm) return;
    }
    
    // UI feedback
    generateAudioBtn.disabled = true;
    generateAudioBtn.classList.add('generating');
    const originalText = generateAudioBtn.querySelector('span')?.textContent;
    if (generateAudioBtn.querySelector('span')) {
      generateAudioBtn.querySelector('span').textContent = 'Generando...';
    }
    
    // Log inicio
    if (app.settings?.addLog) {
      app.settings.addLog('✨ Generando audio con ElevenLabs...', 'info');
    }
    
    try {
      const blob = await app.generateAudio(audioId, text);
      
      if (blob) {
        toast.success('Audio generado correctamente');
        
        // Log éxito
        const sizeKB = Math.round(blob.size / 1024);
        if (app.settings?.addLog) {
          app.settings.addLog(`✨ Audio generado: ${sizeKB}KB`, 'success');
        }
        
        // Guardar también el lipSyncText si existe
        const currentLipSync = window.getLipSyncText();
        if (currentLipSync) {
          app.saveAudioBankOverride(audioId, {
            lipSyncText: currentLipSync,
            text: text
          });
        }
      }
    } catch (error) {
      toast.error(error.message || 'Error al generar audio');
      
      // Log error
      if (app.settings?.addLog) {
        app.settings.addLog(`✨ Error: ${error.message}`, 'error');
      }
    } finally {
      generateAudioBtn.disabled = false;
      generateAudioBtn.classList.remove('generating');
      if (generateAudioBtn.querySelector('span')) {
        generateAudioBtn.querySelector('span').textContent = originalText;
      }
    }
  });
}

function initPlaybackControls(app, toast) {
  const playPauseBtn = document.getElementById('playPauseBtn');
  const replayBtn = document.getElementById('replayBtn');
  const textInput = document.getElementById('textInput');
  
  let lastText = textInput?.value || '';
  
  // Actualizar estado del botón play/pause
  const updatePlayPauseButton = (isPlaying) => {
    if (!playPauseBtn) return;
    
    const icon = playPauseBtn.querySelector('i');
    const span = playPauseBtn.querySelector('span');
    
    if (isPlaying) {
      if (icon) icon.setAttribute('data-lucide', 'pause');
      if (span) span.textContent = 'Pausar';
      playPauseBtn.classList.add('playing');
    } else {
      if (icon) icon.setAttribute('data-lucide', 'play');
      if (span) span.textContent = 'Reproducir';
      playPauseBtn.classList.remove('playing');
    }
    
    // Refrescar iconos con requestAnimationFrame para mejor rendimiento
    requestAnimationFrame(() => {
      refreshIcons();
    });
  };
  
  // Polling para sincronizar estado visual
  setInterval(() => updatePlayPauseButton(app.isSpeaking), 250);
  
  // Play/Pause - feedback INMEDIATO, sin await bloqueante
  playPauseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    
    if (app.isSpeaking) {
      // Detener - acción inmediata
      app.stop();
      updatePlayPauseButton(false);
      toast.info('Detenido');
    } else {
      // Obtener texto para TTS (sin :: si está en modo normal)
      let text = textInput?.value?.trim();
      
      // Limpiar :: si existe para el texto que se enviará al TTS
      const cleanText = text ? text.replace(/::/g, '').replace(/\s+/g, ' ').trim() : '';
      
      if (!cleanText) {
        toast.warning('Escribe un texto');
        textInput?.focus();
        return;
      }
      
      // Obtener lipSyncText usando la función global
      const lipSyncText = window.getLipSyncText ? window.getLipSyncText() : 
                          (text.includes('::') ? text : null);
      
      // Feedback visual INMEDIATO
      lastText = cleanText;
      updatePlayPauseButton(true);
      toast.info('Reproduciendo...');
      
      // Ejecutar speak con texto limpio y lipSyncText para pausas
      app.speak(cleanText, null, lipSyncText)
        .catch(e => {
          console.error('Error:', e);
          toast.error('Error al reproducir');
        })
        .finally(() => {
          updatePlayPauseButton(false);
        });
    }
  });
  
  // Replay - feedback INMEDIATO
  replayBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    
    let text = textInput?.value?.trim() || lastText;
    if (!text) {
      toast.warning('No hay texto');
      return;
    }
    
    // Limpiar :: para el texto del TTS
    const cleanText = text.replace(/::/g, '').replace(/\s+/g, ' ').trim();
    
    // Detener si está hablando
    if (app.isSpeaking) {
      app.stop();
    }
    
    // Obtener lipSyncText
    const lipSyncText = window.getLipSyncText ? window.getLipSyncText() : 
                        (text.includes('::') ? text : null);
    
    // Feedback visual INMEDIATO
    lastText = cleanText;
    updatePlayPauseButton(true);
    toast.info('Reiniciando...');
    
    // Pequeño delay y luego speak en background
    setTimeout(() => {
      app.speak(cleanText, null, lipSyncText)
        .catch(e => {
          console.error('Error:', e);
          toast.error('Error al reproducir');
        })
        .finally(() => {
          updatePlayPauseButton(false);
        });
    }, 50);
  });
  
  // Atajo de teclado: Ctrl+Enter para reproducir
  textInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      playPauseBtn?.click();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Mobile Settings
// ═══════════════════════════════════════════════════════════════════════════

function initMobileSettings(settings, toast) {
  const subtitlesToggle = document.getElementById('mobileSubtitlesToggle');
  const soundToggle = document.getElementById('mobileSoundToggle');
  const volumeSlider = document.getElementById('mobileVolumeSlider');
  const volumeValue = document.getElementById('mobileVolumeValue');
  const themeBtns = document.querySelectorAll('.theme-btn-mobile');
  
  // Inicializar valores
  if (subtitlesToggle) subtitlesToggle.checked = settings.get('subtitlesEnabled');
  if (soundToggle) soundToggle.checked = settings.get('soundEnabled');
  if (volumeSlider) {
    volumeSlider.value = settings.get('volume');
    if (volumeValue) volumeValue.textContent = `${settings.get('volume')}%`;
  }
  
  // Marcar tema activo
  const currentTheme = settings.get('theme') || 'system';
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });
  
  // Event listeners
  subtitlesToggle?.addEventListener('change', (e) => {
    settings.set('subtitlesEnabled', e.target.checked);
    toast.info(e.target.checked ? 'Subtítulos activados' : 'Subtítulos desactivados');
  });
  
  soundToggle?.addEventListener('change', (e) => {
    settings.set('soundEnabled', e.target.checked);
    toast.info(e.target.checked ? 'Sonido activado' : 'Sonido silenciado');
  });
  
  volumeSlider?.addEventListener('input', (e) => {
    const vol = parseInt(e.target.value);
    settings.set('volume', vol);
    if (volumeValue) volumeValue.textContent = `${vol}%`;
  });
  
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      settings.set('theme', theme);
      
      // Actualizar clase activa
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      toast.info(`Tema: ${theme === 'dark' ? 'Oscuro' : theme === 'light' ? 'Claro' : 'Sistema'}`);
    });
  });
  
  // Sincronizar con cambios desde el modal de settings
  settings.onChange(({ key, newValue }) => {
    if (key === 'subtitlesEnabled' && subtitlesToggle) {
      subtitlesToggle.checked = newValue;
    }
    if (key === 'soundEnabled' && soundToggle) {
      soundToggle.checked = newValue;
    }
    if (key === 'volume' && volumeSlider) {
      volumeSlider.value = newValue;
      if (volumeValue) volumeValue.textContent = `${newValue}%`;
    }
    if (key === 'theme') {
      themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === newValue);
      });
    }
  });
  
  // Inicializar iconos lucide
  refreshIcons();
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Settings Controls (Panel Principal)
// ═══════════════════════════════════════════════════════════════════════════

function initMainSettings(app, settings, toast) {
  // Theme pills - feedback INMEDIATO con pointerdown
  const themePills = document.querySelectorAll('.theme-pill');
  const currentTheme = settings.get('theme') || 'dark';
  
  themePills.forEach(pill => {
    // Sincronizar estado inicial
    const isActive = pill.dataset.theme === currentTheme;
    pill.classList.toggle('active', isActive);
    pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    
    // Usar pointerdown para respuesta más rápida que click
    const handleThemeChange = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const theme = pill.dataset.theme;
      
      // 1. Feedback visual INMEDIATO - sincrónico
      themePills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-pressed', 'true');
      
      // 2. Aplicar tema inmediatamente
      settings.set('theme', theme);
      
      // 3. Toast después
      toast.info(`Tema: ${theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'}`);
    };
    
    // Responder a pointerdown para máxima velocidad
    pill.addEventListener('pointerdown', handleThemeChange);
    // También click como fallback
    pill.addEventListener('click', (e) => {
      // Evitar doble ejecución si pointerdown ya lo manejó
      if (pill.classList.contains('active') && pill.dataset.theme === settings.get('theme')) {
        e.preventDefault();
        return;
      }
      handleThemeChange(e);
    });
  });
  
  // Subtítulos toggle
  const subtitlesToggle = document.getElementById('subtitlesToggleMain');
  if (subtitlesToggle) {
    subtitlesToggle.checked = settings.get('subtitlesEnabled');
    subtitlesToggle.addEventListener('change', (e) => {
      settings.set('subtitlesEnabled', e.target.checked);
      toast.info(e.target.checked ? 'Subtítulos activados' : 'Subtítulos desactivados');
    });
  }
  
  // Sonido toggle
  const soundToggle = document.getElementById('soundToggleMain');
  if (soundToggle) {
    soundToggle.checked = settings.get('soundEnabled');
    soundToggle.addEventListener('change', (e) => {
      settings.set('soundEnabled', e.target.checked);
      toast.info(e.target.checked ? 'Sonido activado' : 'Sonido desactivado');
    });
  }
  
  // WebSocket toggle
  const wsToggle = document.getElementById('websocketToggleMain');
  if (wsToggle && app) {
    // Función para actualizar el toggle
    const updateWsToggle = () => {
      wsToggle.checked = app.isWebSocketConnected;
    };
    
    // Sincronizar estado inicial con un pequeño delay para que el WS se conecte
    setTimeout(updateWsToggle, 500);
    
    // Escuchar eventos de conexión
    app.eventBus?.on('ws:connected', updateWsToggle);
    app.eventBus?.on('ws:disconnected', updateWsToggle);
    
    wsToggle.addEventListener('change', (e) => {
      e.preventDefault();
      if (e.target.checked) {
        toast.info('Conectando WebSocket...');
        app.connectWebSocket();
      } else {
        app.disconnectWebSocket();
        toast.info('WebSocket desconectado');
      }
    });
  }
  
  // Instalar PWA
  const installBtn = document.getElementById('installBtnMain');
  const installRow = document.getElementById('installRowMain');
  if (installBtn && installRow) {
    // Ocultar si ya está instalada o no se puede instalar
    const updateInstallVisibility = () => {
      if (settings.isInstalled) {
        installRow.style.display = 'none';
      } else if (!settings.canInstall) {
        installBtn.disabled = true;
        installBtn.title = 'Instalación no disponible';
      }
    };
    updateInstallVisibility();
    
    installBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!settings.canInstall) return;
      
      toast.info('Instalando...');
      settings.installPWA().then(installed => {
        if (installed) {
          toast.success('¡App instalada!');
          updateInstallVisibility();
        }
      });
    });
  }
  
  // Limpiar caché
  const clearCacheBtn = document.getElementById('clearCacheBtnMain');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toast.info('Limpiando caché...');
      
      Promise.resolve().then(async () => {
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          localStorage.clear();
          toast.success('Caché limpiada. Recargando...');
          setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
          toast.error('Error al limpiar caché');
        }
      });
    });
  }
  
  // Sincronizar con cambios externos
  settings.onChange(({ key, newValue }) => {
    if (key === 'theme') {
      themePills.forEach(p => p.classList.toggle('active', p.dataset.theme === newValue));
    }
    if (key === 'subtitlesEnabled' && subtitlesToggle) {
      subtitlesToggle.checked = newValue;
    }
    if (key === 'soundEnabled' && soundToggle) {
      soundToggle.checked = newValue;
    }
  });
  
  // Inicializar iconos
  refreshIcons();
}
