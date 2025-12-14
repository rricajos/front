// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - CSS Avatar Adapter (Fallback)
// ═══════════════════════════════════════════════════════════════════════════

export class CSSAvatarAdapter {
  constructor(mouthElement) {
    this.mouth = mouthElement;
    this.animationFrame = null;
    this._destroyed = false;
  }

  get isReady() {
    return !this._destroyed && !!this.mouth;
  }

  startLipSync(pauseTimestamps = [], durationMs = 99999) {
    if (this._destroyed) return;
    
    this.stopLipSync();
    
    if (!this.mouth) return;
    
    const start = performance.now();
    const pauseRanges = pauseTimestamps.map(t => ({ 
      start: t, 
      end: t + 500 // PAUSE_DURATION
    }));
    
    const animate = () => {
      if (this._destroyed) {
        this.stopLipSync();
        return;
      }
      
      const elapsed = performance.now() - start;
      
      if (elapsed >= durationMs) {
        this.setMouth(0);
        return;
      }
      
      // Check si estamos en pausa
      const inPause = pauseRanges.some(r => elapsed >= r.start && elapsed < r.end);
      
      if (inPause) {
        this.setMouth(0);
      } else {
        const wave = Math.sin(elapsed / 85);
        this.setMouth(0.45 + 0.55 * wave);
      }
      
      this.animationFrame = requestAnimationFrame(animate);
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }

  stopLipSync() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.setMouth(0);
  }

  setMouth(value) {
    if (!this.mouth || this._destroyed) return;
    const scale = 0.2 + (value * 0.8);
    this.mouth.style.transform = `translateX(-50%) scaleY(${scale})`;
  }

  destroy() {
    this._destroyed = true;
    this.stopLipSync();
    this.mouth = null;
  }
}
