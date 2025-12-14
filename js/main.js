// ═══════════════════════════════════════════════════════════════════════════
// MAIN - Punto de entrada de la aplicación
// ═══════════════════════════════════════════════════════════════════════════

import RiveCanvas from "https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.21.6/+esm";
import { loadConfig, validateConfig, audioBankLoader, EventBus } from './domain/index.js';
import { SettingsAdapter, ToastAdapter, KeyboardAdapter, WakeLockAdapter } from './infrastructure/index.js';
import { AvatarApplication } from './application/index.js';

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
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
    
    // 3. Botón de settings
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      settings.openPanel();
    });
    
    // 4. Botón de instalar en overlay
    document.getElementById('installAppBtn')?.addEventListener('click', async () => {
      if (settings.canInstall) {
        const installed = await settings.installPWA();
        if (installed) {
          toast.success('¡App instalada correctamente!');
        }
      }
    });
    
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
    
    // 18. Exponer globalmente para debug (solo en desarrollo)
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
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
    
    // Refrescar iconos
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };
  
  // Escuchar cambios de estado de la app
  const checkSpeakingState = () => {
    updatePlayPauseButton(app.isSpeaking);
  };
  
  // Polling simple para detectar cambios (el speech service no tiene eventos públicos)
  let stateCheckInterval = setInterval(checkSpeakingState, 200);
  
  // Play/Pause
  playPauseBtn?.addEventListener('click', async () => {
    if (app.isSpeaking) {
      // Pausar (detener)
      app.stop();
      updatePlayPauseButton(false);
      toast.info('Reproducción detenida');
    } else {
      // Reproducir
      const text = textInput?.value?.trim();
      if (!text) {
        toast.warning('Escribe un texto para reproducir');
        textInput?.focus();
        return;
      }
      
      lastText = text;
      updatePlayPauseButton(true);
      
      try {
        await app.speak(text);  // Solo texto, sin audioId
      } catch (e) {
        toast.error('Error al reproducir');
      }
      
      updatePlayPauseButton(false);
    }
  });
  
  // Replay (reiniciar con el último texto)
  replayBtn?.addEventListener('click', async () => {
    const text = textInput?.value?.trim() || lastText;
    if (!text) {
      toast.warning('No hay texto para reiniciar');
      return;
    }
    
    // Detener si está hablando
    if (app.isSpeaking) {
      app.stop();
    }
    
    lastText = text;
    updatePlayPauseButton(true);
    
    try {
      await app.speak(text);  // Solo texto, sin audioId
    } catch (e) {
      toast.error('Error al reproducir');
    }
    
    updatePlayPauseButton(false);
  });
  
  // Atajo de teclado: Ctrl+Enter para reproducir
  textInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      playPauseBtn?.click();
    }
  });
  
  // Limpiar interval al cerrar (aunque en SPA no se cierra)
  window.addEventListener('beforeunload', () => {
    clearInterval(stateCheckInterval);
  });
}
