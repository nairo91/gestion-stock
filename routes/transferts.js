const express = require('express');
const router = express.Router();

const { transferParNom } = require('../services/transfertService');

const buildContext = ({ contextType, contextChantierId }) => {
  const type = contextType === 'CHANTIER' ? 'CHANTIER' : 'DEPOT';
  if (type === 'CHANTIER') {
    return { type, chantierId: contextChantierId };
  }
  return { type };
};

const sendFlash = (req, type, message) => {
  if (typeof req.flash === 'function') {
    req.flash(type, message);
  }
};

router.post('/:action(entree|sortie)', async (req, res) => {
  const { action } = req.params;
  const {
    contextType,
    contextChantierId,
    materielId,
    materielName,
    targetChantierId,
    quantite
  } = req.body;

  const normalizedContextType = contextType === 'CHANTIER' ? 'CHANTIER' : 'DEPOT';
  const normalizedChantierId = contextChantierId ? Number(contextChantierId) : null;
  const context = buildContext({ contextType: normalizedContextType, contextChantierId: normalizedChantierId });

  try {
    console.log('[TRANSFERT]', {
      action,
      contextType,
      contextChantierId,
      materielId,
      materielName,
      targetChantierId,
      quantite
    });

    const summary = await transferParNom({
      action: action.toUpperCase(),
      context,
      current: {
        materielId: Number(materielId),
        materielName
      },
      targetChantierId: Number(targetChantierId),
      qty: quantite,
      userId: req.user?.id ?? null
    });

    const message = `${action === 'entree' ? 'Entrée' : 'Sortie'} réalisée avec succès.`;
    sendFlash(req, 'success', message);
    res.redirect(req.get('referer') || '/');
  } catch (error) {
    console.error(error);
    sendFlash(req, 'error', error.message || 'Une erreur est survenue lors du transfert.');
    res.redirect(req.get('referer') || '/');
  }
});

module.exports = router;
