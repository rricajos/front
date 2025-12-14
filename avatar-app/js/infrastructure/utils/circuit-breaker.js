// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Circuit Breaker
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estados del Circuit Breaker
 */
export const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',     // Normal, permite llamadas
  OPEN: 'OPEN',         // Fallo, rechaza llamadas
  HALF_OPEN: 'HALF_OPEN' // Prueba, permite una llamada
});

/**
 * Circuit Breaker para proteger llamadas a servicios externos
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 1;
    this.onStateChange = options.onStateChange || null;
    
    this._state = CircuitState.CLOSED;
    this._failures = 0;
    this._successes = 0;
    this._lastFailureTime = null;
    this._halfOpenAttempts = 0;
    this._resetTimer = null;
  }

  /**
   * Estado actual del circuit breaker
   */
  get state() {
    return this._state;
  }

  /**
   * Si el circuito permite llamadas
   */
  get isAllowed() {
    this._checkReset();
    return this._state !== CircuitState.OPEN;
  }

  /**
   * Estadísticas del circuit breaker
   */
  get stats() {
    return {
      state: this._state,
      failures: this._failures,
      successes: this._successes,
      lastFailure: this._lastFailureTime,
    };
  }

  /**
   * Ejecuta una función protegida por el circuit breaker
   * @param {Function} fn - Función async a ejecutar
   * @returns {Promise<*>}
   */
  async execute(fn) {
    this._checkReset();
    
    if (this._state === CircuitState.OPEN) {
      throw new CircuitBreakerError(
        `Circuit breaker [${this.name}] is OPEN`,
        this.stats
      );
    }
    
    if (this._state === CircuitState.HALF_OPEN) {
      this._halfOpenAttempts++;
      if (this._halfOpenAttempts > this.halfOpenMaxAttempts) {
        this._trip();
        throw new CircuitBreakerError(
          `Circuit breaker [${this.name}] half-open attempts exceeded`,
          this.stats
        );
      }
    }
    
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  /**
   * Verifica si debe resetear el circuito
   * @private
   */
  _checkReset() {
    if (this._state === CircuitState.OPEN && this._lastFailureTime) {
      const elapsed = Date.now() - this._lastFailureTime;
      if (elapsed >= this.resetTimeout) {
        this._setState(CircuitState.HALF_OPEN);
        this._halfOpenAttempts = 0;
      }
    }
  }

  /**
   * Maneja una llamada exitosa
   * @private
   */
  _onSuccess() {
    this._successes++;
    
    if (this._state === CircuitState.HALF_OPEN) {
      this._reset();
    } else {
      // Decrementar failures gradualmente en estado normal
      if (this._failures > 0) {
        this._failures--;
      }
    }
  }

  /**
   * Maneja una llamada fallida
   * @private
   */
  _onFailure(error) {
    this._failures++;
    this._lastFailureTime = Date.now();
    
    if (this._state === CircuitState.HALF_OPEN) {
      this._trip();
    } else if (this._failures >= this.failureThreshold) {
      this._trip();
    }
  }

  /**
   * Abre el circuito (trip)
   * @private
   */
  _trip() {
    this._setState(CircuitState.OPEN);
    
    // Programar intento de reset
    if (this._resetTimer) {
      clearTimeout(this._resetTimer);
    }
    this._resetTimer = setTimeout(() => {
      if (this._state === CircuitState.OPEN) {
        this._setState(CircuitState.HALF_OPEN);
        this._halfOpenAttempts = 0;
      }
    }, this.resetTimeout);
  }

  /**
   * Resetea el circuito a estado normal
   * @private
   */
  _reset() {
    this._failures = 0;
    this._halfOpenAttempts = 0;
    if (this._resetTimer) {
      clearTimeout(this._resetTimer);
      this._resetTimer = null;
    }
    this._setState(CircuitState.CLOSED);
  }

  /**
   * Cambia el estado y notifica
   * @private
   */
  _setState(newState) {
    const oldState = this._state;
    if (oldState !== newState) {
      this._state = newState;
      this.onStateChange?.(newState, oldState, this.stats);
    }
  }

  /**
   * Fuerza el reset del circuito (para testing/admin)
   */
  forceReset() {
    this._reset();
  }

  /**
   * Fuerza la apertura del circuito (para testing/admin)
   */
  forceOpen() {
    this._trip();
  }

  /**
   * Destruye el circuit breaker
   */
  destroy() {
    if (this._resetTimer) {
      clearTimeout(this._resetTimer);
      this._resetTimer = null;
    }
  }
}

/**
 * Error específico del Circuit Breaker
 */
export class CircuitBreakerError extends Error {
  constructor(message, stats) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.stats = stats;
  }
}
