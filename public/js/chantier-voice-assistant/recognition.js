const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isRecognitionSupported() {
  return Boolean(SpeechRecognitionApi);
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

  let listening = false;
  let starting = false;
  let stopRequested = false;

  recognition.onstart = () => {
    starting = false;
    listening = true;
    console.info('[voice] start listening');
    onStateChange('listening');
  };
  recognition.onend = () => {
    const wasListening = listening || starting;
    listening = false;
    starting = false;
    stopRequested = false;
    if (wasListening) {
      console.info('[voice] stop listening');
    }
    onStateChange('stopped');
  };
  recognition.onerror = event => {
    listening = false;
    starting = false;
    stopRequested = false;
    onError(event.error || 'Erreur micro');
  };
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
      if (listening || starting) {
        return false;
      }
      starting = true;
      stopRequested = false;
      try {
        recognition.start();
      } catch (_) {
        starting = false;
        return false;
      }
      return true;
    },
    stop() {
      if (!listening && !starting) {
        return false;
      }
      stopRequested = true;
      try {
        recognition.stop();
      } catch (_) {
        stopRequested = false;
        return false;
      }
      return true;
    },
    isListening() {
      return listening || starting;
    },
    destroy() {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      if (listening || starting || stopRequested) {
        recognition.stop();
      }
    }
  };
}
