// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Retry Utility (Exponential Backoff)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta una función con reintentos y backoff exponencial
 * @param {Function} fn - Función async a ejecutar
 * @param {object} options - Opciones de configuración
 * @returns {Promise<*>} - Resultado de la función
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
    onRetry = null,
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      // Verificar si debemos reintentar
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      
      // Calcular delay con exponential backoff + jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 500;
      const delay = Math.min(exponentialDelay + jitter, maxDelay);
      
      // Callback de reintento
      onRetry?.(error, attempt, delay);
      
      // Esperar antes de reintentar
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Crea un wrapper con retry preconfigurado
 * @param {object} defaultOptions - Opciones por defecto
 * @returns {Function}
 */
export function createRetryWrapper(defaultOptions = {}) {
  return (fn, options = {}) => withRetry(fn, { ...defaultOptions, ...options });
}
