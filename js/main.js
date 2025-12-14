// ═══════════════════════════════════════════════════════════════════════════
// MAIN - Punto de entrada de la aplicación
// ═══════════════════════════════════════════════════════════════════════════

import RiveCanvas from "https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.21.6/+esm";
import { loadConfig, validateConfig, audioBankLoader } from './domain/index.js';
import { SettingsAdapter } from './infrastructure/index.js';
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
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  try {
    // 1. Registrar Service Worker
    registerServiceWorker();
    
    // 2. Inicializar Settings (tema, preferencias)
    const settings = new SettingsAdapter();
    
    // Botón de settings
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      settings.openPanel();
    });
    
    // Botón de instalar en overlay
    document.getElementById('installAppBtn')?.addEventListener('click', async () => {
      if (settings.canInstall) {
        await settings.installPWA();
      }
    });
    
    // Pasar el prompt de instalación al settings
    if (deferredInstallPrompt) {
      settings.setInstallPrompt(deferredInstallPrompt);
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      settings.setInstallPrompt(e);
    });
    
    // 3. Cargar configuración externa (API keys, etc.)
    const config = await loadConfig('./config.local.json');
    
    // 4. Validar configuración
    const { warnings } = validateConfig(config);
    warnings.forEach(w => console.warn('[Config]', w));
    
    // 5. Intentar cargar AudioBank dinámico (fallback a estático)
    let audioBank = null;
    try {
      audioBank = await audioBankLoader.load('./audio-bank.json');
    } catch (e) {
      console.warn('[AudioBank] Usando banco estático:', e.message);
    }
    
    // 6. Inicializar aplicación
    const app = new AvatarApplication(RiveCanvas, config, {
      audioBank,
      settings,
    });
    await app.initialize();
    
    // 7. Conectar settings con la app
    settings.onChange(({ key, newValue }) => {
      if (key === 'subtitlesEnabled') {
        // Habilitar/deshabilitar subtítulos
        const subtitle = document.getElementById('presentationSubtitle');
        if (subtitle) {
          subtitle.style.display = newValue ? 'block' : 'none';
        }
      }
      if (key === 'soundEnabled' && !newValue) {
        app.stop();
      }
    });
    
    // 8. Exponer globalmente para debug (solo en desarrollo)
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      window.avatarApp = app;
      window.settings = settings;
      window.audioBankLoader = audioBankLoader;
      console.log('[Avatar] App expuesta en window.avatarApp');
    }
    
  } catch (e) {
    console.error("[Avatar] Error fatal:", e);
    // Mostrar error al usuario
    const overlay = document.getElementById('startOverlay');
    if (overlay) {
      overlay.innerHTML = `
        <div style="color: #ef4444; text-align: center; padding: 20px;">
          <h2>Error de inicialización</h2>
          <p>${e.message}</p>
          <button onclick="location.reload()" style="margin-top: 16px; padding: 10px 20px; cursor: pointer;">
            Reintentar
          </button>
        </div>
      `;
    }
  }
})();
