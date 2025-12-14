// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Dependency Injection Container
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contenedor de inyección de dependencias ligero
 * Soporta singletons, factories y resolución lazy
 */
export class DIContainer {
  constructor() {
    this._services = new Map();
    this._singletons = new Map();
    this._resolving = new Set(); // Para detectar dependencias circulares
  }

  /**
   * Registra un servicio
   * @param {string} name - Nombre del servicio
   * @param {Function} factory - Función que crea el servicio
   * @param {object} options - Opciones
   * @param {boolean} options.singleton - Si es singleton (default: false)
   * @param {string[]} options.dependencies - Dependencias a inyectar
   */
  register(name, factory, options = {}) {
    const { singleton = false, dependencies = [] } = options;
    
    this._services.set(name, {
      factory,
      singleton,
      dependencies,
    });
    
    return this; // Para encadenamiento
  }

  /**
   * Registra un valor constante
   * @param {string} name - Nombre
   * @param {*} value - Valor
   */
  constant(name, value) {
    this._singletons.set(name, value);
    this._services.set(name, {
      factory: () => value,
      singleton: true,
      dependencies: [],
    });
    return this;
  }

  /**
   * Registra un singleton
   * @param {string} name - Nombre del servicio
   * @param {Function} factory - Función que crea el servicio
   * @param {string[]} dependencies - Dependencias
   */
  singleton(name, factory, dependencies = []) {
    return this.register(name, factory, { singleton: true, dependencies });
  }

  /**
   * Registra una factory (nueva instancia cada vez)
   * @param {string} name - Nombre del servicio
   * @param {Function} factory - Función que crea el servicio
   * @param {string[]} dependencies - Dependencias
   */
  factory(name, factory, dependencies = []) {
    return this.register(name, factory, { singleton: false, dependencies });
  }

  /**
   * Resuelve un servicio
   * @param {string} name - Nombre del servicio
   * @returns {*} - Instancia del servicio
   */
  resolve(name) {
    // Verificar si existe
    if (!this._services.has(name)) {
      throw new DIContainerError(`Servicio "${name}" no registrado`);
    }

    const service = this._services.get(name);

    // Si es singleton y ya existe, retornar
    if (service.singleton && this._singletons.has(name)) {
      return this._singletons.get(name);
    }

    // Detectar dependencias circulares
    if (this._resolving.has(name)) {
      throw new DIContainerError(`Dependencia circular detectada: ${name}`);
    }

    this._resolving.add(name);

    try {
      // Resolver dependencias
      const resolvedDeps = service.dependencies.map(dep => this.resolve(dep));

      // Crear instancia
      const instance = service.factory(this, ...resolvedDeps);

      // Guardar si es singleton
      if (service.singleton) {
        this._singletons.set(name, instance);
      }

      return instance;
    } finally {
      this._resolving.delete(name);
    }
  }

  /**
   * Verifica si un servicio está registrado
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._services.has(name);
  }

  /**
   * Obtiene lista de servicios registrados
   * @returns {string[]}
   */
  getRegisteredServices() {
    return [...this._services.keys()];
  }

  /**
   * Crea un scope hijo (para testing o contextos aislados)
   * @returns {DIContainer}
   */
  createScope() {
    const child = new DIContainer();
    
    // Copiar registros del padre
    for (const [name, service] of this._services) {
      child._services.set(name, { ...service });
    }
    
    // Copiar singletons del padre (compartidos)
    for (const [name, instance] of this._singletons) {
      child._singletons.set(name, instance);
    }
    
    return child;
  }

  /**
   * Limpia el contenedor
   */
  clear() {
    this._services.clear();
    this._singletons.clear();
    this._resolving.clear();
  }

  /**
   * Destruye todos los singletons que tengan método destroy
   */
  destroy() {
    for (const [name, instance] of this._singletons) {
      if (instance && typeof instance.destroy === 'function') {
        try {
          instance.destroy();
        } catch (e) {
          console.error(`Error destruyendo ${name}:`, e);
        }
      }
    }
    this.clear();
  }
}

/**
 * Error específico del contenedor DI
 */
export class DIContainerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DIContainerError';
  }
}

/**
 * Decorador para marcar dependencias (para documentación)
 * @param {string[]} deps - Nombres de dependencias
 */
export function inject(...deps) {
  return function(target) {
    target._dependencies = deps;
    return target;
  };
}
