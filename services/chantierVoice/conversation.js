const { compactText, extractSpokenQuantity, normalizeText } = require('./utils');

const MODIFY_FIELD_META = {
  quantiteActuelle: {
    label: 'quantite actuelle',
    expected: 'number'
  },
  quantiteRecue: {
    label: 'quantite recue',
    expected: 'number'
  },
  remarque: {
    label: 'remarque',
    expected: 'text'
  },
  commentaire: {
    label: 'commentaire',
    expected: 'text'
  }
};

function cloneInterpretation(interpretation) {
  return {
    ...interpretation,
    fields: {
      ...(interpretation && interpretation.fields ? interpretation.fields : {})
    }
  };
}

function extractFirstNumber(value) {
  return extractSpokenQuantity(value);
}

function detectModifyFieldFromAnswer(transcript) {
  const normalized = normalizeText(transcript);

  if (/\bquantite actuelle\b/.test(normalized) || /\bstock actuel\b/.test(normalized)) {
    return 'quantiteActuelle';
  }

  if (/\bquantite recue\b/.test(normalized) || /\bquantite recu\b/.test(normalized)) {
    return 'quantiteRecue';
  }

  if (/\bremarque\b/.test(normalized)) {
    return 'remarque';
  }

  if (/\bcommentaire\b/.test(normalized)) {
    return 'commentaire';
  }

  return null;
}

function buildQuestionStepFromInterpretation(interpretation) {
  if (!interpretation || !interpretation.intent) {
    return null;
  }

  if (interpretation.intent === 'receptionner' && !interpretation.fields.quantiteReceptionnee) {
    return {
      assistantMessage: 'Quelle quantité souhaitez-vous réceptionner ?',
      question: {
        type: 'quantite_reception',
        prompt: 'Quelle quantité souhaitez-vous réceptionner ?',
        expected: 'number'
      }
    };
  }

  if (interpretation.intent !== 'modifier') {
    return null;
  }

  const field = interpretation.fields.field;
  if (!field) {
    return {
      assistantMessage: 'Quel champ souhaitez-vous modifier ? La quantité actuelle, la quantité reçue, la remarque ou le commentaire ?',
      question: {
        type: 'modify_field',
        prompt: 'Quel champ souhaitez-vous modifier ? La quantité actuelle, la quantité reçue, la remarque ou le commentaire ?',
        expected: 'field'
      }
    };
  }

  const meta = MODIFY_FIELD_META[field];
  const value = field === 'quantiteActuelle'
    ? interpretation.fields.quantiteActuelle
    : field === 'quantiteRecue'
      ? interpretation.fields.quantiteRecue
      : field === 'remarque'
        ? interpretation.fields.remarque
        : interpretation.fields.commentaire;

  if (value !== null && value !== undefined && value !== '') {
    return null;
  }

  const fieldLabel = meta ? meta.label : 'ce champ';
  return {
    assistantMessage: `Quelle est la nouvelle valeur pour ${fieldLabel} ?`,
    question: {
      type: 'modify_value',
      prompt: `Quelle est la nouvelle valeur pour ${fieldLabel} ?`,
      expected: meta ? meta.expected : 'text',
      field
    }
  };
}

function applyPendingQuestionAnswer({ interpretation, pendingQuestion, transcript }) {
  const nextInterpretation = cloneInterpretation(interpretation);
  const answerText = compactText(transcript);

  if (!pendingQuestion) {
    return {
      answered: true,
      interpretation: nextInterpretation
    };
  }

  if (!answerText) {
    return {
      answered: false,
      interpretation: nextInterpretation,
      message: pendingQuestion.prompt || 'Je n\'ai pas entendu votre réponse, pouvez-vous répéter ?'
    };
  }

  if (pendingQuestion.type === 'quantite_reception') {
    const quantity = extractFirstNumber(answerText);
    if (quantity == null || quantity <= 0) {
      return {
        answered: false,
        interpretation: nextInterpretation,
        message: 'Je n\'ai pas compris la quantité. Dites simplement un nombre, par exemple « cinq » ou « 12 ».'
      };
    }

    nextInterpretation.fields.quantiteReceptionnee = quantity;
    return {
      answered: true,
      interpretation: nextInterpretation
    };
  }

  if (pendingQuestion.type === 'modify_field') {
    const field = detectModifyFieldFromAnswer(answerText);
    if (!field) {
      return {
        answered: false,
        interpretation: nextInterpretation,
        message: 'Je n\'ai pas reconnu ce champ. Dites : quantité actuelle, quantité reçue, remarque ou commentaire.'
      };
    }

    nextInterpretation.fields.field = field;
    return {
      answered: true,
      interpretation: nextInterpretation
    };
  }

  if (pendingQuestion.type === 'modify_value') {
    const field = pendingQuestion.field || nextInterpretation.fields.field;
    if (!field) {
      return {
        answered: false,
        interpretation: nextInterpretation,
        message: 'Je ne sais plus quel champ modifier. Veuillez recommencer la commande.'
      };
    }

    const meta = MODIFY_FIELD_META[field];
    if (meta && meta.expected === 'number') {
      const quantity = extractFirstNumber(answerText);
      if (quantity == null || quantity < 0) {
        return {
          answered: false,
          interpretation: nextInterpretation,
          message: 'Je n\'ai pas compris la valeur. Dites simplement un nombre, par exemple « dix » ou « 25 ».'
        };
      }

      if (field === 'quantiteActuelle') {
        nextInterpretation.fields.quantiteActuelle = quantity;
      } else if (field === 'quantiteRecue') {
        nextInterpretation.fields.quantiteRecue = quantity;
      }
    } else if (field === 'remarque') {
      nextInterpretation.fields.remarque = answerText;
    } else if (field === 'commentaire') {
      nextInterpretation.fields.commentaire = answerText;
    }

    nextInterpretation.fields.field = field;
    return {
      answered: true,
      interpretation: nextInterpretation
    };
  }

  return {
    answered: false,
    interpretation: nextInterpretation,
    message: pendingQuestion.prompt || 'Je n\'ai pas compris votre réponse, pouvez-vous reformuler ?'
  };
}

module.exports = {
  applyPendingQuestionAnswer,
  buildQuestionStepFromInterpretation
};
