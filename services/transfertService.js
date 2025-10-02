const { sequelize, Materiel, Chantier } = require('../models');

const VALID_ACTIONS = new Set(['ENTREE', 'SORTIE']);

const METADATA_FIELDS = [
  'reference',
  'description',
  'prix',
  'categorie',
  'fournisseur',
  'rack',
  'compartiment',
  'niveau',
  'position',
  'vehiculeId',
  'emplacementId'
];

const parseQuantity = value => {
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '.').trim();
    if (normalized === '') return NaN;
    return Number.parseFloat(normalized);
  }
  return Number.parseFloat(value);
};

const normalizeId = value => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

function copyMetadata(from) {
  return METADATA_FIELDS.reduce((acc, field) => {
    acc[field] = from[field];
    return acc;
  }, {});
}

async function ensureChantierExists(chantierId, transaction) {
  if (chantierId === null) {
    return null;
  }
  const chantier = await Chantier.findByPk(chantierId, { transaction });
  if (!chantier) {
    throw new Error('Chantier sélectionné introuvable.');
  }
  return chantier;
}

async function transferParNom({ action, context, current, targetChantierId, qty, userId }) {
  const normalizedAction = typeof action === 'string' ? action.toUpperCase() : action;
  if (!VALID_ACTIONS.has(normalizedAction)) {
    throw new Error('Action de transfert invalide.');
  }

  if (!current || !current.materielId || !current.materielName) {
    throw new Error('Matériel courant invalide.');
  }

  const quantity = parseQuantity(qty);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantité invalide.');
  }

  const contextType = context && context.type === 'CHANTIER' ? 'CHANTIER' : 'DEPOT';
  const contextChantierId = contextType === 'CHANTIER' ? normalizeId(context.chantierId) : null;

  if (contextType === 'CHANTIER' && contextChantierId === null) {
    throw new Error('Chantier courant invalide.');
  }

  const targetId = normalizeId(targetChantierId);

  const transaction = await sequelize.transaction();

  try {
    const currentMaterial = await Materiel.findByPk(current.materielId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!currentMaterial && normalizedAction === 'SORTIE') {
      throw new Error('Matériel source introuvable.');
    }

    let destinationMaterial = null;
    let sourceMaterial = null;

    if (normalizedAction === 'ENTREE') {
      if (targetId === null) {
        throw new Error('Chantier source requis pour une entrée.');
      }

      if (contextType === 'CHANTIER' && targetId === contextChantierId) {
        throw new Error('Impossible de transférer vers le même chantier.');
      }

      await ensureChantierExists(targetId, transaction);

      sourceMaterial = await Materiel.findOne({
        where: { nom: current.materielName, chantierId: targetId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!sourceMaterial) {
        throw new Error('Matériel introuvable dans le chantier source.');
      }

      const available = Number.parseFloat(sourceMaterial.quantite);
      if (!Number.isFinite(available) || available < quantity) {
        throw new Error('Quantité insuffisante dans le chantier source.');
      }

      if (currentMaterial && currentMaterial.nom === current.materielName && currentMaterial.chantierId === contextChantierId) {
        destinationMaterial = currentMaterial;
      } else {
        destinationMaterial = await Materiel.findOne({
          where: { nom: current.materielName, chantierId: contextChantierId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
      }

      if (!destinationMaterial) {
        const template = currentMaterial || sourceMaterial;
        const newMaterialPayload = {
          nom: current.materielName,
          chantierId: contextChantierId,
          quantite: 0,
          ...copyMetadata(template)
        };
        destinationMaterial = await Materiel.create(newMaterialPayload, { transaction });
      }

      sourceMaterial.quantite = available - quantity;
      const destQty = Number.parseFloat(destinationMaterial.quantite) || 0;
      destinationMaterial.quantite = destQty + quantity;

      await sourceMaterial.save({ transaction });
      await destinationMaterial.save({ transaction });
    } else {
      // SORTIE
      if (contextType === 'CHANTIER' && contextChantierId === null) {
        throw new Error('Chantier source invalide.');
      }

      sourceMaterial = currentMaterial;
      if (!sourceMaterial || sourceMaterial.nom !== current.materielName) {
        throw new Error('Matériel source invalide.');
      }

      const sourceQty = Number.parseFloat(sourceMaterial.quantite);
      if (!Number.isFinite(sourceQty) || sourceQty < quantity) {
        throw new Error('Quantité insuffisante dans la source.');
      }

      if (targetId === null) {
        throw new Error('Chantier destination requis.');
      }

      if (contextType === 'CHANTIER' && targetId === contextChantierId) {
        throw new Error('Impossible de transférer vers le même chantier.');
      }

      await ensureChantierExists(targetId, transaction);

      destinationMaterial = await Materiel.findOne({
        where: { nom: current.materielName, chantierId: targetId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!destinationMaterial) {
        const template = sourceMaterial;
        const newMaterialPayload = {
          nom: current.materielName,
          chantierId: targetId,
          quantite: 0,
          ...copyMetadata(template)
        };
        destinationMaterial = await Materiel.create(newMaterialPayload, { transaction });
      }

      sourceMaterial.quantite = sourceQty - quantity;
      const destQty = Number.parseFloat(destinationMaterial.quantite) || 0;
      destinationMaterial.quantite = destQty + quantity;

      await sourceMaterial.save({ transaction });
      await destinationMaterial.save({ transaction });
    }

    const summary = {
      from: {
        id: sourceMaterial ? sourceMaterial.id : null,
        after: sourceMaterial ? Number.parseFloat(sourceMaterial.quantite) : null
      },
      to: {
        id: destinationMaterial ? destinationMaterial.id : null,
        after: destinationMaterial ? Number.parseFloat(destinationMaterial.quantite) : null
      }
    };

    // Point d'insertion pour historiser si besoin
    // await Historique.create({...}, { transaction });

    await transaction.commit();

    return summary;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  transferParNom
};
