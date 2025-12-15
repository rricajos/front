// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Cached Audio Adapter
// ═══════════════════════════════════════════════════════════════════════════

import { AudioAdapter } from './audio-adapter.js';

/**
 * AudioAdapter con cache de archivos para evitar re-descargas
 */
export class CachedAudioAdapter extends AudioAdapter {
  constructor(logger) {
    super(logger);
    this._cache = new Map();
    this._preloading = new Map(); // Promesas de precarga en curso
  }

  /**
   * Reproduce un archivo de audio (con cache)
   * @param {string} url - URL del archivo de audio
   * @returns {Promise<void>}
   */
  async play(url) {
    if (this._destroyed) return;
    
    // Obtener URL cacheada o cachear
    let cachedUrl = this._cache.get(url);
    
    if (!cachedUrl) {
      // Verificar si ya está precargando
      if (this._preloading.has(url)) {
        cachedUrl = await this._preloading.get(url);
      } else {
        // Cachear bajo demanda
        cachedUrl = await this._cacheUrl(url);
      }
    }
    
    // Reproducir usando el método padre con URL cacheada
    return super.play(cachedUrl);
  }

  /**
   * Precarga múltiples URLs en cache
   * @param {string[]} urls - URLs a precargar
   * @returns {Promise<void>}
   */
  async preload(urls) {
    if (this._destroyed) return;
    
    const uniqueUrls = [...new Set(urls)].filter(url => !this._cache.has(url));
    
    if (uniqueUrls.length === 0) {
      this.logger.log("Cache: Todos los audios ya están en cache");
      return;
    }
    
    this.logger.log(`Cache: Precargando ${uniqueUrls.length} audios...`);
    
    const results = await Promise.allSettled(
      uniqueUrls.map(url => this._cacheUrl(url))
    );
    
    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    this.logger.log(`Cache: ${success} cargados, ${failed} fallidos`);
  }

  /**
   * Cachea una URL individual
   * @private
   */
  async _cacheUrl(url) {
    // Si ya está cacheada, retornar
    if (this._cache.has(url)) {
      return this._cache.get(url);
    }
    
    // Si ya está precargando, esperar
    if (this._preloading.has(url)) {
      return this._preloading.get(url);
    }
    
    // Crear promesa de precarga
    const preloadPromise = this._fetchAndCache(url);
    this._preloading.set(url, preloadPromise);
    
    try {
      const blobUrl = await preloadPromise;
      this._preloading.delete(url);
      return blobUrl;
    } catch (e) {
      this._preloading.delete(url);
      throw e;
    }
  }

  /**
   * Descarga y cachea un archivo
   * @private
   */
  async _fetchAndCache(url) {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Verificar que el blob no está vacío
      if (blob.size === 0) {
        throw new Error('Archivo vacío');
      }
      
      const blobUrl = URL.createObjectURL(blob);
      
      this._cache.set(url, blobUrl);
      
      const filename = url.split('/').pop();
      this.logger.log(`Cache: ✓ ${filename} (${Math.round(blob.size / 1024)}KB)`);
      
      return blobUrl;
    } catch (e) {
      const filename = url.split('/').pop();
      this.logger.warn(`Cache: ✗ ${filename} - ${e.message}`);
      // Retornar URL original si falla el cache
      return url;
    }
  }

  /**
   * Verifica si una URL está en cache
   * @param {string} url
   * @returns {boolean}
   */
  isCached(url) {
    return this._cache.has(url);
  }

  /**
   * Obtiene estadísticas del cache
   * @returns {object}
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      urls: [...this._cache.keys()],
    };
  }

  /**
   * Limpia el cache y revoca URLs
   */
  clearCache() {
    this._cache.forEach((blobUrl, originalUrl) => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        // Ignorar errores de revocación
      }
    });
    this._cache.clear();
    this.logger.log("Cache: Limpiado");
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    this.clearCache();
    this._preloading.clear();
    super.destroy();
  }
}
