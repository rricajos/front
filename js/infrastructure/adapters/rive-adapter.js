// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - Rive Adapter
// ═══════════════════════════════════════════════════════════════════════════

export class RiveAdapter {
  constructor(canvas, config, logger, RiveCanvas) {
    this.canvas = canvas;
    this.config = config;
    this.logger = logger;
    this.RiveCanvas = RiveCanvas;
    this.instance = null;
    this.isTalkingInput = null;
    this.visemeIDInput = null;
    this.lipSyncTimer = null;
    this._destroyed = false;
  }

  async initialize() {
    if (this._destroyed) {
      this.logger.warn("RiveAdapter: intentando inicializar después de destroy");
      return false;
    }

    const Rive = this.RiveCanvas.Rive || this.RiveCanvas.default || this.RiveCanvas;
    
    return new Promise((resolve) => {
      try {
        this.instance = new Rive({
          src: this.config.RIVE_FILE,
          canvas: this.canvas,
          stateMachines: this.config.STATE_MACHINE,
          autoplay: true,
          onLoad: () => this._onLoad(resolve),
          onLoadError: (err) => {
            this.logger.error("Error cargando Rive: " + err);
            resolve(false);
          }
        });
      } catch (e) {
        this.logger.error("Error inicializando Rive: " + e.message);
        resolve(false);
      }
    });
  }

  _onLoad(resolve) {
    if (this._destroyed) {
      resolve(false);
      return;
    }

    setTimeout(() => {
      try {
        const inputs = this.instance.stateMachineInputs(this.config.STATE_MACHINE);
        if (inputs?.length > 0) {
          inputs.forEach(input => {
            if (input.name === "isTalking") this.isTalkingInput = input;
            else if (input.name === "VisemeID") this.visemeIDInput = input;
          });
          
          // Ocultar skeleton loading
          this._hideSkeleton();
          
          this.logger.log("✓ Rive inicializado");
          resolve(true);
        } else {
          this.logger.warn("No se encontraron inputs en Rive");
          resolve(false);
        }
      } catch (e) {
        this.logger.error("Error obteniendo inputs: " + e.message);
        resolve(false);
      }
    }, 150);
  }

  /**
   * Oculta el skeleton loading del contenedor
   * @private
   */
  _hideSkeleton() {
    // Buscar skeleton en el contenedor padre del canvas
    const container = this.canvas?.parentElement;
    const skeleton = container?.querySelector('.rive-skeleton');
    if (skeleton) {
      skeleton.classList.add('hidden');
      // Remover después de la animación
      setTimeout(() => skeleton.remove(), 300);
    }
  }

  get isReady() {
    return !this._destroyed && !!(this.isTalkingInput && this.visemeIDInput);
  }

  startLipSync(pauseTimestamps = []) {
    if (this._destroyed) return;
    
    this.stopLipSync();
    
    if (!this.visemeIDInput) {
      this.logger.warn("No hay visemeIDInput disponible");
      return;
    }
    
    if (this.isTalkingInput) {
      this.isTalkingInput.value = true;
    }

    const visemes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let lastViseme = 0;
    const startTime = performance.now();
    const pauseRanges = pauseTimestamps.map(t => ({ 
      start: t, 
      end: t + this.config.PAUSE_DURATION 
    }));

    this.lipSyncTimer = setInterval(() => {
      if (this._destroyed) {
        this.stopLipSync();
        return;
      }

      const elapsed = performance.now() - startTime;
      const inPause = pauseRanges.some(r => elapsed >= r.start && elapsed < r.end);
      
      if (inPause) {
        this.visemeIDInput.value = 0;
        if (this.isTalkingInput) this.isTalkingInput.value = false;
        return;
      }
      
      if (this.isTalkingInput && !this.isTalkingInput.value) {
        this.isTalkingInput.value = true;
      }
      
      let newViseme;
      do { 
        newViseme = visemes[Math.floor(Math.random() * visemes.length)]; 
      } while (newViseme === lastViseme);
      lastViseme = newViseme;
      this.visemeIDInput.value = newViseme;
    }, this.config.LIP_SYNC_INTERVAL);
  }

  stopLipSync() {
    if (this.lipSyncTimer) {
      clearInterval(this.lipSyncTimer);
      this.lipSyncTimer = null;
    }
    if (this.isTalkingInput) this.isTalkingInput.value = false;
    if (this.visemeIDInput) this.visemeIDInput.value = 0;
  }

  /**
   * Destruye el adaptador y libera recursos
   */
  destroy() {
    this._destroyed = true;
    this.stopLipSync();
    
    // Limpiar referencias a inputs
    this.isTalkingInput = null;
    this.visemeIDInput = null;
    
    // Limpiar instancia Rive
    if (this.instance) {
      try {
        this.instance.stop?.();
        this.instance.cleanup?.();
      } catch (e) {
        // Ignorar errores de cleanup
      }
      this.instance = null;
    }
    
    this.logger.log("RiveAdapter destruido");
  }
}
