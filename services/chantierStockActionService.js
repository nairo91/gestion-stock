const { sequelize } = require('../config/database');
const Materiel = require('../models/Materiel');
const MaterielChantier = require('../models/MaterielChantier');
const Historique = require('../models/Historique');
const Chantier = require('../models/Chantier');
const Categorie = require('../models/Categorie');
const { sendLowStockNotification, sendReceptionGapNotification } = require('../utils/mailer');

const SOURCE_SUFFIX = {
  manual: '',
  voice: ' (assistant vocal)'
};

const QUICK_EDIT_FIELDS = {
  quantiteActuelle: {
    key: 'quantiteActuelle',
    label: 'Quantité actuelle',
    type: 'number'
  },
  quantiteRecue: {
    key: 'quantite',
    label: 'Quantité reçue',
    type: 'number'
  },
  remarque: {
    key: 'remarque',
    label: 'Remarque',
    type: 'text'
  },
  commentaire: {
    key: 'commentaire',
    label: 'Commentaire',
    type: 'text',
    materielField: true
  }
};

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function resolveReceivedQuantityUpdate(mc, value) {
  const oldQuantiteRecue = Number(mc.quantite || 0);
  let newQuantiteRecue = oldQuantiteRecue;

  if (value !== undefined && value !== null && String(value).trim() !== '') {
    const parsed = toInt(value);
    if (parsed === null || parsed < 0) {
      throw createHttpError('Quantite recue invalide.', 400);
    }
    newQuantiteRecue = parsed;
  }

  return {
    oldQuantiteRecue,
    newQuantiteRecue,
    deltaQuantiteRecue: newQuantiteRecue - oldQuantiteRecue
  };
}

function getCurrentQuantity(mc) {
  const rawValue = mc.quantiteActuelle != null ? mc.quantiteActuelle : mc.quantite;
  const parsed = Number(rawValue || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeTotalPrevu(mc) {
  return [mc.quantitePrevue, mc.quantitePrevue1, mc.quantitePrevue2, mc.quantitePrevue3, mc.quantitePrevue4]
    .reduce((sum, value) => sum + (value ? Number(value) : 0), 0);
}

function buildHistoriqueLabel(mc) {
  const materielNom = mc.materiel && mc.materiel.nom ? mc.materiel.nom : 'Matériel chantier';
  const chantierNom = mc.chantier && mc.chantier.nom ? mc.chantier.nom : 'N/A';
  return `${materielNom} (Chantier : ${chantierNom})`;
}

function buildPlannedAllocation(mc, receptionQty, livraisonIndex, allocationMode = 'selectedOnly') {
  const quantity = toInt(receptionQty);
  if (!quantity || quantity <= 0) {
    throw createHttpError('Quantité de réception invalide.', 400);
  }

  const slots = [1, 2, 3, 4].map(index => ({
    index,
    key: `quantitePrevue${index}`,
    before: Number(mc[`quantitePrevue${index}`] || 0),
    after: Number(mc[`quantitePrevue${index}`] || 0),
    deducted: 0
  }));

  const legacyBefore = Number(mc.quantitePrevue || 0);
  let legacyAfter = legacyBefore;
  let remaining = quantity;

  if (allocationMode === 'selectedOnly') {
    const selectedIndex = toInt(livraisonIndex);
    if (selectedIndex && selectedIndex >= 1 && selectedIndex <= 4) {
      const slot = slots.find(item => item.index === selectedIndex);
      if (slot) {
        slot.deducted = Math.min(slot.before, quantity);
        slot.after = Math.max(slot.before - quantity, 0);
        remaining = quantity - slot.deducted;
      }
    } else {
      const deducted = Math.min(legacyBefore, quantity);
      legacyAfter = Math.max(legacyBefore - quantity, 0);
      remaining = quantity - deducted;
    }
  } else {
    slots.forEach(slot => {
      if (remaining <= 0 || slot.before <= 0) {
        return;
      }
      const deducted = Math.min(slot.before, remaining);
      slot.deducted = deducted;
      slot.after = slot.before - deducted;
      remaining -= deducted;
    });

    if (remaining > 0 && legacyAfter > 0) {
      const deducted = Math.min(legacyAfter, remaining);
      legacyAfter -= deducted;
      remaining -= deducted;
    }
  }

  return {
    quantity,
    remaining,
    slotChanges: slots.filter(slot => slot.deducted > 0 || slot.before !== slot.after),
    legacy: {
      before: legacyBefore,
      after: legacyAfter,
      deducted: legacyBefore - legacyAfter
    },
    totalPrevuBefore: computeTotalPrevu(mc),
    totalPrevuAfter: legacyAfter + slots.reduce((sum, slot) => sum + slot.after, 0)
  };
}

function buildReceptionPreview(mc, { receptionQty, livraisonIndex = null, allocationMode = 'selectedOnly' }) {
  const quantity = toInt(receptionQty);
  if (!quantity || quantity <= 0) {
    throw createHttpError('Quantité de réception invalide.', 400);
  }

  const oldQuantiteRecue = Number(mc.quantite || 0);
  const oldQuantiteActuelle = getCurrentQuantity(mc);
  const allocation = buildPlannedAllocation(mc, quantity, livraisonIndex, allocationMode);

  return {
    type: 'receptionner',
    quantity,
    oldQuantiteRecue,
    newQuantiteRecue: oldQuantiteRecue + quantity,
    oldQuantiteActuelle,
    newQuantiteActuelle: oldQuantiteActuelle + quantity,
    allocation
  };
}

async function loadMaterielChantier(mcId, { transaction = null } = {}) {
  const mc = await MaterielChantier.findByPk(mcId, {
    transaction,
    include: [
      { model: Materiel, as: 'materiel' },
      { model: Chantier, as: 'chantier' }
    ]
  });

  if (!mc) {
    throw createHttpError('Matériel de chantier introuvable.', 404);
  }

  return mc;
}

async function executeReception({
  mcId,
  receptionQty,
  livraisonIndex = null,
  userId = null,
  source = 'manual',
  allocationMode = 'selectedOnly'
}) {
  const result = await sequelize.transaction(async transaction => {
    const mc = await loadMaterielChantier(mcId, { transaction });
    const preview = buildReceptionPreview(mc, { receptionQty, livraisonIndex, allocationMode });

    preview.allocation.slotChanges.forEach(slot => {
      mc[slot.key] = slot.after;
    });

    if (preview.allocation.legacy.before !== preview.allocation.legacy.after) {
      mc.quantitePrevue = preview.allocation.legacy.after;
    }

    mc.quantite = preview.newQuantiteRecue;
    mc.quantiteActuelle = preview.newQuantiteActuelle;
    mc.lastReceptionAt = new Date();
    await mc.save({ transaction });

    await Historique.create({
      materielId: mc.materiel ? mc.materiel.id : null,
      oldQuantite: preview.oldQuantiteActuelle,
      newQuantite: preview.newQuantiteActuelle,
      userId,
      action: `Réception chantier de ${preview.quantity}${SOURCE_SUFFIX[source] || ''}`,
      materielNom: buildHistoriqueLabel(mc),
      stockType: 'chantier'
    }, { transaction });

    return {
      mc,
      preview
    };
  });

  try {
    const threshold = result.preview.allocation.totalPrevuBefore * 0.30;
    if (
      result.preview.oldQuantiteActuelle > threshold &&
      result.preview.newQuantiteActuelle <= threshold &&
      result.mc.materiel
    ) {
      await sendLowStockNotification({
        nom: result.mc.materiel.nom,
        quantite: result.preview.newQuantiteActuelle
      });
    }

    const difference = result.preview.newQuantiteActuelle - (result.preview.oldQuantiteRecue + result.preview.allocation.totalPrevuBefore);
    if (difference !== 0 && result.mc.materiel && result.mc.chantier) {
      await sendReceptionGapNotification({
        difference,
        materielNom: result.mc.materiel.nom,
        chantierNom: result.mc.chantier.nom,
        quantitePrevue: result.preview.oldQuantiteRecue + result.preview.allocation.totalPrevuBefore,
        quantiteReelle: result.preview.newQuantiteActuelle
      });
    }
  } catch (notificationError) {
    console.error('Erreur notification réception chantier :', notificationError);
  }

  return result;
}

function normalizeQuickEditValue(fieldConfig, value) {
  if (fieldConfig.type === 'number') {
    const parsed = toInt(value);
    if (parsed === null || parsed < 0) {
      throw createHttpError(`${fieldConfig.label} invalide.`, 400);
    }
    return parsed;
  }

  return normalizeNullableText(value);
}

function buildQuickEditPreview(mc, fieldName, rawValue) {
  const fieldConfig = QUICK_EDIT_FIELDS[fieldName];
  if (!fieldConfig) {
    throw createHttpError('Champ de modification vocal non supporté.', 400);
  }

  const normalizedValue = normalizeQuickEditValue(fieldConfig, rawValue);
  const changes = [];
  let oldValue;
  let newValue = normalizedValue;
  let oldQuantite = getCurrentQuantity(mc);
  let newQuantite = oldQuantite;

  if (fieldName === 'quantiteActuelle') {
    oldValue = oldQuantite;
    newValue = normalizedValue;
    newQuantite = normalizedValue;
    changes.push(`Quantité actuelle: ${oldValue} ➜ ${newValue}`);
  } else if (fieldName === 'quantiteRecue') {
    const quantityUpdate = resolveReceivedQuantityUpdate(mc, rawValue);
    oldValue = quantityUpdate.oldQuantiteRecue;
    newValue = quantityUpdate.newQuantiteRecue;
    newQuantite = Math.max(0, oldQuantite + quantityUpdate.deltaQuantiteRecue);
    changes.push(`Quantité reçue: ${oldValue} ➜ ${newValue}`);
    if (oldQuantite !== newQuantite) {
      changes.push(`Quantité actuelle: ${getCurrentQuantity(mc)} ➜ ${newQuantite}`);
    }
  } else if (fieldName === 'remarque') {
    oldValue = mc.remarque || null;
    newValue = normalizedValue;
    changes.push(`Remarque: ${oldValue || '-'} ➜ ${newValue || '-'}`);
  } else if (fieldName === 'commentaire') {
    oldValue = mc.materiel ? (mc.materiel.commentaire || null) : null;
    newValue = normalizedValue;
    changes.push(`Commentaire: ${oldValue || '-'} ➜ ${newValue || '-'}`);
  }

  return {
    fieldConfig,
    fieldName,
    normalizedValue: newValue,
    oldValue,
    newValue,
    oldQuantite,
    newQuantite,
    changes
  };
}

// L'assistant vocal ne pilote qu'un sous-ensemble volontairement restreint
// des champs modifies par le formulaire manuel. Le handler manuel conserve
// les cas plus larges (planning, photo, references, categorie, etc.).
async function executeQuickEdit({
  mcId,
  fieldName,
  value,
  userId = null,
  source = 'voice'
}) {
  return sequelize.transaction(async transaction => {
    const mc = await loadMaterielChantier(mcId, { transaction });
    const preview = buildQuickEditPreview(mc, fieldName, value);

    if (fieldName === 'quantiteActuelle') {
      mc.quantiteActuelle = preview.newValue;
    } else if (fieldName === 'quantiteRecue') {
      mc.quantite = preview.newValue;
      mc.quantiteActuelle = preview.newQuantite;
      if (preview.newValue !== preview.oldValue) {
        mc.lastReceptionAt = new Date();
      }
    } else if (fieldName === 'remarque') {
      mc.remarque = preview.newValue;
    } else if (fieldName === 'commentaire' && mc.materiel) {
      mc.materiel.commentaire = preview.newValue;
      await mc.materiel.save({ transaction });
    }

    await mc.save({ transaction });

    await Historique.create({
      materielId: mc.materiel ? mc.materiel.id : null,
      oldQuantite: preview.oldQuantite,
      newQuantite: preview.newQuantite,
      userId,
      action: `${preview.changes.join(' | ')}${SOURCE_SUFFIX[source] || ''}`,
      materielNom: buildHistoriqueLabel(mc),
      stockType: 'chantier'
    }, { transaction });

    return { mc, preview };
  });
}

async function executeDelete({
  mcId,
  userId = null,
  source = 'manual'
}) {
  return sequelize.transaction(async transaction => {
    const mc = await loadMaterielChantier(mcId, { transaction });

    await Historique.create({
      materielId: mc.materiel ? mc.materiel.id : null,
      oldQuantite: mc.quantite,
      newQuantite: null,
      userId,
      action: `Supprimé${SOURCE_SUFFIX[source] || ''}`,
      materielNom: buildHistoriqueLabel(mc),
      stockType: 'chantier'
    }, { transaction });

    const deletedSnapshot = {
      id: mc.id,
      nom: mc.materiel ? mc.materiel.nom : 'Matériel',
      chantierNom: mc.chantier ? mc.chantier.nom : 'N/A'
    };

    await mc.destroy({ transaction });
    return deletedSnapshot;
  });
}

async function executeDuplicateClone({
  mcId,
  userId = null,
  source = 'voice'
}) {
  return sequelize.transaction(async transaction => {
    const mc = await loadMaterielChantier(mcId, { transaction });

    if (!mc.materiel) {
      throw createHttpError('Matériel introuvable pour duplication.', 404);
    }

    if (mc.materiel.categorie) {
      await Categorie.findOrCreate({
        where: { nom: mc.materiel.categorie },
        transaction
      });
    }

    const duplicateMateriel = await Materiel.create({
      nom: mc.materiel.nom,
      reference: mc.materiel.reference || null,
      refFabricant: mc.materiel.refFabricant || null,
      commentaire: mc.materiel.commentaire || null,
      prix: mc.materiel.prix || null,
      categorie: mc.materiel.categorie,
      fournisseur: mc.materiel.fournisseur,
      marque: mc.materiel.marque || null,
      quantite: 0,
      emplacementId: mc.materiel.emplacementId || null,
      rack: mc.materiel.rack || null,
      compartiment: mc.materiel.compartiment || null,
      niveau: mc.materiel.niveau || null
    }, { transaction });

    const duplicateMc = await MaterielChantier.create({
      chantierId: mc.chantierId,
      materielId: duplicateMateriel.id,
      quantite: Number(mc.quantite || 0),
      quantiteActuelle: getCurrentQuantity(mc),
      quantitePrevue: mc.quantitePrevue,
      quantitePrevue1: mc.quantitePrevue1,
      quantitePrevue2: mc.quantitePrevue2,
      quantitePrevue3: mc.quantitePrevue3,
      quantitePrevue4: mc.quantitePrevue4,
      quantitePrevueInitiale: mc.quantitePrevueInitiale,
      quantitePrevueInitiale1: mc.quantitePrevueInitiale1,
      quantitePrevueInitiale2: mc.quantitePrevueInitiale2,
      quantitePrevueInitiale3: mc.quantitePrevueInitiale3,
      quantitePrevueInitiale4: mc.quantitePrevueInitiale4,
      dateLivraisonPrevue: mc.dateLivraisonPrevue,
      dateLivraisonPrevue1: mc.dateLivraisonPrevue1,
      dateLivraisonPrevue2: mc.dateLivraisonPrevue2,
      dateLivraisonPrevue3: mc.dateLivraisonPrevue3,
      dateLivraisonPrevue4: mc.dateLivraisonPrevue4,
      remarque: mc.remarque || null,
      alertStatus: mc.alertStatus || 'critique'
    }, { transaction });

    await Historique.create({
      materielId: duplicateMateriel.id,
      oldQuantite: 0,
      newQuantite: getCurrentQuantity(duplicateMc),
      userId,
      action: `Dupliqué${SOURCE_SUFFIX[source] || ''}`,
      materielNom: `${duplicateMateriel.nom} (Chantier : ${mc.chantier ? mc.chantier.nom : 'N/A'})`,
      stockType: 'chantier'
    }, { transaction });

    return {
      duplicateMc,
      duplicateMateriel,
      sourceMc: mc
    };
  });
}

module.exports = {
  QUICK_EDIT_FIELDS,
  computeTotalPrevu,
  getCurrentQuantity,
  resolveReceivedQuantityUpdate,
  buildReceptionPreview,
  buildQuickEditPreview,
  executeReception,
  executeQuickEdit,
  executeDelete,
  executeDuplicateClone,
  createHttpError
};
