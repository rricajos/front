// ═══════════════════════════════════════════════════════════════════════════
// MAIN - Punto de entrada de la aplicación
// ═══════════════════════════════════════════════════════════════════════════

import RiveCanvas from "https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.21.6/+esm";
import { loadConfig, validateConfig, audioBankLoader } from './domain/index.js';
import { AvatarApplication } from './application/index.js';

// Bootstrap
(async () => {
  try {
    // 1. Cargar configuración externa (API keys, etc.)
    const config = await loadConfig('./config.local.json');
    
    // 2. Validar configuración
    const { warnings } = validateConfig(config);
    warnings.forEach(w => console.warn('[Config]', w));
    
    // 3. Intentar cargar AudioBank dinámico (fallback a estático)
    let audioBank = null;
    try {
      audioBank = await audioBankLoader.load('./audio-bank.json');
    } catch (e) {
      console.warn('[AudioBank] Usando banco estático:', e.message);
    }
    
    // 4. Inicializar aplicación
    const app = new AvatarApplication(RiveCanvas, config, {
      audioBank, // null = usar estático
    });
    await app.initialize();
    
    // 5. Exponer globalmente para debug (solo en desarrollo)
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      window.avatarApp = app;
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
