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
    
    // 16. Exponer globalmente para debug (solo en desarrollo)
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
