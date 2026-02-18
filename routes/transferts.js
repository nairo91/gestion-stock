const express = require('express');
const router = express.Router();

const { ensureAuthenticated } = require('./materiel');
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

const resolveRedirectUrl = (req, fallback) => {
  const returnTo = typeof req.body.returnTo === 'string' ? req.body.returnTo.trim() : '';
  if (returnTo.startsWith('/')) {
    return returnTo;
  }
  const referer = req.get('referer');
  if (referer) {
    return referer;
  }
  return fallback;
};

const ensureTransferAuthorization = (req, res, next) => {
  if (!req.user) {
    sendFlash(req, 'error', 'Vous devez être connecté pour réaliser un transfert.');
    return res.redirect('/auth/login');
  }

  const allowedRoles = new Set(['admin', 'user']);
  const { role } = req.user;

  if (role && !allowedRoles.has(role)) {
    sendFlash(req, 'error', "Votre rôle ne permet pas d'effectuer cette opération.");
    return res.redirect(req.get('referer') || '/');
  }

  return next();
};

router.post('/:action(entree|sortie)', ensureAuthenticated, ensureTransferAuthorization, async (req, res) => {
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
  const fallbackRedirect = normalizedContextType === 'CHANTIER' ? '/chantier' : '/materiel';
  const redirectUrl = resolveRedirectUrl(req, fallbackRedirect);

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
    res.redirect(redirectUrl);
  } catch (error) {
    console.error(error);
    sendFlash(req, 'error', error.message || 'Une erreur est survenue lors du transfert.');
    res.redirect(redirectUrl);
  }
});

module.exports = router;
