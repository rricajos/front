# ═══════════════════════════════════════════════════════════════════════════
# Avatar Gespropiedad - Dockerfile
# ═══════════════════════════════════════════════════════════════════════════

FROM nginx:alpine

# Metadata
LABEL maintainer="Conexiatec"
LABEL description="Avatar interactivo Gespropiedad con Rive y TTS"
LABEL version="2.0.0"

COPY . /usr/share/nginx/html
EXPOSE 80
