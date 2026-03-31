export function isSpeechSynthesisSupported() {
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

export function createSpeechController({
  lang = 'fr-FR',
  onStart = () => {},
  onEnd = () => {}
} = {}) {
  let speaking = false;
  let currentUtterance = null;

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
