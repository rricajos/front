// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Progress Adapter (Barra de progreso de presentación)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adaptador para mostrar progreso de presentación
 */
export class ProgressAdapter {
  constructor() {
    this._element = document.getElementById('presentationProgress');
    this._fill = document.getElementById('progressFill');
    this._text = document.getElementById('progressText');
    this._title = document.getElementById('progressTitle');
    
    this._current = 0;
    this._total = 0;
    this._items = [];
  }

  /**
   * Inicializa el progreso con una lista de items
   * @param {Array<{id: string, title: string}>} items
   */
  setItems(items) {
    this._items = items;
    this._total = items.length;
    this._current = 0;
    this._updateUI();
  }

  /**
   * Actualiza el progreso al item indicado
   * @param {number} index - Índice del item actual (0-based)
   */
  setCurrent(index) {
    this._current = Math.max(0, Math.min(index, this._total - 1));
    this._updateUI();
  }

  /**
   * Avanza al siguiente item
   * @returns {number} - Nuevo índice
   */
  next() {
    if (this._current < this._total - 1) {
      this._current++;
      this._updateUI();
    }
    return this._current;
  }

  /**
   * Retrocede al item anterior
   * @returns {number} - Nuevo índice
   */
  prev() {
    if (this._current > 0) {
      this._current--;
      this._updateUI();
    }
    return this._current;
  }

  /**
   * Obtiene el item actual
   * @returns {object|null}
   */
  getCurrentItem() {
    return this._items[this._current] || null;
  }

  /**
   * Obtiene el índice actual
   * @returns {number}
   */
  get currentIndex() {
    return this._current;
  }

  /**
   * Obtiene el total de items
   * @returns {number}
   */
  get total() {
    return this._total;
  }

  /**
   * Actualiza la UI
   * @private
   */
  _updateUI() {
    if (!this._element) return;
    
    const percentage = this._total > 0 
      ? ((this._current + 1) / this._total) * 100 
      : 0;
    
    if (this._fill) {
      this._fill.style.width = `${percentage}%`;
    }
    
    if (this._text) {
      this._text.textContent = `${this._current + 1} / ${this._total}`;
    }
    
    if (this._title && this._items[this._current]) {
      this._title.textContent = this._items[this._current].title || '';
    }
  }

  /**
   * Muestra la barra de progreso
   */
  show() {
    this._element?.classList.add('visible');
  }

  /**
   * Oculta la barra de progreso
   */
  hide() {
    this._element?.classList.remove('visible');
  }

  /**
   * Resetea el progreso
   */
  reset() {
    this._current = 0;
    this._total = 0;
    this._items = [];
    this._updateUI();
    this.hide();
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    this.reset();
  }
}
