// Browser Web Speech API utility for rural inclusion & spoken farmer advisories

class SpeechEngine {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  public isSpeaking: boolean = false;
  private listeners: Set<(speaking: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public subscribe(listener: (speaking: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.isSpeaking);
    return () => this.listeners.delete(listener);
  }

  private notify(speaking: boolean) {
    this.isSpeaking = speaking;
    this.listeners.forEach((l) => l(speaking));
  }

  public speak(text: string, lang: "en" | "sw" = "en") {
    if (!this.synth) {
      console.warn("Speech synthesis not supported on this device/browser.");
      return;
    }

    this.stop();

    // Clean markdown, symbols, and bullets for natural reading
    const cleanText = text
      .replace(/[*#•—_`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95; // slightly slower for clarity in rural agriculture
    utterance.pitch = 1.0;

    // Detect language or fallback
    if (lang === "sw") {
      utterance.lang = "sw-KE"; // Swahili (Kenya)
    } else {
      utterance.lang = "en-KE"; // English (Kenya)
    }

    utterance.onstart = () => this.notify(true);
    utterance.onend = () => this.notify(false);
    utterance.onerror = () => this.notify(false);

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
      this.notify(false);
    }
  }
}

export const speech = new SpeechEngine();
