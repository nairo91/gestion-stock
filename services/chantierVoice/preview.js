const {
  buildQuickEditPreview,
  buildReceptionPreview,
  createHttpError
} = require('../chantierStockActionService');
const { buildQuestionStepFromInterpretation } = require('./conversation');

function buildTargetLine(candidate) {
  return `${candidate.nom} • ${candidate.chantierNom}`;
}

function buildReceptionImpactLines(preview) {
  const impacts = [
    `Quantité reçue : ${preview.oldQuantiteRecue} ➜ ${preview.newQuantiteRecue}`,
    `Quantité actuelle : ${preview.oldQuantiteActuelle} ➜ ${preview.newQuantiteActuelle}`
  ];

  preview.allocation.slotChanges.forEach(slot => {
    impacts.push(`Livraison ${slot.index} : ${slot.before} ➜ ${slot.after}`);
  });

  if (preview.allocation.legacy.before !== preview.allocation.legacy.after) {
    impacts.push(`Prévision globale : ${preview.allocation.legacy.before} ➜ ${preview.allocation.legacy.after}`);
  }

  if (!preview.allocation.slotChanges.length && preview.allocation.legacy.before === preview.allocation.legacy.after) {
    impacts.push('Aucune livraison prévue n’est décrémentée automatiquement.');
  }

  return impacts;
}

function getModifyFieldValue(fields, field) {
  if (field === 'quantiteActuelle') return fields.quantiteActuelle;
  if (field === 'quantiteRecue') return fields.quantiteRecue;
  if (field === 'remarque') return fields.remarque;
  if (field === 'commentaire') return fields.commentaire;
  return null;
}

function buildPreviewFromMatch({ interpretation, candidate }) {
  if (!candidate) {
    throw createHttpError('Aucune ligne sélectionnée pour la prévisualisation.', 400);
  }

  if (interpretation.intent === 'receptionner') {
    const quantity = interpretation.fields.quantiteReceptionnee;
    if (!quantity) {
      throw createHttpError('Précisez la quantité à réceptionner.', 400);
    }

    const preview = buildReceptionPreview(candidate.raw, {
      receptionQty: quantity,
      allocationMode: 'auto'
    });

    return {
      assistantMessage: `Prévisualisation prête pour la réception de ${quantity} unité${quantity > 1 ? 's' : ''}.`,
      confirmationLabel: 'Confirmer la réception',
      requiresStrongConfirmation: false,
      preview: {
        title: 'Réceptionner',
        summary: [
          `Action : Réceptionner`,
          `Ligne : ${buildTargetLine(candidate)}`,
          `Quantité reçue : +${preview.quantity}`
        ],
        impacts: buildReceptionImpactLines(preview),
        notice: 'Aucune écriture en base n’est faite avant confirmation.'
      },
      action: {
        type: 'receptionner',
        materielChantierId: candidate.id,
        payload: {
          quantiteReceptionnee: preview.quantity
        }
      }
    };
  }

  if (interpretation.intent === 'modifier') {
    const field = interpretation.fields.field;
    const value = getModifyFieldValue(interpretation.fields, field);
    if (!field) {
      throw createHttpError('Précisez le champ à modifier : quantité actuelle, quantité reçue, remarque ou commentaire.', 400);
    }
    if (value === null || value === undefined || value === '') {
      throw createHttpError('Précisez la nouvelle valeur à appliquer.', 400);
    }

    const preview = buildQuickEditPreview(candidate.raw, field, value);

    return {
      assistantMessage: 'Prévisualisation prête pour la modification demandée.',
      confirmationLabel: 'Confirmer la modification',
      requiresStrongConfirmation: false,
      preview: {
        title: 'Modifier',
        summary: [
          'Action : Modifier',
          `Ligne : ${buildTargetLine(candidate)}`,
          `Champ : ${preview.fieldConfig.label}`,
          `Nouvelle valeur : ${preview.newValue == null ? '-' : preview.newValue}`
        ],
        impacts: preview.changes,
        notice: 'Aucune écriture en base n’est faite avant confirmation.'
      },
      action: {
        type: 'modifier',
        materielChantierId: candidate.id,
        payload: {
          field,
          value
        }
      }
    };
  }

  if (interpretation.intent === 'dupliquer') {
    return {
      assistantMessage: 'Prévisualisation prête pour la duplication.',
      confirmationLabel: 'Confirmer la duplication',
      requiresStrongConfirmation: false,
      preview: {
        title: 'Dupliquer',
        summary: [
          'Action : Dupliquer la ligne',
          `Ligne source : ${buildTargetLine(candidate)}`
        ],
        impacts: [
          'Une nouvelle ligne chantier sera créée avec les mêmes quantités, prévisions et remarques.',
          'La duplication crée un nouveau matériel lié au même chantier.'
        ],
        notice: 'Aucune écriture en base n’est faite avant confirmation.'
      },
      action: {
        type: 'dupliquer',
        materielChantierId: candidate.id,
        payload: {}
      }
    };
  }

  if (interpretation.intent === 'supprimer') {
    return {
      assistantMessage: 'Prévisualisation prête. Vérifiez bien avant de supprimer.',
      confirmationLabel: 'Confirmer la suppression',
      requiresStrongConfirmation: true,
      preview: {
        title: 'Supprimer',
        summary: [
          'Action : Supprimer la ligne',
          `Ligne : ${buildTargetLine(candidate)}`
        ],
        impacts: [
          'La ligne chantier sera supprimée définitivement.',
          'Un historique de suppression sera conservé.'
        ],
        notice: 'Aucune écriture en base n’est faite avant confirmation.'
      },
      action: {
        type: 'supprimer',
        materielChantierId: candidate.id,
        payload: {}
      }
    };
  }

  if (interpretation.intent === 'ouvrir' || interpretation.intent === 'info') {
    return {
      assistantMessage: 'La fiche est prête à être ouverte.',
      confirmationLabel: interpretation.intent === 'ouvrir' ? 'Ouvrir la fiche' : 'Voir les infos',
      requiresStrongConfirmation: false,
      preview: {
        title: interpretation.intent === 'ouvrir' ? 'Ouvrir la fiche' : 'Voir les informations',
        summary: [
          `Action : ${interpretation.intent === 'ouvrir' ? 'Ouvrir' : 'Consulter les infos'}`,
          `Ligne : ${buildTargetLine(candidate)}`,
          `Quantité actuelle : ${candidate.quantiteActuelle}`
        ],
        impacts: [
          candidate.categorie ? `Catégorie : ${candidate.categorie}` : 'Catégorie non renseignée',
          candidate.fournisseur ? `Fournisseur : ${candidate.fournisseur}` : 'Fournisseur non renseigné'
        ],
        notice: 'Cette action n’écrit rien en base.'
      },
      action: {
        type: interpretation.intent,
        materielChantierId: candidate.id,
        payload: {
          redirectUrl: `/chantier/materielChantier/info/${candidate.id}`
        }
      }
    };
  }

  throw createHttpError('Intention vocale non supportée.', 400);
}

function buildAssistantStepFromMatch({ interpretation, candidate }) {
  const questionStep = buildQuestionStepFromInterpretation(interpretation);
  if (questionStep) {
    return {
      stage: 'question',
      ...questionStep
    };
  }

  return {
    stage: 'preview',
    ...buildPreviewFromMatch({ interpretation, candidate })
  };
}

module.exports = {
  buildAssistantStepFromMatch,
  buildPreviewFromMatch
};
