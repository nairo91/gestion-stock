const {
  executeDelete,
  executeDuplicateClone,
  executeQuickEdit,
  executeReception,
  createHttpError
} = require('../chantierStockActionService');

async function executeVoiceAction(action, { userId = null } = {}) {
  if (!action || !action.type || !action.materielChantierId) {
    throw createHttpError('Action vocale invalide.', 400);
  }

  if (action.type === 'receptionner') {
    const result = await executeReception({
      mcId: action.materielChantierId,
      receptionQty: action.payload ? action.payload.quantiteReceptionnee : null,
      userId,
      source: 'voice',
      allocationMode: 'auto'
    });

    return {
      type: 'mutation',
      message: `Réception enregistrée : +${result.preview.quantity}.`,
      highlightId: result.mc.id
    };
  }

  if (action.type === 'modifier') {
    const payload = action.payload || {};
    const result = await executeQuickEdit({
      mcId: action.materielChantierId,
      fieldName: payload.field,
      value: payload.value,
      userId,
      source: 'voice'
    });

    return {
      type: 'mutation',
      message: 'Modification enregistrée.',
      highlightId: result.mc.id
    };
  }

  if (action.type === 'dupliquer') {
    const result = await executeDuplicateClone({
      mcId: action.materielChantierId,
      userId,
      source: 'voice'
    });

    return {
      type: 'mutation',
      message: 'Duplication effectuée.',
      highlightId: result.duplicateMc.id
    };
  }

  if (action.type === 'supprimer') {
    const result = await executeDelete({
      mcId: action.materielChantierId,
      userId,
      source: 'voice'
    });

    return {
      type: 'mutation',
      message: `Ligne supprimée : ${result.nom}.`,
      highlightId: null
    };
  }

  if (action.type === 'ouvrir' || action.type === 'info') {
    return {
      type: 'navigation',
      message: 'Ouverture de la fiche.',
      redirectUrl: action.payload ? action.payload.redirectUrl : null
    };
  }

  throw createHttpError('Type d’action vocale non supporté.', 400);
}

module.exports = {
  executeVoiceAction
};
