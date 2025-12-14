# Iconos PWA

## Generar iconos desde SVG

Usa el archivo `icon.svg` como base y genera los siguientes tamaños:

```
icon-16.png   (16x16)
icon-32.png   (32x32)
icon-72.png   (72x72)
icon-96.png   (96x96)
icon-128.png  (128x128)
icon-144.png  (144x144)
icon-152.png  (152x152)
icon-192.png  (192x192)
icon-384.png  (384x384)
icon-512.png  (512x512)
```

## Herramientas recomendadas

- **Online**: https://realfavicongenerator.net/
- **CLI**: `npx pwa-asset-generator icon.svg ./icons`
- **ImageMagick**: `convert -background none icon.svg -resize 192x192 icon-192.png`

## Alternativa rápida

Si no tienes los iconos PNG, la app seguirá funcionando pero no será instalable como PWA.
