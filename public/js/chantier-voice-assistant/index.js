import { executeVoiceCommand, previewVoiceCommand } from './api.js';
import { createRecognitionController, isRecognitionSupported } from './recognition.js';
import { createSpeechController, isSpeechSynthesisSupported } from './speech.js';
import { createVoiceAssistantStateMachine } from './stateMachine.js';
import { createVoiceAssistantUI } from './ui.js';

const FILTER_KEYS = [
  'chantierId',
  'categorie',
  'emplacement',
  'fournisseur',
  'marque',
  'doublons',
  'triNom',
  'triAjout',
  'triModification',
  'triReception',
  'recherche',
  'limit',
  'page'
];

function logVoice(message, extra) {
  if (extra === undefined) {
    console.info(`[voice] ${message}`);
    return;
  }
  console.info(`[voice] ${message}`, extra);
}

function collectFilters() {
  const params = new URLSearchParams(window.location.search);
  const filters = {};
  FILTER_KEYS.forEach(key => {
    const value = params.get(key);
    if (value) {
      filters[key] = value;
    }
  });
  return filters;
}

function currentReturnTo() {
  return `${window.location.pathname}${window.location.search}`;
}

function clearHighlightedRows() {
  document.querySelectorAll('tr[data-mc-id].voice-assistant-highlight').forEach(row => {
    row.classList.remove('voice-assistant-highlight');
  });
}

function highlightRow(mcId) {
  clearHighlightedRows();
  if (!mcId) {
    return;
  }
  const row = document.querySelector(`tr[data-mc-id="${String(mcId).replace(/"/g, '\\"')}"]`);
  if (!row) {
    return;
  }
  row.classList.add('voice-assistant-highlight');
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('voiceAssistantModal');
  if (!modal) {
    return;
  }

  const ui = createVoiceAssistantUI(modal);
  const recognitionSupported = isRecognitionSupported();
  const speechSupported = isSpeechSynthesisSupported();

  const state = {
    context: null,
    token: '',
    transcript: '',
    speechConfidence: null,
    requiresStrongConfirmation: false,
    strongConfirmationChecked: false,
    pendingRedirectUrl: '',
    shouldRefreshOnClose: false,
    lastQuestion: '',
    lastAssistantMessage: 'Que voulez-vous faire ?'
  };

  const stateMachine = createVoiceAssistantStateMachine({
    onTransition({ previousState, nextState }) {
      logVoice(`state ${previousState} -> ${nextState}`);
    }
  });

  const speech = createSpeechController({
    onStart(text) {
      setAssistantState('speaking', text);
    }
  });

  const recognition = recognitionSupported
    ? createRecognitionController({
        onStateChange(status) {
          if (status === 'listening') {
            setAssistantState('listening', state.lastAssistantMessage || 'Je vous ecoute.');
            syncControls();
            return;
          }

          if (status === 'stopped') {
            const currentState = stateMachine.getState();
            if (!['processing', 'speaking', 'preview_ready', 'executing', 'success', 'error'].includes(currentState)) {
              if (isAwaitingAnswer()) {
                setAssistantState('awaiting_user_answer', state.lastQuestion || state.lastAssistantMessage || 'Je vous ecoute.');
              } else {
                setAssistantState('idle', state.lastAssistantMessage || 'Que voulez-vous faire ?');
              }
            }
            syncControls();
          }
        },
        onTranscript({ transcript, isFinal, confidence }) {
          state.transcript = transcript;
          state.speechConfidence = confidence;
          ui.setTranscript(transcript, { interim: !isFinal });
          if (!isFinal) {
            return;
          }
          logVoice('user input received', transcript);
          void analyzeCommand({ transcript, speechConfidence: confidence });
        },
        onError(errorCode) {
          const waitingForAnswer = isAwaitingAnswer();
          const message = errorCode === 'not-allowed'
            ? 'Acces au micro refuse. Utilisez la saisie texte.'
            : errorCode === 'no-speech'
              ? 'Aucune voix detectee. Vous pouvez repondre a nouveau.'
              : `Erreur micro : ${errorCode}`;

          if (waitingForAnswer && errorCode === 'no-speech') {
            setAssistantState('awaiting_user_answer', message);
            syncControls();
            return;
          }

          setAssistantState('error', message);
          syncControls();
        }
      })
    : null;

  function isAwaitingAnswer() {
    return Boolean(
      state.context &&
      (
        state.context.pendingQuestion ||
        (Array.isArray(state.context.candidateIds) && state.context.candidateIds.length > 0)
      )
    );
  }

  function setAssistantState(nextState, message = '') {
    stateMachine.transition(nextState, { message });
    if (message) {
      state.lastAssistantMessage = message;
    }
    ui.setState(nextState, message || state.lastAssistantMessage || 'Que voulez-vous faire ?');
  }

  function syncControls() {
    const currentState = stateMachine.getState();
    const listening = Boolean(recognition && recognition.isListening());
    const blockedBySpeech = speechSupported && speech.isSpeaking();
    const canManualListen = recognitionSupported && !blockedBySpeech && currentState !== 'executing';
    const canRespond = recognitionSupported && !blockedBySpeech && isAwaitingAnswer() && currentState !== 'executing';
    const canRepeat = Boolean(state.lastQuestion) && currentState !== 'executing';

    if (ui.elements.listenButton) {
      ui.elements.listenButton.disabled = !canManualListen;
    }
    if (ui.elements.stopButton) {
      ui.elements.stopButton.disabled = !(listening || blockedBySpeech);
    }
    if (ui.elements.analyzeButton) {
      ui.elements.analyzeButton.disabled = currentState === 'executing';
    }
    if (ui.elements.textInput) {
      ui.elements.textInput.disabled = currentState === 'executing';
    }

    ui.setConversationActions({
      canRespond,
      canRepeat
    });
    ui.setSupportWarning(!recognitionSupported);
  }

  function resetAssistantState({ clearRefresh = false } = {}) {
    state.context = null;
    state.token = '';
    state.transcript = '';
    state.speechConfidence = null;
    state.requiresStrongConfirmation = false;
    state.strongConfirmationChecked = false;
    state.lastQuestion = '';
    state.lastAssistantMessage = 'Que voulez-vous faire ?';
    if (clearRefresh) {
      state.pendingRedirectUrl = '';
      state.shouldRefreshOnClose = false;
    }

    ui.clear();
    clearHighlightedRows();
    setAssistantState('idle', 'Que voulez-vous faire ?');
    syncControls();
  }

  function stopInteractiveAudio() {
    if (recognition) {
      recognition.stop();
    }
    speech.cancel();
    syncControls();
  }

  function startListening({ message = state.lastQuestion || state.lastAssistantMessage || 'Que voulez-vous faire ?' } = {}) {
    if (!recognition) {
      setAssistantState('idle', message);
      syncControls();
      return false;
    }

    if (speech.isSpeaking()) {
      return false;
    }

    const started = recognition.start();
    if (!started) {
      syncControls();
      return false;
    }

    setAssistantState('listening', message);
    syncControls();
    return true;
  }

  async function speakAssistantMessage(message, {
    afterState = 'idle',
    autoListen = false,
    rememberQuestion = false
  } = {}) {
    const finalMessage = message || 'Que voulez-vous faire ?';
    if (rememberQuestion) {
      state.lastQuestion = finalMessage;
    }
    state.lastAssistantMessage = finalMessage;

    if (recognition && recognition.isListening()) {
      recognition.stop();
    }

    if (!speechSupported) {
      if (autoListen) {
        setAssistantState('awaiting_user_answer', finalMessage);
        logVoice('awaiting answer');
        startListening({ message: finalMessage });
        return;
      }
      setAssistantState(afterState, finalMessage);
      syncControls();
      return;
    }

    setAssistantState('speaking', finalMessage);
    syncControls();
    await speech.speak(finalMessage);

    if (autoListen) {
      setAssistantState('awaiting_user_answer', finalMessage);
      logVoice('awaiting answer');
      startListening({ message: finalMessage });
      return;
    }

    setAssistantState(afterState, finalMessage);
    syncControls();
  }

  async function handleAssistantStep(data) {
    state.context = data.context || null;
    if (data.interpretation) {
      ui.renderInterpretation(data.interpretation);
    }

    if (data.stage === 'clarify') {
      state.token = '';
      state.requiresStrongConfirmation = false;
      ui.renderPreview(null);
      ui.setConfirmState({ visible: false });
      ui.renderMatches(data.matches || []);
      highlightRow(null);
      await speakAssistantMessage(
        data.assistantMessage || 'J ai besoin d une precision.',
        {
          afterState: 'awaiting_user_answer',
          autoListen: recognitionSupported,
          rememberQuestion: true
        }
      );
      return;
    }

    if (data.stage === 'question') {
      state.token = '';
      state.requiresStrongConfirmation = false;
      ui.renderPreview(null);
      ui.setConfirmState({ visible: false });
      ui.renderMatches(data.match ? [data.match] : (data.matches || []));
      highlightRow(data.match ? data.match.id : null);
      await speakAssistantMessage(
        data.assistantMessage || (data.question ? data.question.prompt : 'Je vous ecoute.'),
        {
          afterState: 'awaiting_user_answer',
          autoListen: recognitionSupported,
          rememberQuestion: true
        }
      );
      return;
    }

    state.token = data.token;
    state.requiresStrongConfirmation = Boolean(data.requiresStrongConfirmation);
    state.strongConfirmationChecked = false;
    ui.renderMatches(data.match ? [data.match] : []);
    ui.renderPreview(data.preview || null);
    ui.setConfirmState({
      visible: true,
      label: data.confirmationLabel || 'Confirmer',
      strong: state.requiresStrongConfirmation
    });
    highlightRow(data.match ? data.match.id : null);
    logVoice('preview ready');
    await speakAssistantMessage(
      data.assistantMessage || 'Previsualisation prete.',
      {
        afterState: 'preview_ready'
      }
    );
  }

  async function analyzeCommand({ transcript, speechConfidence = null, selectedTargetId = null } = {}) {
    const effectiveTranscript = selectedTargetId
      ? ''
      : (typeof transcript === 'string' && transcript.trim()
        ? transcript.trim()
        : (ui.elements.textInput ? ui.elements.textInput.value.trim() : ''));

    if (!effectiveTranscript && !selectedTargetId) {
      setAssistantState('error', 'Dictez ou saisissez une commande avant de lancer l analyse.');
      syncControls();
      return;
    }

    setAssistantState('processing', 'Analyse de la commande en cours...');
    ui.setConfirmState({ visible: false });
    syncControls();

    try {
      const data = await previewVoiceCommand({
        transcript: effectiveTranscript,
        speechConfidence,
        filters: collectFilters(),
        selectedTargetId,
        context: state.context,
        returnTo: currentReturnTo()
      });

      await handleAssistantStep(data);
    } catch (error) {
      ui.renderPreview(null);
      ui.setConfirmState({ visible: false });
      setAssistantState('error', error.message || 'Impossible d analyser la commande.');
      syncControls();
    }
  }

  async function confirmCommand() {
    if (!state.token) {
      setAssistantState('error', 'Aucune previsualisation prete a confirmer.');
      syncControls();
      return;
    }

    logVoice('execute confirmed');
    if (recognition) {
      recognition.stop();
    }
    speech.cancel();
    setAssistantState('executing', 'Execution en cours...');
    syncControls();

    try {
      const data = await executeVoiceCommand({
        token: state.token,
        strongConfirmation: state.requiresStrongConfirmation ? state.strongConfirmationChecked : false,
        returnTo: currentReturnTo()
      });

      if (data.redirectUrl && /\/chantier\/materielChantier\/info\//.test(data.redirectUrl)) {
        window.location.assign(data.redirectUrl);
        return;
      }

      state.token = '';
      state.context = null;
      state.requiresStrongConfirmation = false;
      state.strongConfirmationChecked = false;
      state.pendingRedirectUrl = data.redirectUrl || currentReturnTo();
      state.shouldRefreshOnClose = Boolean(data.redirectUrl);
      ui.setConfirmState({ visible: false });

      await speakAssistantMessage(
        `${data.message} Vous pouvez recommencer ou fermer l assistant.`,
        { afterState: 'success' }
      );
    } catch (error) {
      setAssistantState('error', error.message || 'Impossible d executer la commande.');
      syncControls();
    }
  }

  ui.bindMatchSelection(targetId => {
    void analyzeCommand({ selectedTargetId: targetId });
  });

  ui.bindStrongConfirmation(checked => {
    state.strongConfirmationChecked = checked;
  });

  if (ui.elements.listenButton) {
    ui.elements.listenButton.addEventListener('click', () => {
      startListening({ message: state.lastAssistantMessage || 'Que voulez-vous faire ?' });
    });
  }

  if (ui.elements.respondButton) {
    ui.elements.respondButton.addEventListener('click', () => {
      startListening({ message: state.lastQuestion || state.lastAssistantMessage || 'Je vous ecoute.' });
    });
  }

  if (ui.elements.repeatButton) {
    ui.elements.repeatButton.addEventListener('click', () => {
      if (!state.lastQuestion) {
        return;
      }
      void speakAssistantMessage(state.lastQuestion, {
        afterState: isAwaitingAnswer() ? 'awaiting_user_answer' : 'idle',
        autoListen: recognitionSupported && isAwaitingAnswer(),
        rememberQuestion: true
      });
    });
  }

  if (ui.elements.stopButton) {
    ui.elements.stopButton.addEventListener('click', () => {
      stopInteractiveAudio();
      setAssistantState('idle', 'Ecoute stoppee. Vous pouvez reprendre ou saisir votre commande.');
      syncControls();
    });
  }

  if (ui.elements.analyzeButton) {
    ui.elements.analyzeButton.addEventListener('click', () => {
      if (ui.elements.textInput) {
        logVoice('user input received', ui.elements.textInput.value.trim());
      }
      void analyzeCommand({});
    });
  }

  if (ui.elements.textInput) {
    ui.elements.textInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      logVoice('user input received', ui.elements.textInput.value.trim());
      void analyzeCommand({});
    });
  }

  if (ui.elements.restartButton) {
    ui.elements.restartButton.addEventListener('click', () => {
      stopInteractiveAudio();
      resetAssistantState();
      void speakAssistantMessage('Que voulez-vous faire ?', {
        afterState: recognitionSupported ? 'awaiting_user_answer' : 'idle',
        autoListen: recognitionSupported,
        rememberQuestion: true
      });
    });
  }

  if (ui.elements.confirmButton) {
    ui.elements.confirmButton.addEventListener('click', () => {
      void confirmCommand();
    });
  }

  modal.addEventListener('shown.bs.modal', () => {
    resetAssistantState();
    void speakAssistantMessage('Que voulez-vous faire ?', {
      afterState: recognitionSupported ? 'awaiting_user_answer' : 'idle',
      autoListen: recognitionSupported,
      rememberQuestion: true
    });
  });

  modal.addEventListener('hidden.bs.modal', () => {
    stopInteractiveAudio();
    clearHighlightedRows();

    if (state.shouldRefreshOnClose && state.pendingRedirectUrl) {
      const redirectUrl = state.pendingRedirectUrl;
      resetAssistantState({ clearRefresh: true });
      window.location.assign(redirectUrl);
      return;
    }

    resetAssistantState({ clearRefresh: true });
  });

  resetAssistantState({ clearRefresh: true });
});
