import { executeVoiceCommand, previewVoiceCommand } from './api.js';
import {
  createRecognitionController,
  isRecognitionSupported,
  speakText
} from './recognition.js';
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

  const state = {
    context: null,
    token: '',
    transcript: '',
    speechConfidence: null,
    requiresStrongConfirmation: false,
    strongConfirmationChecked: false,
    pendingRedirectUrl: '',
    shouldRefreshOnClose: false
  };

  const recognition = recognitionSupported
    ? createRecognitionController({
        onStateChange(status) {
          if (status === 'listening') {
            ui.setState('listening', 'Parlez maintenant. Je vous écoute.');
          }
        },
        onTranscript({ transcript, isFinal, confidence }) {
          state.transcript = transcript;
          state.speechConfidence = confidence;
          ui.setTranscript(transcript, { interim: !isFinal });
          if (isFinal) {
            void analyzeCommand({ transcript, speechConfidence: confidence });
          }
        },
        onError(errorCode) {
          const message = errorCode === 'not-allowed'
            ? 'Accès au micro refusé. Utilisez la saisie texte.'
            : errorCode === 'no-speech'
              ? 'Aucune voix détectée. Réessayez.'
              : `Erreur micro : ${errorCode}`;
          ui.setState('error', message);
        }
      })
    : null;

  function resetAssistantState({ clearRefresh = false } = {}) {
    state.context = null;
    state.token = '';
    state.transcript = '';
    state.speechConfidence = null;
    state.requiresStrongConfirmation = false;
    state.strongConfirmationChecked = false;
    if (clearRefresh) {
      state.pendingRedirectUrl = '';
      state.shouldRefreshOnClose = false;
    }

    ui.clear();
    ui.setSupportWarning(!recognitionSupported);
    if (ui.elements.listenButton) {
      ui.elements.listenButton.disabled = !recognitionSupported;
    }
    if (ui.elements.stopButton) {
      ui.elements.stopButton.disabled = !recognitionSupported;
    }
    clearHighlightedRows();
  }

  async function promptListening(message = 'Que voulez-vous faire ?') {
    if (!recognition) {
      ui.setState('inactive', message);
      return;
    }

    ui.setState('listening', message);
    await speakText(message);
    try {
      recognition.start();
    } catch (_) {
      ui.setState('error', 'Le micro est déjà en cours d’utilisation.');
    }
  }

  async function analyzeCommand({ transcript, speechConfidence = null, selectedTargetId = null } = {}) {
    const effectiveTranscript = selectedTargetId
      ? ''
      : (typeof transcript === 'string' && transcript.trim()
        ? transcript.trim()
        : (ui.elements.textInput ? ui.elements.textInput.value.trim() : ''));

    if (!effectiveTranscript && !selectedTargetId) {
      ui.setState('error', 'Dictez ou saisissez une commande avant de lancer l’analyse.');
      return;
    }

    ui.setState('analyzing', 'Analyse de la commande en cours…');
    ui.setConfirmState({ visible: false });

    try {
      const data = await previewVoiceCommand({
        transcript: effectiveTranscript,
        speechConfidence,
        filters: collectFilters(),
        selectedTargetId,
        context: state.context,
        returnTo: currentReturnTo()
      });

      state.context = data.context || null;
      if (data.interpretation) {
        ui.renderInterpretation(data.interpretation);
      }

      if (data.stage === 'clarify') {
        state.token = '';
        state.requiresStrongConfirmation = false;
        ui.renderPreview(null);
        ui.renderMatches(data.matches || []);
        ui.setState('need_precision', data.assistantMessage || 'J’ai besoin d’une précision.');
        await speakText(data.assistantMessage || 'J’ai besoin d’une précision.');
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
      ui.setState('preview_ready', data.assistantMessage || 'Prévisualisation prête.');
      highlightRow(data.match ? data.match.id : null);
      await speakText(data.assistantMessage || 'Prévisualisation prête.');
    } catch (error) {
      ui.setState('error', error.message || 'Impossible d’analyser la commande.');
      ui.renderPreview(null);
      ui.setConfirmState({ visible: false });
      await speakText(error.message || 'Impossible d’analyser la commande.');
    }
  }

  async function confirmCommand() {
    if (!state.token) {
      ui.setState('error', 'Aucune prévisualisation prête à confirmer.');
      return;
    }

    ui.setState('confirming', 'Confirmation en cours…');
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
      state.pendingRedirectUrl = data.redirectUrl || currentReturnTo();
      state.shouldRefreshOnClose = Boolean(data.redirectUrl);
      ui.setConfirmState({ visible: false });
      ui.setState('success', `${data.message} Vous pouvez recommencer ou fermer l’assistant.`);
      await speakText(data.message || 'Action exécutée.');
    } catch (error) {
      ui.setState('error', error.message || 'Impossible d’exécuter la commande.');
      await speakText(error.message || 'Impossible d’exécuter la commande.');
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
      void promptListening();
    });
  }

  if (ui.elements.stopButton) {
    ui.elements.stopButton.addEventListener('click', () => {
      if (recognition) {
        recognition.stop();
      }
      ui.setState('inactive', 'Écoute stoppée. Vous pouvez reprendre ou saisir votre commande.');
    });
  }

  if (ui.elements.analyzeButton) {
    ui.elements.analyzeButton.addEventListener('click', () => {
      void analyzeCommand({});
    });
  }

  if (ui.elements.textInput) {
    ui.elements.textInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      void analyzeCommand({});
    });
  }

  if (ui.elements.restartButton) {
    ui.elements.restartButton.addEventListener('click', () => {
      resetAssistantState();
      void promptListening();
    });
  }

  if (ui.elements.confirmButton) {
    ui.elements.confirmButton.addEventListener('click', () => {
      void confirmCommand();
    });
  }

  modal.addEventListener('shown.bs.modal', () => {
    resetAssistantState();
    void promptListening();
  });

  modal.addEventListener('hidden.bs.modal', () => {
    if (recognition) {
      recognition.stop();
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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
