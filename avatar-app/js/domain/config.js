// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN - Configuration
// ═══════════════════════════════════════════════════════════════════════════

// Configuración por defecto (sin secretos)
const DefaultConfig = {
  // ElevenLabs - Las keys se cargan externamente
  ELEVENLABS_API_KEY: null,
  ELEVENLABS_VOICE_ID: null,
  ELEVENLABS_MODEL: "eleven_multilingual_v2",

  // Backend
  BACKEND_HOST: "hogar-avatar-api.conexiatec.com",

  // Rive
  RIVE_FILE: "../../avatar.riv",
  STATE_MACHINE: "State Machine",

  // TTS
  USE_BROWSER_TTS_FALLBACK: true,

  // Presentation
  PRESENTATION_START_ID: "intro_1",
  PRESENTATION_END_ID: "despedida_1",

  // Timing
  PAUSE_DURATION: 500,
  LIP_SYNC_INTERVAL: 90,
  KARAOKE_INTERVAL: 50,
};

// Cargar configuración externa de forma segura
let _config = null;

export async function loadConfig(externalConfigUrl = "./config.local.json") {
  if (_config) return _config;

  let externalConfig = {};

  try {
    const response = await fetch(externalConfigUrl);
    if (response.ok) {
      externalConfig = await response.json();
      console.log("[Config] Configuración externa cargada");
    }
  } catch (e) {
    console.warn("[Config] No se pudo cargar config externa:", e.message);
  }

  // Merge con defaults
  _config = Object.freeze({
    ...DefaultConfig,
    ...externalConfig,
  });

  return _config;
}

// Config síncrono (usa defaults si no se ha cargado)
export const Config = new Proxy(
  {},
  {
    get(_, prop) {
      if (_config) return _config[prop];
      return DefaultConfig[prop];
    },
  }
);

// Validar que la config tiene lo necesario
export function validateConfig(config) {
  const warnings = [];

  if (!config.ELEVENLABS_API_KEY) {
    warnings.push(
      "ELEVENLABS_API_KEY no configurada - solo TTS navegador disponible"
    );
  }

  if (!config.BACKEND_HOST) {
    warnings.push("BACKEND_HOST no configurado - WebSocket deshabilitado");
  }

  return { valid: true, warnings };
}
