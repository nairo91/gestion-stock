function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATE_META = {
  idle: { label: 'Inactif', className: 'bg-secondary' },
  listening: { label: 'Ecoute', className: 'bg-danger' },
  speaking: { label: 'Parle', className: 'bg-info text-dark' },
  processing: { label: 'Analyse', className: 'bg-warning text-dark' },
  awaiting_user_answer: { label: 'Reponse attendue', className: 'bg-info text-dark' },
  preview_ready: { label: 'Preview prete', className: 'bg-primary' },
  executing: { label: 'Execution', className: 'bg-warning text-dark' },
  success: { label: 'Succès', className: 'bg-success' },
  error: { label: 'Erreur', className: 'bg-danger' }
};

export function createVoiceAssistantUI(root) {
  const elements = {
    supportWarning: root.querySelector('[data-role="support-warning"]'),
    stateBadge: root.querySelector('[data-role="state-badge"]'),
    assistantMessage: root.querySelector('[data-role="assistant-message"]'),
    transcript: root.querySelector('[data-role="transcript"]'),
    textInput: root.querySelector('[data-role="text-input"]'),
    listenButton: root.querySelector('[data-role="listen-button"]'),
    stopButton: root.querySelector('[data-role="stop-button"]'),
    respondButton: root.querySelector('[data-role="respond-button"]'),
    repeatButton: root.querySelector('[data-role="repeat-button"]'),
    analyzeButton: root.querySelector('[data-role="analyze-button"]'),
    restartButton: root.querySelector('[data-role="restart-button"]'),
    confirmButton: root.querySelector('[data-role="confirm-button"]'),
    confirmationHint: root.querySelector('[data-role="confirmation-hint"]'),
    strongConfirmWrap: root.querySelector('[data-role="strong-confirm-wrap"]'),
    strongConfirmInput: root.querySelector('[data-role="strong-confirm-input"]'),
    intent: root.querySelector('[data-role="intent"]'),
    target: root.querySelector('[data-role="target"]'),
    matches: root.querySelector('[data-role="matches"]'),
    preview: root.querySelector('[data-role="preview"]')
  };

  function setState(stateKey, message = '') {
    const meta = STATE_META[stateKey] || STATE_META.idle;
    if (elements.stateBadge) {
      elements.stateBadge.className = `badge ${meta.className}`;
      elements.stateBadge.textContent = meta.label;
    }
    if (elements.assistantMessage) {
      elements.assistantMessage.textContent = message || 'Que voulez-vous faire ?';
    }
  }

  function setSupportWarning(visible, message = '') {
    if (!elements.supportWarning) {
      return;
    }
    elements.supportWarning.classList.toggle('d-none', !visible);
    elements.supportWarning.textContent = message || 'La reconnaissance vocale n’est pas disponible sur ce navigateur. Utilisez la saisie texte.';
  }

  function setConversationActions({ canRespond = false, canRepeat = false } = {}) {
    if (elements.respondButton) {
      elements.respondButton.disabled = !canRespond;
    }
    if (elements.repeatButton) {
      elements.repeatButton.disabled = !canRepeat;
    }
  }

  function setTranscript(text, { interim = false } = {}) {
    if (!elements.transcript) {
      return;
    }
    elements.transcript.textContent = text || 'Aucune transcription pour le moment.';
    elements.transcript.classList.toggle('is-interim', interim);
  }

  function renderInterpretation(interpretation) {
    if (!elements.intent || !elements.target) {
      return;
    }

     if (!interpretation) {
      elements.intent.innerHTML = `
        <div><strong>Action détectée :</strong> -</div>
        <div><strong>Confiance :</strong> -</div>
      `;
      elements.target.innerHTML = `
        <div><strong>Cible demandée :</strong> -</div>
        <div><strong>Chantier :</strong> -</div>
      `;
      return;
    }

    const intentLabel = interpretation.intent ? interpretation.intent : 'inconnue';
    const confidence = typeof interpretation.confidence === 'number'
      ? `${Math.round(interpretation.confidence * 100)}%`
      : '-';

    elements.intent.innerHTML = `
      <div><strong>Action détectée :</strong> ${escapeHtml(intentLabel)}</div>
      <div><strong>Confiance :</strong> ${escapeHtml(confidence)}</div>
    `;

    elements.target.innerHTML = `
      <div><strong>Cible demandée :</strong> ${escapeHtml(interpretation && interpretation.targetText ? interpretation.targetText : '-')}</div>
      <div><strong>Chantier :</strong> ${escapeHtml(interpretation && interpretation.chantierText ? interpretation.chantierText : '-')}</div>
    `;
  }

  function renderMatches(matches = []) {
    if (!elements.matches) {
      return;
    }

    if (!matches.length) {
      elements.matches.innerHTML = '<div class="text-muted small">Aucune désambiguïsation requise.</div>';
      return;
    }

    elements.matches.innerHTML = matches.map(match => `
      <button
        type="button"
        class="list-group-item list-group-item-action voice-assistant-match"
        data-target-id="${escapeHtml(match.id)}"
      >
        <div class="fw-semibold">${escapeHtml(match.label)}</div>
        <div class="small text-muted">Qté actuelle: ${escapeHtml(match.quantiteActuelle)} | Qté reçue: ${escapeHtml(match.quantiteRecue)}</div>
      </button>
    `).join('');
  }

  function renderPreview(preview = null) {
    if (!elements.preview) {
      return;
    }

    if (!preview) {
      elements.preview.innerHTML = '<div class="text-muted">La prévisualisation apparaîtra ici.</div>';
      return;
    }

    const summaryHtml = (preview.summary || [])
      .map(line => `<li>${escapeHtml(line)}</li>`)
      .join('');
    const impactHtml = (preview.impacts || [])
      .map(line => `<li>${escapeHtml(line)}</li>`)
      .join('');

    elements.preview.innerHTML = `
      <div class="voice-assistant-preview-card">
        <h6 class="mb-3">${escapeHtml(preview.title || 'Prévisualisation')}</h6>
        <div class="mb-3">
          <div class="small text-uppercase text-muted mb-2">Résumé</div>
          <ul class="mb-0">${summaryHtml}</ul>
        </div>
        <div class="mb-3">
          <div class="small text-uppercase text-muted mb-2">Impact prévu</div>
          <ul class="mb-0">${impactHtml}</ul>
        </div>
        <div class="alert alert-light border mb-0">${escapeHtml(preview.notice || 'Aucune écriture en base n’est faite avant confirmation.')}</div>
      </div>
    `;
  }

  function setConfirmState({ visible, label = 'Confirmer', strong = false } = {}) {
    if (elements.confirmButton) {
      elements.confirmButton.classList.toggle('d-none', !visible);
      elements.confirmButton.textContent = label;
      elements.confirmButton.disabled = Boolean(strong);
    }
    if (elements.confirmationHint) {
      elements.confirmationHint.classList.toggle('d-none', !strong);
      elements.confirmationHint.textContent = strong
        ? 'Suppression : cochez la confirmation dédiée avant exécution.'
        : '';
    }
    if (elements.strongConfirmWrap) {
      elements.strongConfirmWrap.classList.toggle('d-none', !strong);
    }
    if (elements.strongConfirmInput) {
      elements.strongConfirmInput.checked = false;
    }
  }

  function bindMatchSelection(handler) {
    if (!elements.matches) {
      return;
    }

    elements.matches.addEventListener('click', event => {
      const button = event.target.closest('[data-target-id]');
      if (!button) {
        return;
      }
      handler(button.getAttribute('data-target-id'));
    });
  }

  function clear() {
    setState('idle', 'Que voulez-vous faire ?');
    setTranscript('');
    renderInterpretation(null);
    renderMatches([]);
    renderPreview(null);
    setConfirmState({ visible: false });
    setConversationActions({ canRespond: false, canRepeat: false });
    if (elements.textInput) {
      elements.textInput.value = '';
    }
  }

  function bindStrongConfirmation(handler) {
    if (!elements.strongConfirmInput) {
      return;
    }

    elements.strongConfirmInput.addEventListener('change', event => {
      const checked = Boolean(event.target && event.target.checked);
      if (elements.confirmButton) {
        elements.confirmButton.disabled = !checked;
      }
      handler(checked);
    });
  }

  return {
    elements,
    bindStrongConfirmation,
    clear,
    renderInterpretation,
    renderMatches,
    renderPreview,
    setConfirmState,
    setConversationActions,
    setState,
    setSupportWarning,
    setTranscript,
    bindMatchSelection
  };
}
