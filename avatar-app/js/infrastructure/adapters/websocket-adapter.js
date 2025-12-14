// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - WebSocket Adapter
// ═══════════════════════════════════════════════════════════════════════════

import { validateMessage, isValidAudioId } from '../../domain/message-validator.js';

export class WebSocketAdapter {
  constructor(host, logger, eventBus) {
    this.host = host;
    this.logger = logger;
    this.eventBus = eventBus;
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
  }

  /**
   * Conecta al servidor WebSocket
   */
  connect() {
    if (!this.host) {
      this.logger.warn("WS: No hay host configurado");
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    const url = proto + this.host;
    
    try {
      this.logger.log("WS: conectando a " + this.host);
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => this._handleOpen();
      this.ws.onclose = (e) => this._handleClose(e);
      this.ws.onerror = (e) => this._handleError(e);
      this.ws.onmessage = (e) => this._handleMessage(e);
    } catch (e) {
      this.logger.error("WS error de conexión: " + e.message);
      this._scheduleReconnect();
    }
  }

  _handleOpen() {
    this.logger.log("WS: conectado ✓");
    this.reconnectAttempts = 0;
    this.eventBus.emit('ws:connected', {});
  }

  _handleClose(event) {
    this.logger.log("WS: desconectado (code: " + event.code + ")");
    this.eventBus.emit('ws:disconnected', { code: event.code });
    this._scheduleReconnect();
  }

  _handleError(error) {
    this.logger.error("WS error");
    this.eventBus.emit('ws:error', { error });
  }

  _handleMessage(event) {
    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIÓN DE MENSAJE (Crítico para seguridad)
    // ═══════════════════════════════════════════════════════════════════════
    const validation = validateMessage(event.data);
    
    if (!validation.valid) {
      this.logger.warn("WS: Mensaje inválido - " + validation.error);
      return;
    }
    
    const msg = validation.message;
    this.logger.log("WS: " + msg.type + (msg.audioId ? ` [${msg.audioId}]` : ''));
    
    // Emitir eventos según el tipo de mensaje
    switch (msg.type) {
      case "bot_speaking_start":
        // Validar audioId si existe
        const audioId = msg.audioId || msg.lineId || null;
        if (audioId && !isValidAudioId(audioId)) {
          this.logger.warn("WS: audioId inválido: " + audioId);
          return;
        }
        
        this.eventBus.emit('speak:start', {
          audioId,
          text: msg.text || null,
        });
        break;
        
      case "bot_speaking_end":
        this.eventBus.emit('speak:end', {});
        break;
        
      case "bot_message":
        this.eventBus.emit('message:received', {
          text: msg.text,
        });
        break;
        
      case "ping":
        this.send({ type: "pong" });
        break;
        
      default:
        this.eventBus.emit('ws:message', msg);
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("WS: máximo de reconexiones alcanzado");
      this.eventBus.emit('ws:max_reconnects', {});
      return;
    }
    
    this.reconnectAttempts++;
    
    // Exponential backoff con jitter
    const exponentialDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000;
    const delay = Math.min(exponentialDelay + jitter, this.maxReconnectDelay);
    
    this.logger.log(`WS: reconectando en ${Math.round(delay / 1000)}s (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /**
   * Envía un mensaje al servidor
   * @param {object} data - Datos a enviar
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.logger.warn("WS: no conectado, mensaje no enviado");
    }
  }

  /**
   * Desconecta del servidor
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevenir reconexión
    
    if (this.ws) {
      this.ws.onclose = null; // Prevenir callback de cierre
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Resetea el contador de reconexiones
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }

  /**
   * @returns {boolean} - Si está conectado
   */
  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
