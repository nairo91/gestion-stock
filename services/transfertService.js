const { sequelize, Materiel } = require('../models');

// utils sûrs
const getByPkLocked = (id, t, lock) =>
  Materiel.findByPk(id, { transaction: t, lock });

const getMatByNameInChantier = (chantierId, nom, t, lock) =>
  Materiel.findOne({ where: { chantierId, nom }, transaction: t, lock });

const cloneForContext = async ({ prototype, nom, chantierId, t }) => {
  return Materiel.create({
    nom,
    reference: prototype?.reference || null,
    categorie: prototype?.categorie || null,
    description: prototype?.description || null,
    rack: null, compartiment: null, niveau: null, position: null,
    vehiculeId: null,
    chantierId: chantierId ?? null,
    quantite: 0
  }, { transaction: t });
};

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
 * ➜ En SORTIE, on doit toujours prélever la ligne cliquée (par id) et non « une ligne par nom ».
 *
 * En ENTRÉE vers le contexte courant, on incrémente la ligne cliquée du contexte courant (si elle existe),
 * sinon fallback par nom / création.
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

    if (isEntree) {
      // Source = chantier sélectionné (résolution par NOM)
      src = await getMatByNameInChantier(Number(targetChantierId), current.materielName, t, lock);
      if (!src) throw new Error(`Aucun matériel nommé "${current.materielName}" dans le chantier sélectionné.`);

      // Destination = contexte courant
      if (currIsDepot) {
        // on incrémente **la ligne cliquée** du dépôt
        dst = await getByPkLocked(current.materielId, t, lock);
        if (!dst || dst.chantierId !== null) throw new Error('Ligne dépôt cible invalide.');
      } else {
        // chantier courant : on privilégie **la ligne cliquée**
        dst = await getByPkLocked(current.materielId, t, lock);
        if (!dst || Number(dst.chantierId) !== Number(currChantierId)) {
          // fallback: résolution par nom dans le chantier courant
          dst = await getMatByNameInChantier(Number(currChantierId), current.materielName, t, lock);
          if (!dst) dst = await cloneForContext({ prototype: src, nom: current.materielName, chantierId: currChantierId, t });
        }
      }
    } else {
      // SORTIE : Source = contexte courant **par PK**
      src = await getByPkLocked(current.materielId, t, lock);
      if (!src) throw new Error('Ligne source introuvable.');
      if (currIsDepot && src.chantierId !== null) throw new Error('La source attendue (dépôt) ne correspond pas.');
      if (!currIsDepot && Number(src.chantierId) !== Number(currChantierId)) {
        throw new Error('La source attendue (chantier courant) ne correspond pas.');
      }

      // Destination = chantier choisi (par NOM, création si absent)
      dst = await getMatByNameInChantier(Number(targetChantierId), current.materielName, t, lock);
      if (!dst) dst = await cloneForContext({ prototype: src, nom: current.materielName, chantierId: targetChantierId, t });
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
