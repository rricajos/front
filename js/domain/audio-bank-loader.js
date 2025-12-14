// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN - Audio Bank Loader (Carga dinámica de audios)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Esquema de validación para entradas del AudioBank
 */
const AudioEntrySchema = {
  text: { type: 'string', required: true },
  audio: { type: 'string', required: true },
  segments: { type: 'array', required: false },
  pauses: { type: 'array', required: false },
};

/**
 * Carga y valida un AudioBank desde un archivo JSON
 */
export class AudioBankLoader {
  constructor(logger = null) {
    this.logger = logger;
    this._cache = null;
    this._loadPromise = null;
  }

  /**
   * Carga el AudioBank desde una URL
   * @param {string} url - URL del archivo JSON
   * @returns {Promise<object>} - AudioBank cargado
   */
  async load(url = './audio-bank.json') {
    // Si ya está cargando, esperar
    if (this._loadPromise) {
      return this._loadPromise;
    }

    // Si ya está en cache, retornar
    if (this._cache) {
      return this._cache;
    }

    this._loadPromise = this._doLoad(url);
    
    try {
      this._cache = await this._loadPromise;
      return this._cache;
    } finally {
      this._loadPromise = null;
    }
  }

  /**
   * Realiza la carga
   * @private
   */
  async _doLoad(url) {
    try {
      this._log(`Cargando AudioBank desde ${url}...`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Validar
      const validation = this.validate(data);
      if (!validation.valid) {
        throw new Error(`Validación fallida: ${validation.errors.join(', ')}`);
      }
      
      // Congelar para inmutabilidad
      const frozen = this._deepFreeze(data);
      
      this._log(`✓ AudioBank cargado: ${Object.keys(frozen).length} entradas`);
      
      return frozen;
    } catch (e) {
      this._log(`✗ Error cargando AudioBank: ${e.message}`, 'error');
      throw e;
    }
  }

  /**
   * Valida la estructura del AudioBank
   * @param {object} bank - AudioBank a validar
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(bank) {
    const errors = [];

    if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
      return { valid: false, errors: ['AudioBank debe ser un objeto'] };
    }

    for (const [id, entry] of Object.entries(bank)) {
      // Validar ID
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        errors.push(`ID inválido: ${id}`);
        continue;
      }

      // Validar campos requeridos
      for (const [field, rules] of Object.entries(AudioEntrySchema)) {
        const value = entry[field];
        
        if (rules.required && (value === undefined || value === null)) {
          errors.push(`${id}: falta campo "${field}"`);
          continue;
        }

        if (value !== undefined && value !== null) {
          if (rules.type === 'string' && typeof value !== 'string') {
            errors.push(`${id}.${field}: debe ser string`);
          }
          if (rules.type === 'array' && !Array.isArray(value)) {
            errors.push(`${id}.${field}: debe ser array`);
          }
        }
      }

      // Validar segments si existe
      if (entry.segments && Array.isArray(entry.segments)) {
        entry.segments.forEach((seg, i) => {
          if (typeof seg.text !== 'string') {
            errors.push(`${id}.segments[${i}]: falta text`);
          }
          if (typeof seg.start !== 'number') {
            errors.push(`${id}.segments[${i}]: falta start`);
          }
        });
      }

      // Validar pauses si existe
      if (entry.pauses && Array.isArray(entry.pauses)) {
        entry.pauses.forEach((pause, i) => {
          if (typeof pause !== 'number') {
            errors.push(`${id}.pauses[${i}]: debe ser número`);
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Congela el objeto recursivamente
   * @private
   */
  _deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this._deepFreeze(item));
      return Object.freeze(obj);
    }

    for (const key of Object.keys(obj)) {
      this._deepFreeze(obj[key]);
    }

    return Object.freeze(obj);
  }

  /**
   * Obtiene el AudioBank cacheado
   * @returns {object|null}
   */
  get cached() {
    return this._cache;
  }

  /**
   * Limpia el cache
   */
  clearCache() {
    this._cache = null;
  }

  /**
   * Combina múltiples AudioBanks
   * @param  {...object} banks - AudioBanks a combinar
   * @returns {object}
   */
  static merge(...banks) {
    const merged = {};
    
    for (const bank of banks) {
      if (bank && typeof bank === 'object') {
        Object.assign(merged, bank);
      }
    }
    
    return Object.freeze(merged);
  }

  /**
   * Log helper
   * @private
   */
  _log(msg, level = 'log') {
    if (this.logger) {
      this.logger[level]?.(msg) || console[level]('[AudioBank]', msg);
    } else {
      console[level]('[AudioBank]', msg);
    }
  }
}

/**
 * Instancia singleton para uso global
 */
export const audioBankLoader = new AudioBankLoader();
