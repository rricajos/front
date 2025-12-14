// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE - UI Adapter (Manipulación del DOM)
// ═══════════════════════════════════════════════════════════════════════════

export class UIAdapter {
  constructor() {
    this.elements = {
      startOverlay: document.getElementById("startOverlay"),
      statusDot: document.getElementById("statusDot"),
      statusText: document.getElementById("statusText"),
      bubble: document.getElementById("bubble"),
      textInput: document.getElementById("textInput"),
      voiceSelect: document.getElementById("voiceSelect"),
      debug: document.getElementById("debug"),
      
      // Presentation
      presentationContainer: document.getElementById("presentationContainer"),
      presentationAvatar: document.getElementById("presentationAvatar"),
      
      // Panel avatar
      riveWrap: document.getElementById("riveWrap"),
      cssAvatar: document.getElementById("cssAvatar"),
      cssMouth: document.getElementById("cssMouth"),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Overlay
  // ═══════════════════════════════════════════════════════════════════════
  
  hideOverlay() {
    this.elements.startOverlay?.classList.add("hidden");
  }

  showOverlay() {
    this.elements.startOverlay?.classList.remove("hidden");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Status
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Actualiza el estado mostrado
   * @param {string} text - Texto del estado
   * @param {"loading"|"ok"|"error"} state - Estado visual
   */
  setStatus(text, state = "loading") {
    if (this.elements.statusText) {
      this.elements.statusText.textContent = text;
    }
    if (this.elements.statusDot) {
      this.elements.statusDot.className = "status-dot " + state;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Bubble / Text Input
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Actualiza el texto del bubble o textInput
   * @param {string} text
   */
  setBubble(text) {
    // Soportar tanto el bubble antiguo como el nuevo textInput
    if (this.elements.textInput) {
      this.elements.textInput.value = text;
    }
    if (this.elements.bubble) {
      this.elements.bubble.textContent = text;
    }
  }

  /**
   * Obtiene el texto actual del input
   * @returns {string}
   */
  getBubbleText() {
    if (this.elements.textInput) {
      return this.elements.textInput.value;
    }
    if (this.elements.bubble) {
      return this.elements.bubble.textContent;
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Voice Select
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Llena el selector de voces
   * @param {SpeechSynthesisVoice[]} voices
   * @param {number} selectedIndex
   */
  populateVoices(voices, selectedIndex = 0) {
    const select = this.elements.voiceSelect;
    if (!select) return;
    
    select.innerHTML = '';
    voices.forEach((voice, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (i === selectedIndex) option.selected = true;
      select.appendChild(option);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Presentation Mode
  // ═══════════════════════════════════════════════════════════════════════
  
  enterPresentationMode() {
    document.body.classList.add("presentation-mode");
  }

  exitPresentationMode() {
    document.body.classList.remove("presentation-mode");
    this.elements.presentationAvatar?.classList.remove("visible", "fading-out");
    this.elements.presentationContainer?.classList.remove("show-logo");
  }

  showAvatar() {
    this.elements.presentationContainer?.classList.add("show-logo");
    this.elements.presentationAvatar?.classList.remove("fading-out");
    this.elements.presentationAvatar?.classList.add("visible");
  }

  hideAvatar() {
    this.elements.presentationAvatar?.classList.add("fading-out");
    setTimeout(() => {
      this.elements.presentationContainer?.classList.remove("show-logo");
      this.elements.presentationAvatar?.classList.remove("visible", "fading-out");
    }, 3000);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS Avatar Fallback
  // ═══════════════════════════════════════════════════════════════════════
  
  showCSSAvatar() {
    if (this.elements.riveWrap) this.elements.riveWrap.style.display = "none";
    if (this.elements.cssAvatar) this.elements.cssAvatar.style.display = "grid";
  }

  showRiveAvatar() {
    if (this.elements.riveWrap) this.elements.riveWrap.style.display = "grid";
    if (this.elements.cssAvatar) this.elements.cssAvatar.style.display = "none";
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Fullscreen
  // ═══════════════════════════════════════════════════════════════════════
  
  setFullscreen(isFullscreen) {
    if (isFullscreen) {
      this.elements.riveWrap?.classList.add("fullscreen");
      this.elements.riveWrap?.requestFullscreen?.().catch(() => {});
    } else {
      this.elements.riveWrap?.classList.remove("fullscreen");
      document.exitFullscreen?.().catch(() => {});
    }
  }
}
