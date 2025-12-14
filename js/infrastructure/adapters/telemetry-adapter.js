// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Telemetry Adapter (Métricas y eventos)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tipos de eventos de telemetría
 */
export const TelemetryEventType = Object.freeze({
  // Sesión
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  
  // Audio
  AUDIO_PLAY_START: 'audio_play_start',
  AUDIO_PLAY_END: 'audio_play_end',
  AUDIO_ERROR: 'audio_error',
  
  // TTS
  TTS_REQUEST: 'tts_request',
  TTS_SUCCESS: 'tts_success',
  TTS_FALLBACK: 'tts_fallback',
  TTS_ERROR: 'tts_error',
  
  // Presentación
  PRESENTATION_START: 'presentation_start',
  PRESENTATION_END: 'presentation_end',
  
  // WebSocket
  WS_CONNECTED: 'ws_connected',
  WS_DISCONNECTED: 'ws_disconnected',
  WS_ERROR: 'ws_error',
  
  // Errores
  ERROR: 'error',
  
  // Performance
  PERFORMANCE: 'performance',
});

/**
 * Adaptador de telemetría para métricas y eventos
 */
export class TelemetryAdapter {
  constructor(options = {}) {
    this.endpoint = options.endpoint || null;
    this.appName = options.appName || 'avatar-app';
    this.appVersion = options.appVersion || '1.0.0';
    this.debug = options.debug || false;
    this.batchSize = options.batchSize || 10;
    this.flushInterval = options.flushInterval || 30000; // 30s
    
    this._buffer = [];
    this._sessionId = this._generateSessionId();
    this._startTime = Date.now();
    this._flushTimer = null;
    this._destroyed = false;
    
    // Métricas acumuladas
    this._metrics = {
      audioPlays: 0,
      ttsRequests: 0,
      ttsFallbacks: 0,
      errors: 0,
      wsReconnects: 0,
    };
    
    // Iniciar flush periódico
    this._startFlushTimer();
    
    // Registrar inicio de sesión
    this.track(TelemetryEventType.SESSION_START);
  }

  /**
   * Registra un evento
   * @param {string} eventType - Tipo de evento
   * @param {object} data - Datos adicionales
   */
  track(eventType, data = {}) {
    if (this._destroyed) return;
    
    const event = {
      type: eventType,
      timestamp: Date.now(),
      sessionId: this._sessionId,
      data: {
        ...data,
        appName: this.appName,
        appVersion: this.appVersion,
        userAgent: navigator?.userAgent,
        url: location?.href,
      },
    };
    
    this._buffer.push(event);
    
    // Log en debug mode
    if (this.debug) {
      console.log('[Telemetry]', eventType, data);
    }
    
    // Actualizar métricas
    this._updateMetrics(eventType);
    
    // Flush si el buffer está lleno
    if (this._buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Registra un error
   * @param {Error|string} error - Error
   * @param {object} context - Contexto adicional
   */
  trackError(error, context = {}) {
    this.track(TelemetryEventType.ERROR, {
      message: error.message || String(error),
      stack: error.stack,
      name: error.name,
      ...context,
    });
  }

  /**
   * Registra una métrica de performance
   * @param {string} name - Nombre de la métrica
   * @param {number} value - Valor (normalmente ms)
   * @param {object} tags - Tags adicionales
   */
  trackPerformance(name, value, tags = {}) {
    this.track(TelemetryEventType.PERFORMANCE, {
      metric: name,
      value,
      unit: 'ms',
      ...tags,
    });
  }

  /**
   * Mide el tiempo de ejecución de una función
   * @param {string} name - Nombre de la operación
   * @param {Function} fn - Función a medir
   * @returns {Promise<*>} - Resultado de la función
   */
  async measure(name, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.trackPerformance(name, duration, { success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.trackPerformance(name, duration, { success: false });
      throw error;
    }
  }

  /**
   * Actualiza métricas acumuladas
   * @private
   */
  _updateMetrics(eventType) {
    switch (eventType) {
      case TelemetryEventType.AUDIO_PLAY_START:
        this._metrics.audioPlays++;
        break;
      case TelemetryEventType.TTS_REQUEST:
        this._metrics.ttsRequests++;
        break;
      case TelemetryEventType.TTS_FALLBACK:
        this._metrics.ttsFallbacks++;
        break;
      case TelemetryEventType.ERROR:
      case TelemetryEventType.AUDIO_ERROR:
      case TelemetryEventType.TTS_ERROR:
        this._metrics.errors++;
        break;
      case TelemetryEventType.WS_DISCONNECTED:
        this._metrics.wsReconnects++;
        break;
    }
  }

  /**
   * Envía los eventos al servidor
   */
  async flush() {
    if (this._destroyed || this._buffer.length === 0) return;
    
    const events = [...this._buffer];
    this._buffer = [];
    
    // Si no hay endpoint, solo limpiar buffer
    if (!this.endpoint) {
      if (this.debug) {
        console.log('[Telemetry] Flush (no endpoint):', events.length, 'events');
      }
      return;
    }
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events,
          sessionId: this._sessionId,
          timestamp: Date.now(),
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      if (this.debug) {
        console.log('[Telemetry] Sent', events.length, 'events');
      }
    } catch (error) {
      // Re-añadir eventos fallidos al buffer
      this._buffer.unshift(...events);
      
      if (this.debug) {
        console.error('[Telemetry] Flush failed:', error);
      }
    }
  }

  /**
   * Inicia el timer de flush periódico
   * @private
   */
  _startFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
    }
    
    this._flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Genera un ID de sesión único
   * @private
   */
  _generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtiene métricas acumuladas
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this._metrics,
      sessionDuration: Date.now() - this._startTime,
      bufferSize: this._buffer.length,
    };
  }

  /**
   * Obtiene el ID de sesión
   * @returns {string}
   */
  getSessionId() {
    return this._sessionId;
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    if (this._destroyed) return;
    
    // Registrar fin de sesión
    this.track(TelemetryEventType.SESSION_END, {
      duration: Date.now() - this._startTime,
      metrics: this.getMetrics(),
    });
    
    // Último flush
    this.flush();
    
    // Limpiar timer
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    
    this._destroyed = true;
  }
}

/**
 * Crea un wrapper para añadir telemetría a una función
 * @param {TelemetryAdapter} telemetry - Instancia de telemetría
 * @param {string} eventType - Tipo de evento
 */
export function withTelemetry(telemetry, eventType) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      telemetry.track(eventType, { method: propertyKey });
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        telemetry.trackError(error, { method: propertyKey });
        throw error;
      }
    };
    
    return descriptor;
  };
}
