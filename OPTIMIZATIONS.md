# Optimizaciones Identificadas

## 🔴 Críticas (Aplicar ahora)

### 1. Accesibilidad - ARIA Labels (0 encontrados)
- [ ] Añadir `aria-label` a todos los botones con solo iconos
- [ ] Añadir `role` a elementos interactivos
- [ ] Añadir `aria-live` para notificaciones toast

### 2. CSS - Transiciones costosas (22 `transition: all`)
- [ ] Cambiar `transition: all` a propiedades específicas
- [ ] Ejemplo: `transition: transform 0.2s, opacity 0.2s`

### 3. Carga de scripts bloqueante
- [ ] Añadir `defer` a Lucide icons script
- [ ] Considerar cargar Lucide desde local vs CDN

### 4. Focus States insuficientes (solo 4)
- [ ] Añadir `:focus-visible` a todos los elementos interactivos
- [ ] Outline visible para navegación por teclado

---

## 🟡 Importantes (Aplicar pronto)

### 5. Prefers-reduced-motion (no implementado)
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6. CSS Containment (no implementado)
```css
.settings-card { contain: layout style; }
.toast { contain: layout style paint; }
```

### 7. Polling de estado (cada 200ms)
- El `checkSpeakingState` usa polling en vez de eventos
- Considerar emitir eventos desde el speech service

### 8. Box-shadows costosos (39 encontrados)
- Muchos box-shadows complejos
- Considerar simplificar o usar `filter: drop-shadow()` para algunos

---

## 🟢 Mejoras visuales menores

### 9. Color del theme-color meta
- Actualmente: `#3b82f6` (azul)
- Debería coincidir con brand: `#1ca4af`

### 10. Skeleton loading shimmer
- Añadir `will-change: transform` para mejor rendimiento

### 11. Estados hover más consistentes
- Algunos elementos tienen hover, otros no
- Unificar comportamiento

### 12. Espaciado en settings-bar
- Podría usar `gap` más consistente
- Cards podrían tener altura mínima uniforme

---

## 📊 Estadísticas

| Métrica | Antes | Después | Objetivo |
|---------|-------|---------|----------|
| aria-* | 0 | 27 | >30 ✅ |
| :focus states | 4 | Global | ✅ |
| prefers-reduced-motion | No | Sí | ✅ |
| defer en scripts | No | Sí | ✅ |
| CSS containment | 0 | 2 | >5 |
| transition: all | 22 | 20 | 0 |
| box-shadow | 39 | 39 | <20 |

---

## ✅ Aplicadas en esta versión

1. ✅ Lucide script con `defer` - No bloquea renderizado
2. ✅ ARIA labels (27 añadidos) - Accesibilidad mejorada
3. ✅ Focus-visible global - Navegación por teclado
4. ✅ Prefers-reduced-motion - Respeta preferencias del usuario
5. ✅ Theme-color corregido (#1ca4af)
6. ✅ CSS containment en cards y toasts
7. ✅ Transiciones optimizadas (start-btn, toast)
8. ✅ will-change en elementos animados
9. ✅ CSS custom properties para transiciones
10. ✅ aria-pressed en theme pills
11. ✅ aria-live en volumen display
