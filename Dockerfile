# ═══════════════════════════════════════════════════════════════════════════
# Avatar Gespropiedad - Dockerfile
# ═══════════════════════════════════════════════════════════════════════════

FROM nginx:alpine

# Metadata
LABEL maintainer="Conexiatec"
LABEL description="Avatar interactivo Gespropiedad con Rive y TTS"
LABEL version="2.0.0"

# Copiar configuración de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar aplicación (archivos base)
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY audio-bank.json /usr/share/nginx/html/

# Assets - usar wildcard para que no falle si no existen
COPY avatar.ri[v] /usr/share/nginx/html/
COPY gestpropiedad.jp[g] /usr/share/nginx/html/

# Carpeta de audio (crear vacía si no existe)
RUN mkdir -p /usr/share/nginx/html/audio
COPY audio/ /usr/share/nginx/html/audio/

# Exponer puerto
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Comando por defecto
CMD ["nginx", "-g", "daemon off;"]
