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
 * SVGs inline para los iconos de toast (evita dependencia de Lucide)
 */
const ToastSVGs = {
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
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
    
    const iconSvg = ToastSVGs[type] || ToastSVGs.info;
    
    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message">${this._escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Cerrar">
        ${ToastSVGs.close}
      </button>
    `;
    
    // Botón de cerrar
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this._dismiss(toast));
    
    // Añadir al contenedor
    this._container.appendChild(toast);
    
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
