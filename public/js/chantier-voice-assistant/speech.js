export function isSpeechSynthesisSupported() {
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

function selectFrenchVoice(lang) {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const frVoices = voices.filter(v => v.lang && v.lang.startsWith('fr'));
  // Prefer exact match (fr-FR), then local/native voices, then any French
  const exactMatch = frVoices.filter(v => v.lang === lang);
  const local = exactMatch.filter(v => v.localService);
  if (local.length) return local[0];
  if (exactMatch.length) return exactMatch[0];
  const localAny = frVoices.filter(v => v.localService);
  if (localAny.length) return localAny[0];
  return frVoices.length ? frVoices[0] : null;
}

export function createSpeechController({
  lang = 'fr-FR',
  rate = 1.0,
  onStart = () => {},
  onEnd = () => {}
} = {}) {
  let speaking = false;
  let currentUtterance = null;
  let selectedVoice = null;

  // Voices may not be loaded immediately — load them once they're ready
  if (isSpeechSynthesisSupported()) {
    const trySelectVoice = () => {
      selectedVoice = selectFrenchVoice(lang);
    };
    trySelectVoice();
    window.speechSynthesis.addEventListener('voiceschanged', trySelectVoice);
  }

  function markEnded(text) {
    speaking = false;
    currentUtterance = null;
    console.info('[voice] speech ended');
    onEnd(text);
  }

  return {
    async speak(text) {
      if (!text || !isSpeechSynthesisSupported()) {
        return false;
      }

      if (currentUtterance || speaking) {
        window.speechSynthesis.cancel();
      }

      return new Promise(resolve => {
        const utterance = new window.SpeechSynthesisUtterance(text);
        currentUtterance = utterance;
        utterance.lang = lang;
        utterance.rate = rate;
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        utterance.onstart = () => {
          speaking = true;
          console.info('[voice] speech started');
          onStart(text);
        };
        utterance.onend = () => {
          markEnded(text);
          resolve(true);
        };
        utterance.onerror = () => {
          markEnded(text);
          resolve(false);
        };
        window.speechSynthesis.speak(utterance);
      });
    },
    cancel() {
      if (!isSpeechSynthesisSupported()) {
        return;
      }
      if (speaking || currentUtterance) {
        window.speechSynthesis.cancel();
        speaking = false;
        currentUtterance = null;
        console.info('[voice] speech ended');
      }
    },
    isSpeaking() {
      return speaking;
    }
  };
}
