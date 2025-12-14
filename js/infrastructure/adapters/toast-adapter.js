// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Toast Adapter (Notificaciones)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tipos de toast disponibles
 */
export const ToastType = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Iconos por tipo de toast
 */
const ToastIcons = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'x-circle',
};

/**
 * Adaptador para mostrar notificaciones toast
 */
export class ToastAdapter {
  constructor() {
    this._container = null;
    this._queue = [];
    this._maxVisible = 3;
    this._createContainer();
  }

  /**
   * Crea el contenedor de toasts
   * @private
   */
  _createContainer() {
    if (this._container) return;
    
    this._container = document.createElement('div');
    this._container.className = 'toast-container';
    this._container.setAttribute('aria-live', 'polite');
    this._container.setAttribute('aria-label', 'Notificaciones');
    document.body.appendChild(this._container);
  }

  /**
   * Muestra un toast
   * @param {string} message - Mensaje a mostrar
   * @param {string} type - Tipo: info, success, warning, error
   * @param {number} duration - Duración en ms (0 = manual close)
   * @returns {HTMLElement} - Elemento del toast
   */
  show(message, type = ToastType.INFO, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    
    const icon = ToastIcons[type] || 'info';
    
    toast.innerHTML = `
      <i data-lucide="${icon}" class="toast-icon"></i>
      <span class="toast-message">${this._escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Cerrar">
        <i data-lucide="x"></i>
      </button>
    `;
    
    // Botón de cerrar
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this._dismiss(toast));
    
    // Añadir al contenedor
    this._container.appendChild(toast);
    
    // Inicializar iconos Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ icons: { [icon]: true, x: true } });
    }
    
    // Animar entrada
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
    
    // Auto-dismiss
    if (duration > 0) {
      toast._timeout = setTimeout(() => this._dismiss(toast), duration);
    }
    
    // Limitar toasts visibles
    this._enforceMaxVisible();
    
    return toast;
  }

  /**
   * Toast de info
   */
  info(message, duration = 3000) {
    return this.show(message, ToastType.INFO, duration);
  }

  /**
   * Toast de éxito
   */
  success(message, duration = 3000) {
    return this.show(message, ToastType.SUCCESS, duration);
  }

  /**
   * Toast de advertencia
   */
  warning(message, duration = 4000) {
    return this.show(message, ToastType.WARNING, duration);
  }

  /**
   * Toast de error
   */
  error(message, duration = 5000) {
    return this.show(message, ToastType.ERROR, duration);
  }

  /**
   * Cierra un toast con animación
   * @private
   */
  _dismiss(toast) {
    if (toast._dismissed) return;
    toast._dismissed = true;
    
    clearTimeout(toast._timeout);
    toast.classList.remove('visible');
    toast.classList.add('dismissing');
    
    setTimeout(() => {
      toast.remove();
    }, 300);
  }

  /**
   * Cierra todos los toasts
   */
  dismissAll() {
    const toasts = this._container.querySelectorAll('.toast');
    toasts.forEach(toast => this._dismiss(toast));
  }

  /**
   * Limita la cantidad de toasts visibles
   * @private
   */
  _enforceMaxVisible() {
    const toasts = this._container.querySelectorAll('.toast:not(.dismissing)');
    if (toasts.length > this._maxVisible) {
      const excess = toasts.length - this._maxVisible;
      for (let i = 0; i < excess; i++) {
        this._dismiss(toasts[i]);
      }
    }
  }

  /**
   * Escapa HTML para prevenir XSS
   * @private
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destruye el adaptador
   */
  destroy() {
    this.dismissAll();
    this._container?.remove();
    this._container = null;
  }
}

// Singleton para uso global
export const toast = new ToastAdapter();
