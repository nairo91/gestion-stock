const { compactText, normalizeText, toInt } = require('./utils');

function extractFirstNumber(value) {
  const match = normalizeText(value).match(/\b(\d+)\b/);
  return match ? toInt(match[1]) : null;
}

function extractChantierText(normalizedTranscript) {
  const patterns = [
    /\bsur chantier\s+(.+)$/,
    /\bdu chantier\s+(.+)$/,
    /\bde chantier\s+(.+)$/,
    /\bchantier\s+(.+)$/
  ];

  for (const pattern of patterns) {
    const match = normalizedTranscript.match(pattern);
    if (match && match[1]) {
      return compactText(match[1]);
    }
  }

  return '';
}

function stripCommonTargetNoise(value) {
  return compactText(
    normalizeText(value)
      .replace(/\b(?:la|le|les|du|de la|de l|de|des|un|une|la ligne|ligne|materiel|materiaux|materiau)\b/g, ' ')
      .replace(/\bchantier\s+.+$/, ' ')
  );
}

function extractTrailingValue(normalizedTranscript) {
  const markerMatch = normalizedTranscript.match(/\b(?:a|au|avec|mettre a|mettre|passe a)\s+(.+)$/);
  return markerMatch && markerMatch[1] ? compactText(markerMatch[1]) : '';
}

function extractModifyPayload(rawTranscript, normalizedTranscript) {
  const result = {
    field: null,
    value: null,
    targetText: ''
  };

  const textFieldPatterns = [
    {
      field: 'remarque',
      rawRegex: /\bremarque\b(?:\s+(?:de|du|de la|de l['’]?))?\s*(.*?)\s+(?:à|a|avec|mettre à|mettre a|mettre)\s+(.+)$/i
    },
    {
      field: 'commentaire',
      rawRegex: /\bcommentaire\b(?:\s+(?:de|du|de la|de l['’]?))?\s*(.*?)\s+(?:à|a|avec|mettre à|mettre a|mettre)\s+(.+)$/i
    }
  ];

  for (const pattern of textFieldPatterns) {
    const match = rawTranscript.match(pattern.rawRegex);
    if (match) {
      result.field = pattern.field;
      result.targetText = stripCommonTargetNoise(match[1]);
      result.value = compactText(match[2]);
      return result;
    }
  }

  if (/\bquantite actuelle\b/.test(normalizedTranscript) || /\bstock actuel\b/.test(normalizedTranscript)) {
    result.field = 'quantiteActuelle';
  } else if (/\bquantite recue\b/.test(normalizedTranscript) || /\bquantite recu\b/.test(normalizedTranscript)) {
    result.field = 'quantiteRecue';
  }

  if (!result.field) {
    return result;
  }

  const value = extractFirstNumber(normalizedTranscript);
  result.value = value;

  const target = normalizedTranscript
    .replace(/\bmodifier\b/g, ' ')
    .replace(/\b(?:la|le|les|du|de la|de l|de|des)\b/g, ' ')
    .replace(/\b(?:quantite actuelle|stock actuel|quantite recue|quantite recu)\b/g, ' ')
    .replace(/\b(?:a|avec|mettre a|mettre)\b\s+\d+.*$/, ' ')
    .replace(/\b\d+\b/g, ' ');

  result.targetText = stripCommonTargetNoise(target);
  return result;
}

function detectIntent(normalizedTranscript) {
  if (/\b(?:dupliquer|duplique|copie|clone)\b/.test(normalizedTranscript)) {
    return { intent: 'dupliquer', confidence: 0.88 };
  }

  if (/\b(?:supprimer|supprime|efface|retire|enleve)\b/.test(normalizedTranscript)) {
    return { intent: 'supprimer', confidence: 0.92 };
  }

  if (/\b(?:receptionner|receptionne|recevoir|recois|recoit|livraison recue|livrer)\b/.test(normalizedTranscript)) {
    return { intent: 'receptionner', confidence: 0.9 };
  }

  if (/\b(?:modifier|modifie|change|ajuste|mets a jour|met a jour|actualise)\b/.test(normalizedTranscript)) {
    return { intent: 'modifier', confidence: 0.8 };
  }

  if (/\b(?:ouvrir|ouvre|fiche)\b/.test(normalizedTranscript)) {
    return { intent: 'ouvrir', confidence: 0.84 };
  }

  if (/\b(?:info|infos|information|informations|detail|details|montre|affiche|voir)\b/.test(normalizedTranscript)) {
    return { intent: 'info', confidence: 0.72 };
  }

  return { intent: 'inconnue', confidence: 0.2 };
}

function parseVoiceTranscript(transcript, { speechConfidence = null } = {}) {
  const rawTranscript = compactText(transcript);
  const normalizedTranscript = normalizeText(rawTranscript);
  const chantierText = extractChantierText(normalizedTranscript);
  const intentMatch = detectIntent(normalizedTranscript);
  const result = {
    rawTranscript,
    normalizedTranscript,
    intent: intentMatch.intent,
    targetText: '',
    chantierText,
    fields: {},
    needsConfirmation: intentMatch.intent !== 'inconnue',
    needsDisambiguation: false,
    confidence: intentMatch.confidence,
    speechConfidence: typeof speechConfidence === 'number' ? speechConfidence : null
  };

  if (!normalizedTranscript) {
    return {
      ...result,
      intent: 'inconnue',
      confidence: 0
    };
  }

  if (result.intent === 'receptionner') {
    result.fields.quantiteReceptionnee = extractFirstNumber(normalizedTranscript);
    result.targetText = stripCommonTargetNoise(
      normalizedTranscript
        .replace(/\b(?:receptionner|receptionne|recevoir|recois|recoit|livrer)\b/g, ' ')
        .replace(/\b\d+\b/g, ' ')
    );

    if (!result.fields.quantiteReceptionnee) {
      result.confidence -= 0.22;
    }
  } else if (result.intent === 'modifier') {
    const payload = extractModifyPayload(rawTranscript, normalizedTranscript);
    result.fields.field = payload.field;
    if (payload.field === 'quantiteActuelle') {
      result.fields.quantiteActuelle = payload.value;
    } else if (payload.field === 'quantiteRecue') {
      result.fields.quantiteRecue = payload.value;
    } else if (payload.field === 'remarque') {
      result.fields.remarque = payload.value;
    } else if (payload.field === 'commentaire') {
      result.fields.commentaire = payload.value;
    }

    result.targetText = payload.targetText;
    if (!payload.field) {
      result.confidence -= 0.28;
    }
    if (payload.field && (payload.value === null || payload.value === '')) {
      result.confidence -= 0.18;
    }
  } else if (result.intent === 'ouvrir' || result.intent === 'info') {
    result.targetText = stripCommonTargetNoise(
      normalizedTranscript
        .replace(/\b(?:ouvrir|ouvre|fiche|info|infos|information|informations|detail|details|montre|affiche|voir)\b/g, ' ')
    );
  } else if (result.intent === 'dupliquer') {
    result.targetText = stripCommonTargetNoise(
      normalizedTranscript
        .replace(/\b(?:dupliquer|duplique|copie|clone)\b/g, ' ')
    );
  } else if (result.intent === 'supprimer') {
    result.targetText = stripCommonTargetNoise(
      normalizedTranscript
        .replace(/\b(?:supprimer|supprime|efface|retire|enleve)\b/g, ' ')
    );
    result.fields.requiresStrongConfirmation = true;
  }

  if (result.speechConfidence != null && result.speechConfidence < 0.65) {
    result.confidence = Math.min(result.confidence, 0.55);
  }

  if (!result.targetText && chantierText) {
    result.targetText = '';
  }

  result.confidence = Math.max(0, Math.min(1, Number(result.confidence.toFixed(2))));
  return result;
}

module.exports = {
  parseVoiceTranscript
};
