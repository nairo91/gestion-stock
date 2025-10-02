const { sequelize, Materiel, MaterielChantier } = require('../models');

// utils sûrs
const getByPkLocked = (id, t, lock) =>
  Materiel.findByPk(id, { transaction: t, lock });

// pivot chantier <-> materiel
const getPivotLocked = (chantierId, materielId, t, lock) =>
  MaterielChantier.findOne({ where: { chantierId, materielId }, transaction: t, lock });

// parsing & arrondis robustes
const parseQty = (val) => {
  if (val == null) return NaN;
  if (typeof val === 'string') val = val.replace(',', '.');
  const n = Number(val);
  return Number.isFinite(n) ? n : NaN;
};
const add = (a,b) => Number((a + b).toFixed(2));
const sub = (a,b) => Number((a - b).toFixed(2));

/**
 * Motivation :
 * Au dépôt, il existe des doublons de nom ("chantierId" = NULL).
 * ➜ On prélève toujours la ligne cliquée (par id) côté dépôt.
 *
 * Les stocks chantier sont gérés via le pivot MaterielChantier.
 *
 * Parsing et arrondis protègent contre 2,5 et les flottants.
 */

/**
 * @param {'ENTREE'|'SORTIE'} action
 * @param {{ type:'DEPOT'|'CHANTIER', chantierId?:number|null }} context
 * @param {{ materielId:number, materielName:string }} current
 * @param {number} targetChantierId
 * @param {number|string} qty
 * @param {number=} userId
 */
async function transferParNom({ action, context, current, targetChantierId, qty, userId }) {
  const isEntree = action === 'ENTREE';
  const currIsDepot = context.type === 'DEPOT';
  const currChantierId = context.chantierId ?? null;

  if (!current?.materielId || !current?.materielName) throw new Error('Ligne matériau invalide');
  if (!targetChantierId) throw new Error('Chantier cible invalide');

  // garde-fou chantier -> même chantier
  if (!currIsDepot && Number(currChantierId) === Number(targetChantierId)) {
    throw new Error('Le chantier source et destination sont identiques.');
  }

  const Q = parseQty(qty);
  if (!Q || Q <= 0) throw new Error('Quantité invalide');

  return sequelize.transaction(async (t) => {
    const lock = t.LOCK.UPDATE;
    let src, dst;

    if (currIsDepot) {
      // === CONTEXTE DEPOT ===
      // Lignes côté dépôt sont dans Materiel (chantierId = null)
      if (isEntree) {
        // Source = chantier sélectionné (pivot), Destination = dépôt (Materiel by PK cliquée)
        const srcPivot = await getPivotLocked(Number(targetChantierId), Number(current.materielId), t, lock);
        if (!srcPivot) throw new Error('Aucun stock sur le chantier source.');
        src = srcPivot; // champ: quantite

        dst = await getByPkLocked(current.materielId, t, lock);
        if (!dst || dst.chantierId !== null) throw new Error('Ligne dépôt cible invalide.');
      } else {
        // SORTIE : Source = dépôt (Materiel PK), Destination = chantier (pivot)
        const srcDepot = await getByPkLocked(current.materielId, t, lock);
        if (!srcDepot || srcDepot.chantierId !== null) throw new Error('Ligne dépôt source invalide.');
        src = srcDepot;

        let dstPivot = await getPivotLocked(Number(targetChantierId), Number(current.materielId), t, lock);
        if (!dstPivot) {
          dstPivot = await MaterielChantier.create({
            chantierId: Number(targetChantierId),
            materielId: Number(current.materielId),
            quantite: 0
          }, { transaction: t });
        }
        dst = dstPivot;
      }
    } else {
      // === CONTEXTE CHANTIER ===
      // Lignes côté chantier sont dans le pivot MaterielChantier
      if (isEntree) {
        // Source = chantier sélectionné (pivot), Destination = chantier courant (pivot)
        const srcPivot = await getPivotLocked(Number(targetChantierId), Number(current.materielId), t, lock);
        if (!srcPivot) throw new Error('Aucun stock dans le chantier source.');
        src = srcPivot;

        let dstPivot = await getPivotLocked(Number(currChantierId), Number(current.materielId), t, lock);
        if (!dstPivot) {
          dstPivot = await MaterielChantier.create({
            chantierId: Number(currChantierId),
            materielId: Number(current.materielId),
            quantite: 0
          }, { transaction: t });
        }
        dst = dstPivot;
      } else {
        // SORTIE : Source = chantier courant (pivot), Destination = chantier choisi (pivot)
        const srcPivot = await getPivotLocked(Number(currChantierId), Number(current.materielId), t, lock);
        if (!srcPivot) throw new Error('Aucun stock dans le chantier courant.');
        src = srcPivot;

        let dstPivot = await getPivotLocked(Number(targetChantierId), Number(current.materielId), t, lock);
        if (!dstPivot) {
          dstPivot = await MaterielChantier.create({
            chantierId: Number(targetChantierId),
            materielId: Number(current.materielId),
            quantite: 0
          }, { transaction: t });
        }
        dst = dstPivot;
      }
    }

    // Contrôle & mouvements
    const srcQty = parseQty(src.quantite || 0);
    if (Q > srcQty) throw new Error(`Quantité demandée (${Q}) > stock source (${srcQty}).`);

    src.quantite = sub(srcQty, Q);
    await src.save({ transaction: t });

    const dstQty = parseQty(dst.quantite || 0);
    dst.quantite = add(dstQty, Q);
    await dst.save({ transaction: t });

    return {
      from: { id: src.id, after: Number(src.quantite) },
      to:   { id: dst.id, after: Number(dst.quantite) }
    };
  });
}

module.exports = { transferParNom };
