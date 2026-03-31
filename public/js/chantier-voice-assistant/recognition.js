const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isRecognitionSupported() {
  return Boolean(SpeechRecognitionApi);
}

export function isSpeechSynthesisSupported() {
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

export function speakText(text, { lang = 'fr-FR' } = {}) {
  if (!text || !isSpeechSynthesisSupported()) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function createRecognitionController({
  lang = 'fr-FR',
  onStateChange = () => {},
  onTranscript = () => {},
  onError = () => {}
} = {}) {
  if (!isRecognitionSupported()) {
    return null;
  }

  const recognition = new SpeechRecognitionApi();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => onStateChange('listening');
  recognition.onend = () => onStateChange('stopped');
  recognition.onerror = event => onError(event.error || 'Erreur micro');
  recognition.onresult = event => {
    let interimTranscript = '';
    let finalTranscript = '';
    let confidence = null;

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result && result[0] ? result[0] : null;
      if (!alternative) {
        continue;
      }

      if (result.isFinal) {
        finalTranscript += `${alternative.transcript} `;
        if (typeof alternative.confidence === 'number' && !Number.isNaN(alternative.confidence)) {
          confidence = alternative.confidence;
        }
      } else {
        interimTranscript += `${alternative.transcript} `;
      }
    }

    const transcript = (finalTranscript || interimTranscript).trim();
    if (!transcript) {
      return;
    }

    onTranscript({
      transcript,
      isFinal: Boolean(finalTranscript.trim()),
      confidence
    });
  };

  return {
    start() {
      recognition.start();
    },
    stop() {
      recognition.stop();
    },
    destroy() {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
    }
  };
}
