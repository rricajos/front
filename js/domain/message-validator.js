// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN - Message Validator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Esquemas de validación para mensajes WebSocket
 */
const MessageSchemas = {
  'bot_speaking_start': {
    type: { type: 'string', required: true },
    audioId: { type: 'string', required: false },
    lineId: { type: 'string', required: false },
    text: { type: 'string', required: false },
  },
  'bot_speaking_end': {
    type: { type: 'string', required: true },
  },
  'bot_message': {
    type: { type: 'string', required: true },
    text: { type: 'string', required: true },
  },
};

/**
 * Tipos de mensajes permitidos
 */
const AllowedMessageTypes = new Set([
  'bot_speaking_start',
  'bot_speaking_end',
  'bot_message',
  'ping',
  'pong',
  'connected',
]);

/**
 * Valida un mensaje WebSocket
 * @param {*} data - Datos crudos del mensaje
 * @returns {{ valid: boolean, message?: object, error?: string }}
 */
export function validateMessage(data) {
  // 1. Validar que es string
  if (typeof data !== 'string') {
    return { valid: false, error: 'Mensaje no es string' };
  }

  // 2. Validar longitud máxima (prevenir DoS)
  if (data.length > 65536) { // 64KB max
    return { valid: false, error: 'Mensaje excede tamaño máximo' };
  }

  // 3. Parsear JSON
  let message;
  try {
    message = JSON.parse(data);
  } catch (e) {
    return { valid: false, error: 'JSON inválido' };
  }

  // 4. Validar que es objeto
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { valid: false, error: 'Mensaje debe ser objeto' };
  }

  // 5. Validar que tiene type
  if (!message.type || typeof message.type !== 'string') {
    return { valid: false, error: 'Falta campo type' };
  }

  // 6. Validar tipo permitido
  if (!AllowedMessageTypes.has(message.type)) {
    return { valid: false, error: `Tipo no permitido: ${message.type}` };
  }

  // 7. Validar contra esquema si existe
  const schema = MessageSchemas[message.type];
  if (schema) {
    const schemaError = validateSchema(message, schema);
    if (schemaError) {
      return { valid: false, error: schemaError };
    }
  }

  // 8. Sanitizar campos string
  const sanitized = sanitizeMessage(message);

  return { valid: true, message: sanitized };
}

/**
 * Valida un mensaje contra un esquema
 * @private
 */
function validateSchema(message, schema) {
  for (const [field, rules] of Object.entries(schema)) {
    const value = message[field];
    
    // Verificar requerido
    if (rules.required && (value === undefined || value === null)) {
      return `Campo requerido faltante: ${field}`;
    }
    
    // Si no está presente y no es requerido, skip
    if (value === undefined || value === null) continue;
    
    // Verificar tipo
    if (rules.type && typeof value !== rules.type) {
      return `Campo ${field} debe ser ${rules.type}`;
    }
    
    // Verificar longitud máxima para strings
    if (rules.type === 'string' && value.length > 10000) {
      return `Campo ${field} excede longitud máxima`;
    }
  }
  
  return null;
}

/**
 * Sanitiza un mensaje removiendo caracteres peligrosos
 * @private
 */
function sanitizeMessage(message) {
  const sanitized = { ...message };
  
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      // Remover caracteres de control excepto newlines
      sanitized[key] = value
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Limitar longitud
        .slice(0, 10000);
    }
  }
  
  return sanitized;
}

/**
 * Valida un audioId
 * @param {string} audioId
 * @returns {boolean}
 */
export function isValidAudioId(audioId) {
  if (!audioId || typeof audioId !== 'string') return false;
  // Solo permitir alfanuméricos, guiones y guiones bajos
  return /^[a-zA-Z0-9_-]{1,50}$/.test(audioId);
}
