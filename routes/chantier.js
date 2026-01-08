// routes/chantier.js
const Emplacement = require('../models/Emplacement');
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const dayjs = require('dayjs');
const { storage, cloudinary, uploadBDL } = require('../config/cloudinary.config');

const Materiel = require('../models/Materiel');
const Photo = require('../models/Photo');
const Historique = require('../models/Historique');
const User = require('../models/User');
const Chantier = require('../models/Chantier');
const MaterielChantier = require('../models/MaterielChantier');
const { ensureAuthenticated, checkAdmin } = require('./materiel');
const Categorie = require('../models/Categorie');
const Designation = require('../models/Designation');
const { sequelize } = require('../config/database');
const { sendLowStockNotification, sendReceptionGapNotification } = require('../utils/mailer');

const CHANTIER_FILTER_KEYS = [
  'chantierId',
  'categorie',
  'emplacement',
  'fournisseur',
  'marque',
  'triNom',
  'triAjout',
  'triModification',
  'recherche',
  'limit'
];

// Expose un flag admin aux vues (pour afficher/masquer des actions sensibles)
router.use((req, res, next) => {
  try {
    res.locals.isAdmin = !!(req.user && (req.user.isAdmin || req.user.role === 'admin'));
  } catch (e) {
    res.locals.isAdmin = false;
  }
  next();
});

// Utilitaire: lecture robuste des cellules ExcelJS (évite "[object Object]")
function getCellString(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (typeof v === 'object') {
    if (cell.text) return cell.text;
    if (v && v.richText) {
      return v.richText.map(rt => rt.text).join('');
    }
    return '';
  }
  return v != null ? String(v) : '';
}

function normalizeHeaderLabel(label) {
  return (label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parsePlannedQuantity(cell) {
  const raw = getCellString(cell).trim();
  if (!raw) {
    return { value: null, invalid: false };
  }
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) {
    return { value: null, invalid: true };
  }
  const parsed = Math.round(parseFloat(cleaned.replace(',', '.')));
  return Number.isNaN(parsed) ? { value: null, invalid: true } : { value: parsed, invalid: false };
}

function parsePlannedDate(cell) {
  if (!cell) {
    return { value: null, invalid: false };
  }
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') {
    return { value: null, invalid: false };
  }
  if (raw instanceof Date) {
    return { value: raw, invalid: false };
  }
  const text = getCellString(cell).trim();
  if (!text) {
    return { value: null, invalid: false };
  }
  const parsed = toDateOrNull(text);
  return { value: parsed, invalid: parsed === null };
}

async function fetchMaterielChantiersWithFilters(query, { includePhotos = true } = {}) {
  const {
    chantierId,
    categorie,
    emplacement,
    fournisseur,
    marque,
    triNom,
    triAjout,
    triModification,
    recherche,
    limit
  } = query;

  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

  let chantierIdInt = null;
  if (chantierId !== undefined && chantierId !== null && chantierId !== '') {
    const parsed = parseInt(String(chantierId), 10);
    chantierIdInt = !Number.isNaN(parsed) ? parsed : null;
  }
  const whereChantier = chantierIdInt ? { chantierId: chantierIdInt } : {};
  const whereMateriel = {};

  if (categorie) {
    whereMateriel.categorie = { [Op.iLike]: `%${categorie}%` };
  }
  if (fournisseur) {
    whereMateriel.fournisseur = { [Op.iLike]: `%${fournisseur}%` };
  }
  if (marque) {
    whereMateriel.marque = { [Op.iLike]: `%${marque}%` };
  }

  const order = [];
  if (triNom === 'asc' || triNom === 'desc') {
    order.push([{ model: Materiel, as: 'materiel' }, 'nom', triNom.toUpperCase()]);
  }
  if (triAjout === 'asc' || triAjout === 'desc') {
    order.push(['createdAt', triAjout.toUpperCase()]);
  }
  if (triModification === 'asc' || triModification === 'desc') {
    order.push([{ model: Materiel, as: 'materiel' }, 'updatedAt', triModification.toUpperCase()]);
  }

  const emplacementInclude = {
    model: Emplacement,
    as: 'emplacement',
    where: emplacement ? { nom: { [Op.iLike]: `%${emplacement}%` } } : undefined,
    include: [
      {
        model: Emplacement,
        as: 'parent',
        include: [{ model: Emplacement, as: 'parent' }]
      }
    ]
  };

  const materielInclude = {
    model: Materiel,
    as: 'materiel',
    where: whereMateriel,
    include: [
      ...(includePhotos ? [{ model: Photo, as: 'photos' }] : []),
      emplacementInclude
    ]
  };

  let materielChantiers = await MaterielChantier.findAll({
    where: whereChantier,
    // IMPORTANT : on s'assure que bonLivraisonUrls est bien renvoyé
    attributes: {
      include: [
        'bonLivraisonUrls',
        'quantite',
        'quantiteActuelle',
        'quantitePrevue',
        'quantitePrevue1',
        'quantitePrevue2',
        'quantitePrevue3',
        'quantitePrevue4',
        'quantitePrevueInitiale'
      ]
    },
    include: [
      { model: Chantier, as: 'chantier' },
      materielInclude
    ],
    order: order.length > 0 ? order : undefined
  });

  if (recherche) {
    const terme = recherche.toLowerCase();
    materielChantiers = materielChantiers.filter(mc => {
      const contenu = JSON.stringify(mc.get({ plain: true })).toLowerCase();
      return contenu.includes(terme);
    });
  }

  if (safeLimit) {
    materielChantiers = materielChantiers.slice(0, safeLimit);
  }

  return materielChantiers;
}

async function loadCategories() {
  const cats = await Categorie.findAll({ order: [['nom', 'ASC']] });
  return cats.map(c => c.nom);
}

// Configuration Multer pour les uploads de photos sur Cloudinary
const upload = multer({ storage });

// Pour l'importation Excel, nous utilisons un stockage en mémoire afin de ne
// pas envoyer les fichiers sur Cloudinary. L'option memoryStorage permet
// d'accéder au fichier via req.file.buffer.
const excelUpload = multer({ storage: multer.memoryStorage() });

const toIntOrNull = value => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const toDateOrNull = value => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const computeTotalPrevu = mc => {
  const plannedBySlot = [1, 2, 3, 4].reduce((sum, idx) => {
    const key = `quantitePrevue${idx}`;
    const val = mc[key];
    return sum + (val ? Number(val) : 0);
  }, 0);
  const legacy = mc.quantitePrevue ? Number(mc.quantitePrevue) : 0;
  return plannedBySlot + legacy;
};

const computeTotalPrevuFromValues = ({
  quantitePrevue,
  quantitePrevue1,
  quantitePrevue2,
  quantitePrevue3,
  quantitePrevue4
}) => computeTotalPrevu({
  quantitePrevue,
  quantitePrevue1,
  quantitePrevue2,
  quantitePrevue3,
  quantitePrevue4
});

const computeInitialSlots = ({
  mc,
  newQuantitePrevue,
  newQuantitesPrevues
}) => {
  const displayedSlot1 = newQuantitesPrevues[0] != null ? newQuantitesPrevues[0] : newQuantitePrevue;
  return {
    quantitePrevueInitiale1:
      mc.quantitePrevueInitiale1 ??
      (displayedSlot1 != null
        ? displayedSlot1
        : (mc.quantitePrevue1 != null ? mc.quantitePrevue1 : mc.quantitePrevue)),
    quantitePrevueInitiale2:
      mc.quantitePrevueInitiale2 ??
      (newQuantitesPrevues[1] != null ? newQuantitesPrevues[1] : mc.quantitePrevue2),
    quantitePrevueInitiale3:
      mc.quantitePrevueInitiale3 ??
      (newQuantitesPrevues[2] != null ? newQuantitesPrevues[2] : mc.quantitePrevue3),
    quantitePrevueInitiale4:
      mc.quantitePrevueInitiale4 ??
      (newQuantitesPrevues[3] != null ? newQuantitesPrevues[3] : mc.quantitePrevue4)
  };
};

/* ===== INVENTAIRE CUMULÉ CHANTIER ===== */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.query.reset === '1') {
      delete req.session.chantierFilters;
      return res.redirect('/chantier');
    }

    const hasQueryFilterKeys = CHANTIER_FILTER_KEYS.some(key => key in req.query);
    const sanitizeValue = value => (typeof value === 'string' ? value.trim() : value);

    let activeFilters;

    if (hasQueryFilterKeys) {
      activeFilters = CHANTIER_FILTER_KEYS.reduce((acc, key) => {
        const value = req.query[key];
        acc[key] = value !== undefined && value !== null ? sanitizeValue(value) : '';
        return acc;
      }, {});

      const hasMeaningfulValue = CHANTIER_FILTER_KEYS.some(key => {
        const value = activeFilters[key];
        return value !== undefined && value !== null && value !== '';
      });

      if (hasMeaningfulValue) {
        req.session.chantierFilters = activeFilters;
      } else {
        delete req.session.chantierFilters;
      }
    } else if (req.session.chantierFilters) {
      activeFilters = { ...req.session.chantierFilters };
    } else {
      activeFilters = CHANTIER_FILTER_KEYS.reduce((acc, key) => {
        acc[key] = '';
        return acc;
      }, {});
    }

    let materielChantiers = await fetchMaterielChantiersWithFilters(activeFilters, { includePhotos: true });

    materielChantiers = materielChantiers.map(mc => {
      const totalPrevu = computeTotalPrevu(mc);
      const seuil = totalPrevu * 0.30;
      const qteActuelle = mc.quantiteActuelle != null ? mc.quantiteActuelle : (mc.quantite || 0);
      const isLowStock = qteActuelle <= seuil;
      mc.setDataValue('totalPrevu', totalPrevu);
      mc.setDataValue('isLowStock', isLowStock);
      mc.setDataValue('quantiteActuelle', qteActuelle);
      return mc;
    });

    const today = dayjs().startOf('day');
    const now = dayjs();
    const upcomingDeliveries = [];
    const slots = [
      {
        index: 0,
        dateField: 'dateLivraisonPrevue',
        quantityField: 'quantitePrevue',
        dismissedField: 'deliveryPopupDismissed',
        snoozeField: 'deliveryPopupSnoozeUntil'
      },
      {
        index: 1,
        dateField: 'dateLivraisonPrevue1',
        quantityField: 'quantitePrevue1',
        dismissedField: 'deliveryPopupDismissed1',
        snoozeField: 'deliveryPopupSnoozeUntil1'
      },
      {
        index: 2,
        dateField: 'dateLivraisonPrevue2',
        quantityField: 'quantitePrevue2',
        dismissedField: 'deliveryPopupDismissed2',
        snoozeField: 'deliveryPopupSnoozeUntil2'
      },
      {
        index: 3,
        dateField: 'dateLivraisonPrevue3',
        quantityField: 'quantitePrevue3',
        dismissedField: 'deliveryPopupDismissed3',
        snoozeField: 'deliveryPopupSnoozeUntil3'
      },
      {
        index: 4,
        dateField: 'dateLivraisonPrevue4',
        quantityField: 'quantitePrevue4',
        dismissedField: 'deliveryPopupDismissed4',
        snoozeField: 'deliveryPopupSnoozeUntil4'
      }
    ];

    const addDeliveryReminder = (mc, slot) => {
      const dateValue = mc[slot.dateField];
      const quantityValue = mc[slot.quantityField];
      const dismissedFlag = mc[slot.dismissedField];
      const snoozeUntilValue = mc[slot.snoozeField];

      if (!dateValue || !quantityValue || Number(quantityValue) <= 0) {
        return;
      }
      if (dismissedFlag) {
        return;
      }

      const deliveryDate = dayjs(dateValue).startOf('day');
      if (!deliveryDate.isValid()) {
        return;
      }

      const diffDays = deliveryDate.diff(today, 'day');
      if (diffDays > 1) {
        return;
      }

      if (snoozeUntilValue) {
        const snoozeUntil = dayjs(snoozeUntilValue);
        if (snoozeUntil.isValid() && (now.isBefore(snoozeUntil) || now.isSame(snoozeUntil))) {
          return;
        }
      }

      let message = 'Livraison prévue';
      if (diffDays === 1) {
        message = 'Livraison prévue demain';
      } else if (diffDays === 0) {
        message = "Livraison prévue aujourd'hui";
      } else if (diffDays === -1) {
        message = 'Livraison prévue hier';
      } else {
        message = `Livraison prévue il y a ${Math.abs(diffDays)} jours`;
      }

      const status = diffDays === 1 ? 'tomorrow' : diffDays === 0 ? 'today' : 'late';
      const priority = status === 'late' ? 1 : status === 'today' ? 2 : 3;

      upcomingDeliveries.push({
        id: mc.id,
        slotIndex: slot.index,
        materielName: mc.materiel ? mc.materiel.nom : 'Matériel',
        chantierName: mc.chantier ? mc.chantier.nom : 'Chantier',
        date: deliveryDate.toDate(),
        message,
        status,
        priority,
        diffDays
      });
    };

    materielChantiers.forEach(mc => {
      slots.forEach(slot => addDeliveryReminder(mc, slot));
    });

    upcomingDeliveries.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return a.materielName.localeCompare(b.materielName, 'fr', { sensitivity: 'base' });
    });

    const chantiers = await Chantier.findAll(); // Pour la liste déroulante
    const emplacements = await Emplacement.findAll(); // AJOUTÉ
    const fournisseursRaw = await Materiel.findAll({
      attributes: ['fournisseur'],
      where: {
        fournisseur: {
          [Op.and]: [
            { [Op.not]: null },
            { [Op.ne]: '' }
          ]
        }
      }
    });
    const marquesRaw = await Materiel.findAll({
      attributes: ['marque'],
      where: {
        marque: {
          [Op.and]: [
            { [Op.not]: null },
            { [Op.ne]: '' }
          ]
        }
      }
    });
    const fournisseurs = Array.from(
      new Set(fournisseursRaw.map(item => item.fournisseur).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const marques = Array.from(
      new Set(marquesRaw.map(item => item.marque).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const categories = await loadCategories();
    res.render('chantier/index', {
      materielChantiers,
      chantiers,
      emplacements,
      fournisseurs,
      marques,
      categories,
      upcomingDeliveries,
      // pour l'upload BDL direct depuis le navigateur vers Cloudinary
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      cloudinaryUploadPresetBdl: process.env.CLOUDINARY_UPLOAD_PRESET_BDL || '',
      ...activeFilters
    });

  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la récupération du stock chantier.");
  }
});

router.post('/materielChantier/dismiss-delivery-popup', ensureAuthenticated, async (req, res) => {
  try {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    const allowedSlots = new Set([0, 1, 2, 3, 4]);
    const slotDateFields = {
      0: 'dateLivraisonPrevue',
      1: 'dateLivraisonPrevue1',
      2: 'dateLivraisonPrevue2',
      3: 'dateLivraisonPrevue3',
      4: 'dateLivraisonPrevue4'
    };

    for (const item of items) {
      const id = parseInt(item && item.id, 10);
      const slotIndex = parseInt(item && item.slotIndex, 10);
      if (!Number.isInteger(id) || !allowedSlots.has(slotIndex)) {
        continue;
      }

      const fieldName = slotIndex === 0 ? 'deliveryPopupSnoozeUntil' : `deliveryPopupSnoozeUntil${slotIndex}`;
      const mc = await MaterielChantier.findByPk(id);
      if (!mc) {
        continue;
      }

      const slotDateValue = mc[slotDateFields[slotIndex]];
      const deliveryDate = slotDateValue ? dayjs(slotDateValue) : null;
      if (!deliveryDate || !deliveryDate.isValid()) {
        continue;
      }

      mc.setDataValue(fieldName, deliveryDate.endOf('day').toDate());
      await mc.save();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Erreur dismissal popup livraison :', err);
    return res.status(500).json({ success: false });
  }
});

// Nouvelle route BDL : on reçoit UNIQUEMENT l'URL déjà envoyée sur Cloudinary
router.post('/materielChantier/:id/ajouterBDL', ensureAuthenticated, async (req, res) => {
  try {
    const mc = await MaterielChantier.findByPk(req.params.id);
    if (!mc) {
      return res.status(404).send('Matériel de chantier introuvable.');
    }

    const uploadedUrl = (req.body && req.body.url) ? String(req.body.url).trim() : '';
    if (!uploadedUrl) {
      return res.status(400).send("URL de bon de livraison manquante.");
    }

    // Normaliser bonLivraisonUrls (array / string JSON / objet)
    let existing = [];
    if (Array.isArray(mc.bonLivraisonUrls)) {
      existing = mc.bonLivraisonUrls;
    } else if (typeof mc.bonLivraisonUrls === 'string') {
      try { existing = JSON.parse(mc.bonLivraisonUrls); } catch (_) { existing = []; }
    } else if (mc.bonLivraisonUrls && typeof mc.bonLivraisonUrls === 'object') {
      existing = mc.bonLivraisonUrls;
    }

    const newUrls = [...existing, uploadedUrl];
    mc.bonLivraisonUrls = newUrls;
    await mc.save();

    console.log('💾 BDL - URL ajoutée :', uploadedUrl);
    return res.redirect('/chantier');
  } catch (err) {
    console.error("❌ Erreur lors de l'ajout du bon de livraison :", err);
    return res.status(500).send("Erreur lors de l'ajout du bon de livraison.");
  }
});


router.post('/materielChantier/:id/supprimerBDL', ensureAuthenticated, async (req, res) => {
  try {
    const mc = await MaterielChantier.findByPk(req.params.id);
    if (!mc) {
      return res.status(404).send('Matériel de chantier introuvable.');
    }

    const urlToDelete = (req.body && req.body.url) ? String(req.body.url).trim() : '';
    if (!urlToDelete) {
      return res.status(400).send('URL de bon de livraison manquante.');
    }

    let existing = [];
    if (Array.isArray(mc.bonLivraisonUrls)) {
      existing = mc.bonLivraisonUrls;
    } else if (typeof mc.bonLivraisonUrls === 'string') {
      try { existing = JSON.parse(mc.bonLivraisonUrls); } catch (_) { existing = []; }
    } else if (mc.bonLivraisonUrls && typeof mc.bonLivraisonUrls === 'object') {
      existing = mc.bonLivraisonUrls;
    }

    const indexToRemove = existing.findIndex(u => u === urlToDelete);
    if (indexToRemove === -1) {
      return res.status(404).send('Bon de livraison introuvable.');
    }

    existing.splice(indexToRemove, 1);
    mc.bonLivraisonUrls = existing;
    await mc.save();

    console.log('🗑️  BDL - URL supprimée :', urlToDelete);
    return res.json({ success: true, remaining: existing.length });
  } catch (err) {
    console.error('❌ Erreur lors de la suppression du bon de livraison :', err);
    return res.status(500).send("Erreur lors de la suppression du bon de livraison.");
  }
});


router.post('/materielChantier/miseAJourMasse', ensureAuthenticated, checkAdmin, async (req, res) => {
  const { ids, quantiteRecue, bdlUrl } = req.body || {};

  let idList = Array.isArray(ids)
    ? ids
    : (typeof ids === 'string' ? ids.split(',') : []);

  idList = idList
    .map(v => parseInt(String(v), 10))
    .filter(v => Number.isInteger(v));

  const hasQuantite = quantiteRecue !== undefined && quantiteRecue !== null && String(quantiteRecue).trim() !== '';
  const hasBdl = typeof bdlUrl === 'string' && bdlUrl.trim() !== '';

  if (!idList.length) {
    return res.status(400).send('Aucune ligne sélectionnée.');
  }

  if (!hasQuantite && !hasBdl) {
    return res.status(400).send('Aucune mise à jour demandée.');
  }

  let quantiteNumber = null;
  if (hasQuantite) {
    const normalized = String(quantiteRecue).replace(/,/g, '.');
    quantiteNumber = Number(normalized);
    if (!Number.isFinite(quantiteNumber) || quantiteNumber < 0) {
      return res.status(400).send('Quantité reçue invalide.');
    }
  }

  try {
    const materiels = await MaterielChantier.findAll({
      where: {
        id: {
          [Op.in]: idList
        }
      }
    });

    await sequelize.transaction(async transaction => {
      for (const mc of materiels) {
        if (hasQuantite) {
          mc.quantite = quantiteNumber;
          mc.quantiteActuelle = quantiteNumber;
        }

        if (hasBdl) {
          let existing = [];
          if (Array.isArray(mc.bonLivraisonUrls)) {
            existing = mc.bonLivraisonUrls;
          } else if (typeof mc.bonLivraisonUrls === 'string') {
            try { existing = JSON.parse(mc.bonLivraisonUrls); } catch (_) { existing = []; }
          } else if (mc.bonLivraisonUrls && typeof mc.bonLivraisonUrls === 'object') {
            existing = mc.bonLivraisonUrls;
          }

          mc.bonLivraisonUrls = [...existing, bdlUrl.trim()];
        }

        await mc.save({ transaction });
      }
    });

    return res.json({
      success: true,
      updated: idList.length
    });
  } catch (err) {
    console.error('Erreur lors de la mise à jour en masse :', err);
    return res.status(500).send('Erreur lors de la mise à jour en masse.');
  }
});


router.post('/materielChantier/alerteStatut', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const statut = (req.body.statut || '').trim();
    const allowedStatus = ['critique', 'surveillance', 'regle'];

    if (!ids.length) {
      return res.status(400).send('Aucune ligne sélectionnée.');
    }

    if (!allowedStatus.includes(statut)) {
      return res.status(400).send('Statut non reconnu.');
    }

    const numericIds = ids
      .map(value => {
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
      })
      .filter(id => id !== null);

    if (!numericIds.length) {
      return res.status(400).send('Sélection invalide.');
    }

    const materiels = await MaterielChantier.findAll({ where: { id: numericIds } });
    const alertIds = materiels
      .filter(mc => {
        const totalPrevu = computeTotalPrevu(mc);
        const quantiteActuelle = mc.quantiteActuelle != null ? mc.quantiteActuelle : mc.quantite || 0;
        if (!totalPrevu || totalPrevu <= 0) return false;
        return Number(quantiteActuelle) <= Number(totalPrevu * 0.30);
      })
      .map(mc => mc.id);

    if (!alertIds.length) {
      return res.status(400).send('Sélectionnez des lignes actuellement en alerte (≤ 30%).');
    }

    await MaterielChantier.update({ alertStatus: statut }, { where: { id: alertIds } });

    res.json({ updated: alertIds.length, statut });
  } catch (err) {
    console.error('Erreur mise à jour statut alerte chantier :', err);
    res.status(500).send('Impossible de mettre à jour le statut des alertes.');
  }
});


router.post('/materielChantier/receptionner/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const { quantiteReceptionnee, livraisonIndex } = req.body;
    const receptionQty = parseInt(quantiteReceptionnee, 10);
    const livraisonIdx = livraisonIndex ? parseInt(livraisonIndex, 10) : null;

    if (Number.isNaN(receptionQty) || receptionQty <= 0) {
      return res.status(400).send('Quantité de réception invalide.');
    }

    const mc = await MaterielChantier.findByPk(req.params.id, {
      include: [
        { model: Materiel, as: 'materiel' },
        { model: Chantier, as: 'chantier' }
      ]
    });

    if (!mc) {
      return res.status(404).send('Matériel de chantier introuvable.');
    }

    const oldQuantiteRecue = mc.quantite || 0;
    const newQuantiteRecue = oldQuantiteRecue + receptionQty;
    const oldQuantiteActuelle = mc.quantiteActuelle != null ? mc.quantiteActuelle : oldQuantiteRecue;
    const newQuantiteActuelle = oldQuantiteActuelle + receptionQty;
    const totalPrevuAvantReception = computeTotalPrevu(mc);
    const seuil = totalPrevuAvantReception * 0.30;

    if (livraisonIdx && livraisonIdx >= 1 && livraisonIdx <= 4) {
      const prop = `quantitePrevue${livraisonIdx}`;
      const prevueActuelle = mc[prop] || 0;
      mc[prop] = Math.max(prevueActuelle - receptionQty, 0);
    } else if (mc.quantitePrevue !== null && mc.quantitePrevue !== undefined) {
      const prevueActuelle = mc.quantitePrevue || 0;
      mc.quantitePrevue = Math.max(prevueActuelle - receptionQty, 0);
    }

    mc.quantite = newQuantiteRecue;
    mc.quantiteActuelle = newQuantiteActuelle;
    await mc.save();

    await Historique.create({
      materielId: mc.materiel ? mc.materiel.id : null,
      oldQuantite: oldQuantiteActuelle,
      newQuantite: newQuantiteActuelle,
      userId: req.user ? req.user.id : null,
      action: `Réception chantier de ${receptionQty}`,
      materielNom: mc.materiel
        ? `${mc.materiel.nom} (Chantier : ${mc.chantier ? mc.chantier.nom : 'N/A'})`
        : 'Matériel chantier',
      stockType: 'chantier'
    });

    if (oldQuantiteActuelle > seuil && newQuantiteActuelle <= seuil && mc.materiel) {
      await sendLowStockNotification({
        nom: mc.materiel.nom,
        quantite: newQuantiteActuelle
      });
    }

    const difference = newQuantiteActuelle - (oldQuantiteRecue + totalPrevuAvantReception);

    if (difference !== 0 && mc.materiel && mc.chantier) {
      await sendReceptionGapNotification({
        difference,
        materielNom: mc.materiel.nom,
        chantierNom: mc.chantier.nom,
        quantitePrevue: oldQuantiteRecue + totalPrevuAvantReception,
        quantiteReelle: newQuantiteActuelle
      });
    }

    res.redirect('/chantier');
  } catch (error) {
    console.error('Erreur lors de la réception du matériel chantier :', error);
    res.status(500).send('Erreur lors de la réception du matériel.');
  }
});


/* ===== AJOUT DIRECT DE MATÉRIEL DANS UN CHANTIER ===== */
router.get('/ajouterMateriel', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const chantiers = await Chantier.findAll();
    const emplacementsBruts = await Emplacement.findAll({ include: [{ model: Emplacement, as: 'parent' }] });
    const categories = await loadCategories();
    const { chantierId: selectedChantierId } = req.query;

    function construireCheminComplet(emplacement) {
      let chemin = emplacement.nom;
      let courant = emplacement.parent;
      while (courant) {
        chemin = `${courant.nom} > ${chemin}`;
        courant = courant.parent;
      }
      return chemin;
    }

    const emplacements = emplacementsBruts.map(e => ({
      id: e.id,
      cheminComplet: construireCheminComplet(e),
      chantierId: e.chantierId
    }));

    // On passe chantiers et emplacements en une seule réponse
    res.render('chantier/ajouterMateriel', {
      chantiers,
      emplacements,
      categories,
      selectedChantierId: selectedChantierId || ''
    });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors du chargement du formulaire d'ajout de matériel dans un chantier.");
  }
});

router.post('/ajouter-categorie', ensureAuthenticated, checkAdmin, async (req, res) => {
  const { nom } = req.body;
  if (!nom || !nom.trim()) {
    return res.status(400).json({ success: false });
  }
  await Categorie.findOrCreate({ where: { nom } });
  res.json({ success: true, nom });
});

router.post('/supprimer-categorie', ensureAuthenticated, checkAdmin, async (req, res) => {
  const rawNom = req.body.nom || '';
  const nom = rawNom.trim();
  if (!nom) {
    return res.status(400).json({ success: false, message: 'Nom de catégorie invalide.' });
  }

  const transaction = await sequelize.transaction();

  try {
    let categorie = await Categorie.findOne({ where: { nom: rawNom }, transaction });
    if (!categorie && nom !== rawNom) {
      categorie = await Categorie.findOne({ where: { nom }, transaction });
    }
    if (!categorie) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Catégorie introuvable." });
    }

    await Materiel.update({ categorie: null }, { where: { categorie: categorie.nom }, transaction });
    await categorie.destroy({ transaction });

    await transaction.commit();
    res.json({ success: true, nom: categorie.nom });
  } catch (error) {
    await transaction.rollback();
    console.error('Erreur lors de la suppression de la catégorie', error);
    res.status(500).json({ success: false, message: "Erreur lors de la suppression de la catégorie." });
  }
});

router.get('/designations', ensureAuthenticated, async (req, res) => {
  try {
    const designations = await Designation.findAll({
      include: [{ model: Categorie, as: 'categorie' }],
      order: [
        [{ model: Categorie, as: 'categorie' }, 'nom', 'ASC'],
        ['nom', 'ASC'],
      ],
    });

    const map = {};
    designations.forEach(item => {
      if (!item || !item.categorie) return;
      const catName = item.categorie.nom;
      if (!map[catName]) {
        map[catName] = [];
      }
      if (!map[catName].some(existing => existing.toLowerCase() === item.nom.toLowerCase())) {
        map[catName].push(item.nom);
      }
    });

    res.json({ success: true, designations: map });
  } catch (error) {
    console.error('Erreur lors de la récupération des désignations', error);
    res.status(500).json({ success: false, message: "Erreur lors de la récupération des désignations." });
  }
});

router.post('/ajouter-designation', ensureAuthenticated, checkAdmin, async (req, res) => {
  const rawCategorie = req.body.categorie || '';
  const rawDesignation = req.body.designation || '';
  const categorieNom = rawCategorie.trim();
  const designationNom = rawDesignation.trim();

  if (!categorieNom || !designationNom) {
    return res.status(400).json({ success: false, message: 'Catégorie ou désignation invalide.' });
  }

  try {
    const [categorie] = await Categorie.findOrCreate({ where: { nom: categorieNom } });
    const [designation, created] = await Designation.findOrCreate({
      where: { nom: designationNom, categorieId: categorie.id },
      defaults: { nom: designationNom, categorieId: categorie.id },
    });

    res.json({
      success: true,
      designation: {
        nom: designation.nom,
        categorie: categorie.nom,
        created,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout de la désignation", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'ajout de la désignation." });
  }
});

router.post('/supprimer-designation', ensureAuthenticated, checkAdmin, async (req, res) => {
  const rawCategorie = req.body.categorie || '';
  const rawDesignation = req.body.designation || '';
  const categorieNom = rawCategorie.trim();
  const designationNom = rawDesignation.trim();

  if (!categorieNom || !designationNom) {
    return res.status(400).json({ success: false, message: 'Catégorie ou désignation invalide.' });
  }

  const transaction = await sequelize.transaction();

  try {
    let categorie = await Categorie.findOne({ where: { nom: rawCategorie }, transaction });
    if (!categorie && categorieNom !== rawCategorie) {
      categorie = await Categorie.findOne({ where: { nom: categorieNom }, transaction });
    }
    if (!categorie) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Catégorie introuvable.' });
    }

    const designation = await Designation.findOne({
      where: { nom: designationNom, categorieId: categorie.id },
      transaction,
    });

    if (!designation) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Désignation introuvable.' });
    }

    await designation.destroy({ transaction });
    await transaction.commit();

    res.json({
      success: true,
      designation: designation.nom,
      categorie: categorie.nom,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Erreur lors de la suppression de la désignation', error);
    res.status(500).json({ success: false, message: "Erreur lors de la suppression de la désignation." });
  }
});

router.post('/ajouterMateriel', ensureAuthenticated, checkAdmin, upload.array('photos', 5), async (req, res) => {
  try {
    const { nom, reference, quantite, quantitePrevue, dateLivraisonPrevue, description, prix, categorie, fournisseur, marque, chantierId, emplacementId, rack, compartiment, niveau, remarque, quantitePrevue1, quantitePrevue2, quantitePrevue3, quantitePrevue4, dateLivraisonPrevue1, dateLivraisonPrevue2, dateLivraisonPrevue3, dateLivraisonPrevue4 } = req.body;
    const prixNumber = prix ? parseFloat(prix) : null;
    const qtePrevue = quantitePrevue ? parseInt(quantitePrevue, 10) : null;
    const datePrevue = dateLivraisonPrevue ? new Date(dateLivraisonPrevue) : null;
    const qtePrevueSlot1 = toIntOrNull(quantitePrevue1);
    const qtePrevueSlot2 = toIntOrNull(quantitePrevue2);
    const qtePrevueSlot3 = toIntOrNull(quantitePrevue3);
    const qtePrevueSlot4 = toIntOrNull(quantitePrevue4);
    const plannedInputs = [qtePrevue, qtePrevueSlot1, qtePrevueSlot2, qtePrevueSlot3, qtePrevueSlot4];
    const hasPlannedValue = plannedInputs.some(v => v != null);
    const qtePrevueInitiale = hasPlannedValue
      ? computeTotalPrevuFromValues({
          quantitePrevue: qtePrevue,
          quantitePrevue1: qtePrevueSlot1,
          quantitePrevue2: qtePrevueSlot2,
          quantitePrevue3: qtePrevueSlot3,
          quantitePrevue4: qtePrevueSlot4
        })
      : null;
    const qtePrevueInitiale1 = qtePrevueSlot1 != null ? qtePrevueSlot1 : qtePrevue;
    const qtePrevueInitiale2 = qtePrevueSlot2 != null ? qtePrevueSlot2 : null;
    const qtePrevueInitiale3 = qtePrevueSlot3 != null ? qtePrevueSlot3 : null;
    const qtePrevueInitiale4 = qtePrevueSlot4 != null ? qtePrevueSlot4 : null;
    const datePrevueSlot1 = toDateOrNull(dateLivraisonPrevue1);
    const datePrevueSlot2 = toDateOrNull(dateLivraisonPrevue2);
    const datePrevueSlot3 = toDateOrNull(dateLivraisonPrevue3);
    const datePrevueSlot4 = toDateOrNull(dateLivraisonPrevue4);

    await Categorie.findOrCreate({ where: { nom: categorie } });

    // 1) Créer le matériel avec quantite=0 dans la table Materiel
    const nouveauMateriel = await Materiel.create({
      nom,
      reference,
      quantite: 0,
      description,
      prix: prixNumber,
      categorie,
      fournisseur,
      marque: marque || null,
      vehiculeId: null,
      emplacementId: emplacementId ? parseInt(emplacementId) : null,
      rack,
      compartiment,
      niveau: niveau ? parseInt(niveau) : null
    });


    // 2) Gérer les photos, si fournies
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = file.path || file.secure_url;
        await Photo.create({
          chemin: url,
          materielId: nouveauMateriel.id
        });
      }
    }

    // 3) Créer l'entrée dans MaterielChantier
    const qte = parseInt(quantite, 10);
    await MaterielChantier.create({
      chantierId: parseInt(chantierId, 10),
      materielId: nouveauMateriel.id,
      quantite: qte,
      quantiteActuelle: qte,
      quantitePrevue: qtePrevue,
      quantitePrevueInitiale: qtePrevueInitiale,
      quantitePrevueInitiale1: qtePrevueInitiale1,
      quantitePrevueInitiale2: qtePrevueInitiale2,
      quantitePrevueInitiale3: qtePrevueInitiale3,
      quantitePrevueInitiale4: qtePrevueInitiale4,
      dateLivraisonPrevue: datePrevue,
      quantitePrevue1: qtePrevueSlot1,
      quantitePrevue2: qtePrevueSlot2,
      quantitePrevue3: qtePrevueSlot3,
      quantitePrevue4: qtePrevueSlot4,
      dateLivraisonPrevue1: datePrevueSlot1,
      dateLivraisonPrevue2: datePrevueSlot2,
      dateLivraisonPrevue3: datePrevueSlot3,
      dateLivraisonPrevue4: datePrevueSlot4,
      remarque: remarque || null
    });

    // 4) AJOUT : Récupérer le chantier pour inclure son nom
    const chantier = await Chantier.findByPk(chantierId);


// 5) Historique : création
await Historique.create({
  materielId: nouveauMateriel.id,
  oldQuantite: null,
  newQuantite: qte,
  userId: req.user ? req.user.id : null,
  action: 'CRÉÉ SUR CHANTIER',
  materielNom: `${nouveauMateriel.nom} (Chantier : ${chantier ? chantier.nom : 'N/A'})`,
  stockType: 'chantier'
});



    res.redirect('/chantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de l'ajout de matériel dans le chantier.");
  }
});

/* ===== LIVRAISON DU DÉPÔT VERS UN CHANTIER ===== */
router.get('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const chantiers = await Chantier.findAll();
    const materiels = await Materiel.findAll({
      where: {
        vehiculeId: null,
        chantierId: null,
        quantite: { [Op.gt]: 0 }
      }
    });

     // On charge tous les emplacements (on filtrera en EJS)
  const emplacementsBruts = await Emplacement.findAll({ include: [{ model: Emplacement, as: 'parent' }] });

function construireCheminComplet(emplacement) {
  let chemin = emplacement.nom;
  let courant = emplacement.parent;
  while (courant) {
    chemin = `${courant.nom} > ${chemin}`;
    courant = courant.parent;
  }
  return chemin;
}

const emplacements = emplacementsBruts.map(e => ({
  id: e.id,
  cheminComplet: construireCheminComplet(e),
  chantierId: e.chantierId
}));


    res.render('chantier/ajouterLivraison', { chantiers, materiels, emplacements, });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors du chargement du formulaire d'ajout de livraison vers chantier.");
  }
});

router.post('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const { chantierId, items } = req.body;

    // AJOUT : Récupérer le chantier pour inclure son nom dans l'historique
    const chantier = await Chantier.findByPk(chantierId);

    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.materielId && item.quantite) {
          const deliveredQuantity = parseInt(item.quantite, 10);

          // Vérifier si le couple chantier/materiel existe
          let mc = await MaterielChantier.findOne({
            where: {
              chantierId: parseInt(chantierId, 10),
              materielId: item.materielId
            }
          });
          if (mc) {
            mc.quantite += deliveredQuantity;
            const baseActuelle = mc.quantiteActuelle != null ? mc.quantiteActuelle : mc.quantite;
            mc.quantiteActuelle = baseActuelle + deliveredQuantity;
            await mc.save();
          } else {
              await MaterielChantier.create({
                chantierId: parseInt(chantierId, 10),
                materielId: item.materielId,
                quantite: deliveredQuantity,
                quantiteActuelle: deliveredQuantity,
                remarque: item.remarque || null
              });
          }

          // Décrémenter le stock du dépôt
          const materiel = await Materiel.findByPk(item.materielId);
          if (materiel) {
            const oldQte = materiel.quantite;
            const newQte = Math.max(0, oldQte - deliveredQuantity);
            materiel.quantite = newQte;
            await materiel.save();

            // Historique
            await Historique.create({
              materielId: materiel.id,
              oldQuantite: oldQte,
              newQuantite: newQte,
              userId: req.user ? req.user.id : null,
              action: 'DELIVERY_TO_CHANTIER',
              // AJOUT : Inclure le nom du chantier
              materielNom: `${materiel.nom} (Chantier : ${chantier ? chantier.nom : 'N/A'})`,
              stockType: 'chantier'
            });
          }
        }
      }
    }
    res.redirect('/chantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de l'ajout de la livraison vers chantier.");
  }
});

/* ===== SCAN CHANTIER ===== */
router.get('/scanner', ensureAuthenticated, (req, res) => res.redirect('/scan'));
router.post('/scanner', ensureAuthenticated, (req, res) => {
  const code = (req.body && (req.body.code || req.body.barcode)) || '';
  if (!code) return res.redirect('/scan');
  return res.redirect(`/scan/resolve?code=${encodeURIComponent(code)}`);
});

/* ===== HISTORIQUE CHANTIER ===== */
router.get('/historique', ensureAuthenticated, async (req, res) => {
  try {
    const { chantierId } = req.query;

    // 1) Charger tous les historiques de type "chantier" comme avant
    let historiques = await Historique.findAll({
      where: { stockType: 'chantier' },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC']]
    });

    let chantierNomFiltre = null;

    // 2) Si un chantierId est fourni, on filtre en mémoire
    if (chantierId && chantierId !== 'all') {
      const chantier = await Chantier.findByPk(chantierId);

      if (chantier) {
        chantierNomFiltre = chantier.nom;
        const nom = String(chantier.nom);

        // On garde uniquement les lignes dont materielNom contient le nom du chantier
        historiques = historiques.filter(h => {
          if (!h.materielNom) return false;
          return String(h.materielNom).includes(nom);
        });
      }
    }

    const chantiers = await Chantier.findAll({
      order: [['nom', 'ASC']]
    });

    res.render('chantier/historique', {
      historiques,
      chantiers,
      chantierId: chantierId || '',
      chantierNomFiltre,
      selectedChantierId: chantierId && chantierId !== 'all' ? chantierId : 'all'
    });
  } catch (error) {
    console.error('Erreur /chantier/historique :', error);
    res
      .status(500)
      .send("Erreur lors de la récupération de l'historique chantier.");
  }
});

/* ===== GESTION DES CHANTIERS ===== */
router.get('/ajouter-chantier', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    res.render('chantier/ajouterChantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors du chargement du formulaire d'ajout d'un chantier.");
  }
});

router.post('/ajouter-chantier', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const { nom, localisation } = req.body;
    if (!nom || !localisation) {
      return res.send("Le nom et la localisation du chantier sont requis.");
    }
    // 1) Création du chantier
    const nouveauChantier = await Chantier.create({
      nom: nom.trim(),
      localisation: localisation.trim()
    });

    // 2) AJOUT : Créer une entrée Historique pour signaler la création du chantier
    await Historique.create({
      materielId: null,   // pas de matériel lié
      oldQuantite: null,
      newQuantite: null,
      userId: req.user ? req.user.id : null,
      action: 'CREATION DE CHANTIER',
      // On stocke le nom du chantier dans materielNom
      materielNom: `Nouveau Chantier : ${nouveauChantier.nom}`,
      stockType: 'chantier'
    });

    res.redirect('/chantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de l'ajout du chantier.");
  }
});

/* ===== MODIFIER / SUPPRIMER LES ENREGISTREMENTS DU STOCK CHANTIER ===== */
// Remplacer la route POST /materielChantier/modifier/:id existante dans routes/chantier.js par ceci :
router.get('/materielChantier/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const mc = await MaterielChantier.findByPk(req.params.id, {
      include: [
        { model: Chantier, as: 'chantier' },
        {
          model: Materiel,
          as: 'materiel',
          include: [{ model: Photo, as: 'photos' }]
        }
      ]
    });

    const emplacements = await Emplacement.findAll();
    const categories = await loadCategories();

    if (!mc) return res.send("Enregistrement introuvable.");

    res.render('chantier/modifierMaterielChantier', { mc, emplacements, categories });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors du chargement de la page    de modification.");
  }
});


router.post('/materielChantier/modifier/:id', ensureAuthenticated, checkAdmin, upload.single('photo'), async (req, res) => {
  try {
      const {
        quantite, quantitePrevue, dateLivraisonPrevue, nomMateriel, categorie, fournisseur, emplacementId,
        rack, compartiment, niveau, reference, description, prix, remarque, marque, quantitePrevue1, quantitePrevue2,
        quantitePrevue3, quantitePrevue4, dateLivraisonPrevue1, dateLivraisonPrevue2, dateLivraisonPrevue3,
        dateLivraisonPrevue4
      } = req.body;

    const mc = await MaterielChantier.findByPk(req.params.id, {
      include: [
        { model: Materiel, as: 'materiel' },
        { model: Chantier, as: 'chantier' }
      ]
    });
    if (!mc) return res.send("Enregistrement non trouvé.");

    const deltaQuantite = (quantite === undefined || quantite === '')
      ? 0
      : parseInt(quantite, 10);
    const variationValide = Number.isNaN(deltaQuantite) ? 0 : deltaQuantite;
    const baseQuantiteActuelle = mc.quantiteActuelle != null ? mc.quantiteActuelle : (mc.quantite || 0);
    const newQteActuelle = Math.max(0, baseQuantiteActuelle + variationValide);
    const newQtePrevue = (quantitePrevue === undefined || quantitePrevue === '')
      ? mc.quantitePrevue
      : parseInt(quantitePrevue, 10);
    const newDatePrevue = (dateLivraisonPrevue === undefined || dateLivraisonPrevue === '')
      ? mc.dateLivraisonPrevue
      : new Date(dateLivraisonPrevue);
    const newQuantitesPrevues = [quantitePrevue1, quantitePrevue2, quantitePrevue3, quantitePrevue4].map((val, idx) => {
      if (val === undefined || val === '') {
        return mc[`quantitePrevue${idx + 1}`];
      }
      const parsed = parseInt(val, 10);
      return Number.isNaN(parsed) ? mc[`quantitePrevue${idx + 1}`] : parsed;
    });
    const newDatesPrevues = [dateLivraisonPrevue1, dateLivraisonPrevue2, dateLivraisonPrevue3, dateLivraisonPrevue4].map((val, idx) => {
      if (val === undefined || val === '') {
        return mc[`dateLivraisonPrevue${idx + 1}`];
      }
      const parsed = new Date(val);
      return Number.isNaN(parsed.getTime()) ? mc[`dateLivraisonPrevue${idx + 1}`] : parsed;
    });

    if (
      Number.isNaN(newQteActuelle) || newQteActuelle < 0 ||
      !nomMateriel || !nomMateriel.trim() || !categorie
    ) {
      return res.status(400).send("Les champs désignation et catégorie sont obligatoires.");
    }

    const changementsDetail = [];

    const oldQteActuelle = baseQuantiteActuelle;
    const oldNom = mc.materiel.nom;
    const oldCategorie = mc.materiel.categorie;
    const oldEmplacement = mc.materiel.emplacementId;
    const oldRack = mc.materiel.rack;
    const oldCompartiment = mc.materiel.compartiment;
    const oldFournisseur = mc.materiel.fournisseur;
    const oldMarque = mc.materiel.marque;
    const oldNiveau = mc.materiel.niveau;
    const oldReference = mc.materiel.reference;
    const oldDescription = mc.materiel.description;
      const oldPrix = mc.materiel.prix;
      const oldRemarque = mc.remarque;
    const oldQtePrevue = mc.quantitePrevue;
    const oldQtePrevueInitiale = mc.quantitePrevueInitiale;
    const oldDatePrevue = mc.dateLivraisonPrevue;
    const oldQuantitesPrevues = [mc.quantitePrevue1, mc.quantitePrevue2, mc.quantitePrevue3, mc.quantitePrevue4];
    const oldDatesPrevues = [mc.dateLivraisonPrevue1, mc.dateLivraisonPrevue2, mc.dateLivraisonPrevue3, mc.dateLivraisonPrevue4];
    const hasOldPlannedValues = [mc.quantitePrevue, ...oldQuantitesPrevues].some(v => v != null);
    const oldTotalPrevu = hasOldPlannedValues ? computeTotalPrevu(mc) : null;

    const newNom = nomMateriel.trim();
    const newCategorie = categorie;
    await Categorie.findOrCreate({ where: { nom: newCategorie } });
    const newEmplacement = emplacementId ? parseInt(emplacementId) : null;
    const newRack = rack;
    const newCompartiment = compartiment;
    const newFournisseur = fournisseur;
    const newMarque = marque;
    const newNiveau = niveau ? parseInt(niveau) : null;
    const newReference = reference;
    const newDescription = description;
      const newPrix = prix ? parseFloat(prix) : null;
    const newRemarque = remarque && remarque.trim() ? remarque.trim() : null;

    const hasNewPlannedValues = [newQtePrevue, ...newQuantitesPrevues].some(v => v != null);
    const newTotalPrevu = hasNewPlannedValues
      ? computeTotalPrevuFromValues({
          quantitePrevue: newQtePrevue,
          quantitePrevue1: newQuantitesPrevues[0],
          quantitePrevue2: newQuantitesPrevues[1],
          quantitePrevue3: newQuantitesPrevues[2],
          quantitePrevue4: newQuantitesPrevues[3]
        })
      : null;
    const initialSlots = computeInitialSlots({
      mc,
      newQuantitePrevue: newQtePrevue,
      newQuantitesPrevues
    });
    const newQtePrevueInitiale = oldQtePrevueInitiale ?? newTotalPrevu;

    if (oldQteActuelle !== newQteActuelle) {
      const variationTexte = variationValide ? ` (${variationValide > 0 ? '+' : ''}${variationValide})` : '';
      changementsDetail.push(`Quantité actuelle: ${oldQteActuelle} ➔ ${newQteActuelle}${variationTexte}`);
    }
    if (oldNom !== newNom) changementsDetail.push(`Nom: ${oldNom} ➔ ${newNom}`);
    if (oldCategorie !== newCategorie) changementsDetail.push(`Catégorie: ${oldCategorie || '-'} ➔ ${newCategorie}`);
    if (oldEmplacement !== newEmplacement) changementsDetail.push(`Emplacement: ${oldEmplacement || '-'} ➔ ${newEmplacement || '-'}`);
    if (oldRack !== newRack) changementsDetail.push(`Rack: ${oldRack || '-'} ➔ ${newRack || '-'}`);
    if (oldFournisseur !== newFournisseur) changementsDetail.push(`Fournisseur: ${oldFournisseur || '-'} ➔ ${newFournisseur || '-'}`);
    if (oldMarque !== newMarque) changementsDetail.push(`Marque: ${oldMarque || '-'} ➔ ${newMarque || '-'}`);
    if (oldCompartiment !== newCompartiment) changementsDetail.push(`Compartiment: ${oldCompartiment || '-'} ➔ ${newCompartiment || '-'}`);
    if (oldNiveau !== newNiveau) changementsDetail.push(`Niveau: ${oldNiveau || '-'} ➔ ${newNiveau || '-'}`);
    if (oldReference !== newReference) changementsDetail.push(`Référence: ${oldReference || '-'} ➔ ${newReference || '-'}`);
    if (oldDescription !== newDescription) changementsDetail.push(`Description: ${oldDescription || '-'} ➔ ${newDescription || '-'}`);
      if (oldPrix !== newPrix) changementsDetail.push(`Prix: ${oldPrix || '-'} ➔ ${newPrix || '-'}`);
      if (oldRemarque !== newRemarque) changementsDetail.push(`Remarque: ${oldRemarque || '-'} ➔ ${newRemarque || '-'}`);
    if (oldQtePrevue !== newQtePrevue) changementsDetail.push(`Quantité prévue: ${oldQtePrevue || '-'} ➔ ${newQtePrevue || '-'}`);
    if ( (oldDatePrevue ? oldDatePrevue.toISOString().split('T')[0] : '') !== (newDatePrevue ? newDatePrevue.toISOString().split('T')[0] : '') )
      changementsDetail.push(`Date prévue: ${oldDatePrevue ? oldDatePrevue.toISOString().split('T')[0] : '-'} ➔ ${newDatePrevue ? newDatePrevue.toISOString().split('T')[0] : '-'}`);
    newQuantitesPrevues.forEach((val, idx) => {
      if (oldQuantitesPrevues[idx] !== val) {
        changementsDetail.push(`Quantité prévue ${idx + 1}: ${oldQuantitesPrevues[idx] || '-'} ➔ ${val || '-'}`);
      }
    });
    newDatesPrevues.forEach((val, idx) => {
      const oldVal = oldDatesPrevues[idx];
      if ((oldVal ? oldVal.toISOString().split('T')[0] : '') !== (val ? val.toISOString().split('T')[0] : '')) {
        changementsDetail.push(`Date prévue ${idx + 1}: ${oldVal ? oldVal.toISOString().split('T')[0] : '-'} ➔ ${val ? val.toISOString().split('T')[0] : '-'}`);
      }
    });
    if (oldQtePrevueInitiale !== newQtePrevueInitiale) {
      changementsDetail.push(`Qté init prévue: ${oldQtePrevueInitiale || '-'} ➔ ${newQtePrevueInitiale || '-'}`);
    }

    // Mise à jour
    mc.quantiteActuelle = newQteActuelle;
    mc.quantitePrevue = newQtePrevue;
    mc.dateLivraisonPrevue = newDatePrevue;
    [1, 2, 3, 4].forEach((idx, i) => {
      mc[`quantitePrevue${idx}`] = newQuantitesPrevues[i];
      mc[`dateLivraisonPrevue${idx}`] = newDatesPrevues[i];
    });
    mc.quantitePrevueInitiale = newQtePrevueInitiale;
    mc.quantitePrevueInitiale1 = initialSlots.quantitePrevueInitiale1;
    mc.quantitePrevueInitiale2 = initialSlots.quantitePrevueInitiale2;
    mc.quantitePrevueInitiale3 = initialSlots.quantitePrevueInitiale3;
    mc.quantitePrevueInitiale4 = initialSlots.quantitePrevueInitiale4;
    mc.materiel.nom = newNom;
    mc.materiel.categorie = newCategorie;
    mc.materiel.emplacementId = newEmplacement;
    mc.materiel.fournisseur = newFournisseur;
    mc.materiel.marque = newMarque;
    mc.materiel.rack = newRack;
    mc.materiel.compartiment = newCompartiment;
    mc.materiel.niveau = newNiveau;
    mc.materiel.reference = newReference;
    mc.materiel.description = newDescription;
      mc.materiel.prix = newPrix;
      mc.remarque = newRemarque;

    await mc.materiel.save();
    await mc.save();

    await Historique.create({
      materielId: mc.materiel.id,
      oldQuantite: oldQteActuelle,
      newQuantite: newQteActuelle,
      userId: req.user ? req.user.id : null,
      action: changementsDetail.length > 0 ? changementsDetail.join(' | ') : 'Modifications sans changement',
      materielNom: `${mc.materiel.nom} (Chantier : ${mc.chantier ? mc.chantier.nom : 'N/A'})`,
      stockType: 'chantier'
    });

    // Photo
    if (req.file) {
      const existingPhoto = await Photo.findOne({ where: { materielId: mc.materiel.id } });
      if (existingPhoto) {
        const publicId = existingPhoto.chemin.split('/').pop().split('.')[0];
        try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.error(e); }
        await existingPhoto.destroy();
      }
      const url = req.file.secure_url || req.file.path;
      await Photo.create({
        chemin: url,
        materielId: mc.materiel.id
      });
    }

    res.redirect('/chantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la mise à jour de l'enregistrement.");
  }
});




// Supprimer un enregistrement de MaterielChantier
router.post('/materielChantier/supprimer/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const mc = await MaterielChantier.findByPk(req.params.id, {
      include: [{ model: Materiel, as: 'materiel' }, { model: Chantier, as: 'chantier' }]
    });
    if (!mc) return res.send("Enregistrement non trouvé.");

    // AJOUT : Historique pour la suppression
    await Historique.create({
      materielId: mc.materiel ? mc.materiel.id : null,
      oldQuantite: mc.quantite,
      newQuantite: null,
      userId: req.user ? req.user.id : null,
      action: 'Supprimé',
      materielNom: mc.materiel
        ? `${mc.materiel.nom} (Chantier : ${mc.chantier ? mc.chantier.nom : 'N/A'})`
        : 'Matériel inconnu',
      stockType: 'chantier'
    });

    await mc.destroy();
    res.redirect('/chantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la suppression de l'enregistrement.");
  }
});

router.get('/materielChantier/dupliquer/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  const mc = await MaterielChantier.findByPk(req.params.id, {
    include: [
      { model: Chantier, as: 'chantier' },
      { model: Materiel, as: 'materiel' }
    ]
  });
  const chantiers = await Chantier.findAll();
  const emplacements = await Emplacement.findAll();
  const categories = await loadCategories();
  res.render('chantier/dupliquerMaterielChantier', { mc, chantiers, emplacements, categories });
});


router.post('/materielChantier/dupliquer/:id', ensureAuthenticated, checkAdmin, upload.single('photo'), async (req, res) => {
  try {
      const { nom, reference, quantite, quantitePrevue, dateLivraisonPrevue, description, prix, categorie, fournisseur, marque, chantierId, emplacementId, remarque } = req.body;
    const prixNumber = prix ? parseFloat(prix) : null;
    const qtePrevue = quantitePrevue ? parseInt(quantitePrevue, 10) : null;
    const datePrevue = dateLivraisonPrevue ? new Date(dateLivraisonPrevue) : null;

    await Categorie.findOrCreate({ where: { nom: categorie } });

    // Créer le matériel
    const nouveauMateriel = await Materiel.create({
      nom,
      reference,
      description,
      prix: prixNumber,
      categorie,
      fournisseur,
      marque: marque || null,
      quantite: 0,
      emplacementId: emplacementId ? parseInt(emplacementId) : null
    });

    // Gérer la photo si fournie
    if (req.file) {
      const url = req.file.secure_url || req.file.path;
      await Photo.create({
        chemin: url,
        materielId: nouveauMateriel.id
      });
    }

    // Ajouter dans le chantier
      const initialDuplicationPlan = qtePrevue != null
        ? computeTotalPrevuFromValues({ quantitePrevue: qtePrevue })
        : null;
      const initialSlot1 = qtePrevue != null ? qtePrevue : null;

      await MaterielChantier.create({
        chantierId: parseInt(chantierId),
        materielId: nouveauMateriel.id,
        quantite: parseInt(quantite),
        quantiteActuelle: parseInt(quantite),
        quantitePrevue: qtePrevue,
        quantitePrevueInitiale: initialDuplicationPlan,
        quantitePrevueInitiale1: initialSlot1,
        dateLivraisonPrevue: datePrevue,
        remarque: remarque || null
      });

    res.redirect('/chantier');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la duplication avec photo.");
  }
});


router.get('/materielChantier/info/:id', ensureAuthenticated, async (req, res) => {
  const mc = await MaterielChantier.findByPk(req.params.id, {
    include: [
      { model: Chantier, as: 'chantier' },
      {
        model: Materiel,
        as: 'materiel',
        include: [{ model: Photo, as: 'photos' }, { model: Emplacement, as: 'emplacement' }]
      }
    ]
  });

  if (!mc) return res.send("Matériel non trouvé.");

  const historique = await Historique.findAll({
    where: { materielId: mc.materiel.id },
    include: [{ model: User, as: 'user' }],
    order: [['createdAt', 'DESC']]
  });

  res.render('chantier/infoMaterielChantier', { mc, historique });
});

/*
 * ===== DRY-RUN D'IMPORT EXCEL (APERÇU) =====
 * - Parse le fichier, mais n'écrit rien en base
 * - Classe les lignes en: ok / warn / error + détection create/update
 * - Stocke l'aperçu en session pour confirmation
 * - Rend une page EJS de prévisualisation
 */
router.post('/import-excel/dry-run', ensureAuthenticated, checkAdmin, excelUpload.single('excel'), async (req, res) => {
  try {
    const chantierIdRaw = req.body.chantierId;
    const chantierId = chantierIdRaw ? parseInt(chantierIdRaw, 10) : null;
    if (!chantierId || Number.isNaN(chantierId)) {
      return res.status(400).send('Chantier invalide.');
    }

    const chantier = await Chantier.findByPk(chantierId);
    if (!chantier) {
      return res.status(404).send('Chantier introuvable.');
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).send("Aucun fichier n'a été uploadé.");
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    let worksheet = workbook.getWorksheet('Listing general') || workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).send('Le fichier Excel ne contient aucune feuille.');
    }

    let headerRowIdx = null;
    const headerMap = {};
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const labels = row.values.map((v, idx) => (idx === 0 ? '' : getCellString(row.getCell(idx)).trim()));
      const upper = labels.map(l => normalizeHeaderLabel(l));
      if (
        (upper.includes('CATEGORIE') || upper.includes('LOT')) &&
        upper.includes('DESIGNATION')
      ) {
        headerRowIdx = rowNumber;
        upper.forEach((val, idx) => {
          if (val === 'CATEGORIE' || val === 'LOT') headerMap.categorie = idx;
          if (val === 'DESIGNATION') headerMap.designation = idx;
          if (val === 'FOURNISSEUR' || val === 'FOURNISSEURS') headerMap.fournisseur = idx;
          const qteMatch = val.match(/^QTE\s*(\d)(?:ER|ERE|E|EME)?\s*LIVRAISON$/);
          if (qteMatch) {
            headerMap[`qte${qteMatch[1]}`] = idx;
          }
          const dateMatch = val.match(/^DATE\s*(\d)(?:ER|ERE|E|EME)?\s*LIVRAISON$/);
          if (dateMatch) {
            headerMap[`date${dateMatch[1]}`] = idx;
          }
        });
        return false;
      }
    });

    if (!headerRowIdx || !headerMap.categorie || !headerMap.designation) {
      return res.status(400).send('Colonnes obligatoires introuvables (Catégorie, Désignation).');
    }

    const startRow = headerRowIdx + 1;
    const previewRows = [];

    for (let r = startRow; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const categorieStr = getCellString(row.getCell(headerMap.categorie)).trim();
      const designationStr = getCellString(row.getCell(headerMap.designation)).trim();
      const fournisseurStr = headerMap.fournisseur ? getCellString(row.getCell(headerMap.fournisseur)).trim() : '';
      const qteSlots = [1, 2, 3, 4].map(idx => {
        const cell = headerMap[`qte${idx}`] ? row.getCell(headerMap[`qte${idx}`]) : null;
        return parsePlannedQuantity(cell);
      });
      const dateSlots = [1, 2, 3, 4].map(idx => {
        const cell = headerMap[`date${idx}`] ? row.getCell(headerMap[`date${idx}`]) : null;
        return parsePlannedDate(cell);
      });

      const hasAnyQte = qteSlots.some(slot => slot.value != null || slot.invalid);
      const hasAnyDate = dateSlots.some(slot => slot.value != null || slot.invalid);
      if (!categorieStr && !designationStr && !fournisseurStr && !hasAnyQte && !hasAnyDate) {
        continue;
      }

      let status = 'ok';
      const reasons = [];
      if (!categorieStr || !designationStr) {
        status = 'error';
        reasons.push('Catégorie ou Désignation manquante');
      } else {
        if (qteSlots.some(slot => slot.invalid)) {
          status = 'warn';
          reasons.push('Quantité non numérique');
        }
        if (dateSlots.some(slot => slot.invalid)) {
          status = 'warn';
          reasons.push('Date invalide');
        }
      }

      let operation = 'create';
      if (status !== 'error') {
        const existingMat = await Materiel.findOne({ where: { nom: designationStr, categorie: categorieStr } });
        if (existingMat) {
          const existingLink = await MaterielChantier.findOne({
            where: { chantierId, materielId: existingMat.id }
          });
          if (existingLink) {
            operation = 'update';
          }
        }
      }

      previewRows.push({
        categorie: categorieStr,
        designation: designationStr,
        fournisseur: fournisseurStr || null,
        qtePrevue: null,
        qtePrevue1: qteSlots[0].value,
        qtePrevue2: qteSlots[1].value,
        qtePrevue3: qteSlots[2].value,
        qtePrevue4: qteSlots[3].value,
        datePrevue1: dateSlots[0].value,
        datePrevue2: dateSlots[1].value,
        datePrevue3: dateSlots[2].value,
        datePrevue4: dateSlots[3].value,
        status,
        reason: reasons.join(' / '),
        operation
      });
    }

    req.session.importPreview = {
      chantierId,
      chantierNom: chantier.nom,
      generatedAt: dayjs().toISOString(),
      rows: previewRows
    };

    const stats = {
      total: previewRows.length,
      ok: previewRows.filter(r => r.status === 'ok').length,
      warn: previewRows.filter(r => r.status === 'warn').length,
      error: previewRows.filter(r => r.status === 'error').length,
      create: previewRows.filter(r => r.operation === 'create' && r.status !== 'error').length,
      update: previewRows.filter(r => r.operation === 'update' && r.status !== 'error').length
    };

    return res.render('chantier/importPreview', {
      chantier,
      stats,
      rows: previewRows
    });
  } catch (err) {
    console.error('Dry-run import error', err);
    return res.status(500).send("Erreur lors de l'aperçu d'import.");
  }
});

router.post('/import-excel/confirm', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const preview = req.session.importPreview;
    if (!preview || !Array.isArray(preview.rows)) {
      return res.status(400).send('Aucun aperçu en session. Recommencez le dry-run.');
    }

    const chantier = await Chantier.findByPk(preview.chantierId);
    if (!chantier) {
      return res.status(404).send('Chantier introuvable.');
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failedRows = [];

    for (const r of preview.rows) {
      if (r.status === 'error') {
        skipped += 1;
        continue;
      }

      try {
        const [categorie] = await Categorie.findOrCreate({ where: { nom: r.categorie } });
        if (categorie && categorie.id) {
          await Designation.findOrCreate({
            where: { nom: r.designation, categorieId: categorie.id },
            defaults: { nom: r.designation, categorieId: categorie.id }
          });
        }

        const [materiel] = await Materiel.findOrCreate({
          where: { nom: r.designation, categorie: r.categorie },
          defaults: {
            nom: r.designation,
            categorie: r.categorie,
            quantite: 0,
            fournisseur: r.fournisseur || null
          }
        });

        const datePrevue1 = toDateOrNull(r.datePrevue1);
        const datePrevue2 = toDateOrNull(r.datePrevue2);
        const datePrevue3 = toDateOrNull(r.datePrevue3);
        const datePrevue4 = toDateOrNull(r.datePrevue4);
        const initial1 = r.qtePrevue1 ?? null;
        const initial2 = r.qtePrevue2 ?? null;
        const initial3 = r.qtePrevue3 ?? null;
        const initial4 = r.qtePrevue4 ?? null;

        await MaterielChantier.upsert({
          chantierId: preview.chantierId,
          materielId: materiel.id,
          quantite: 0,
          quantitePrevue: null,
          quantitePrevueInitiale: null,
          quantitePrevue1: r.qtePrevue1,
          quantitePrevue2: r.qtePrevue2,
          quantitePrevue3: r.qtePrevue3,
          quantitePrevue4: r.qtePrevue4,
          quantitePrevueInitiale1: initial1,
          quantitePrevueInitiale2: initial2,
          quantitePrevueInitiale3: initial3,
          quantitePrevueInitiale4: initial4,
          dateLivraisonPrevue: null,
          dateLivraisonPrevue1: datePrevue1,
          dateLivraisonPrevue2: datePrevue2,
          dateLivraisonPrevue3: datePrevue3,
          dateLivraisonPrevue4: datePrevue4,
          remarque: null
        });

        if (r.operation === 'update') {
          updated += 1;
        } else {
          created += 1;
        }

        await Historique.create({
          materielId: materiel.id,
          oldQuantite: null,
          newQuantite: 0,
          userId: req.user ? req.user.id : null,
          action: 'IMPORT EXCEL (confirmé)',
          materielNom: `${materiel.nom} (Chantier : ${chantier.nom})`,
          stockType: 'chantier'
        });
      } catch (e) {
        console.error('Erreur import ligne', {
          categorie: r.categorie,
          designation: r.designation,
          error: e.message
        });
        skipped += 1;
        failedRows.push({
          categorie: r.categorie,
          designation: r.designation,
          error: e.message
        });
        continue;
      }
    }

    delete req.session.importPreview;

    console.log(`Import confirmé: +${created} créés, ${updated} mis à jour, ${skipped} ignorés`);
    const failedRowsParam = failedRows.length
      ? `&failedRows=${encodeURIComponent(JSON.stringify(failedRows))}`
      : '';
    return res.redirect(
      `/chantier?chantierId=${encodeURIComponent(chantier.id)}&import=ok&created=${created}&updated=${updated}&skipped=${skipped}${failedRowsParam}`
    );
  } catch (err) {
    console.error('Confirm import error', err);
    console.error('Confirm import error stack', err.stack);
    return res.status(500).send("Erreur lors de la confirmation d'import.");
  }
});

/*
 * ===== IMPORT DE MATÉRIEL VIA EXCEL SUR UN CHANTIER =====
 *
 * Cette fonctionnalité permet de préremplir le stock d'un chantier en
 * important un fichier Excel. L'utilisateur sélectionne un chantier et
 * téléverse un fichier comprenant les colonnes suivantes :
 *   - Catégorie : servira de nom de catégorie (anciennement LOT)
 *   - Désignation : nom du matériel
 *   - Fournisseur : nom du fournisseur
 *   - Qte 1er Livraison à Qte 4e livraison + dates associées
 *
 * Les autres colonnes du fichier sont ignorées. Pour chaque ligne non
 * vide, une entrée Materiel est créée (quantité = 0) avec sa catégorie,
 * sa désignation et son fournisseur. Une entrée MaterielChantier est
 * ensuite créée avec la quantité prévue. Un historique est enregistré.
 */

// Formulaire d'importation
router.get('/import-excel', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const chantiers = await Chantier.findAll();
    const selectedChantierId = req.query.chantierId || '';
    res.render('chantier/importExcel', { chantiers, selectedChantierId });
  } catch (error) {
    console.error("Erreur lors du chargement du formulaire d'import Excel chantier", error);
    res.send("Erreur lors du chargement du formulaire d'importation.");
  }
});

// Traitement du fichier importé
router.post('/import-excel', ensureAuthenticated, checkAdmin, excelUpload.single('excel'), async (req, res) => {
  try {
    const chantierIdRaw = req.body.chantierId;
    const chantierId = chantierIdRaw ? parseInt(chantierIdRaw, 10) : null;
    if (!chantierId || Number.isNaN(chantierId)) {
      return res.status(400).send('Chantier invalide.');
    }
    const chantier = await Chantier.findByPk(chantierId);
    if (!chantier) {
      return res.status(404).send('Chantier introuvable.');
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).send("Aucun fichier n'a été uploadé.");
    }

    // Chargement du classeur Excel à partir du buffer
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    // On tente de trouver une feuille nommée "Listing general", sinon la première
    let worksheet = workbook.getWorksheet('Listing general');
    if (!worksheet) {
      worksheet = workbook.worksheets[0];
    }
    if (!worksheet) {
      return res.status(400).send('Le fichier Excel ne contient aucune feuille.');
    }

    // Recherche de la ligne d'en-tête contenant les libellés
    let headerRowIdx = null;
    let headerMap = {};
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // On convertit les cellules en chaînes pour comparaison
      const labels = row.values.map((v, idx) => (idx === 0 ? '' : getCellString(row.getCell(idx)).trim()));
      const upper = labels.map(l => normalizeHeaderLabel(l));
      // Si la ligne contient Catégorie (ou LOT) et Désignation
      if ((upper.includes('CATEGORIE') || upper.includes('LOT')) && upper.includes('DESIGNATION')) {
        headerRowIdx = rowNumber;
        upper.forEach((val, idx) => {
          if (val === 'CATEGORIE' || val === 'LOT') headerMap.categorie = idx;
          if (val === 'DESIGNATION') headerMap.designation = idx;
          if (val === 'FOURNISSEUR' || val === 'FOURNISSEURS') headerMap.fournisseur = idx;
          const qteMatch = val.match(/^QTE\s*(\d)(?:ER|ERE|E|EME)?\s*LIVRAISON$/);
          if (qteMatch) {
            headerMap[`qte${qteMatch[1]}`] = idx;
          }
          const dateMatch = val.match(/^DATE\s*(\d)(?:ER|ERE|E|EME)?\s*LIVRAISON$/);
          if (dateMatch) {
            headerMap[`date${dateMatch[1]}`] = idx;
          }
        });
        return false; // sortir de la boucle eachRow
      }
    });

    if (!headerRowIdx) {
      return res.status(400).send("Impossible de localiser les en-têtes Catégorie et Désignation dans le fichier.");
    }
    if (!headerMap.categorie || !headerMap.designation) {
      return res.status(400).send('Les colonnes Catégorie ou Désignation sont manquantes dans le fichier.');
    }

    const startRow = headerRowIdx + 1;
    const createdCount = { lignes: 0 };

    // Parcourir chaque ligne après l'en-tête
    for (let r = startRow; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const categorieStr = getCellString(row.getCell(headerMap.categorie)).trim();
      const designationStr = getCellString(row.getCell(headerMap.designation)).trim();
      const fournisseurStr = headerMap.fournisseur
        ? getCellString(row.getCell(headerMap.fournisseur)).trim()
        : '';
      // On ne retient que les lignes avec une catégorie et une désignation
      if (!categorieStr || !designationStr) {
        continue;
      }
      const qteSlots = [1, 2, 3, 4].map(idx => {
        const cell = headerMap[`qte${idx}`] ? row.getCell(headerMap[`qte${idx}`]) : null;
        return parsePlannedQuantity(cell).value;
      });
      const dateSlots = [1, 2, 3, 4].map(idx => {
        const cell = headerMap[`date${idx}`] ? row.getCell(headerMap[`date${idx}`]) : null;
        return parsePlannedDate(cell).value;
      });

      // Création ou récupération de la catégorie
      const [categorie] = await Categorie.findOrCreate({ where: { nom: categorieStr } });
      // Création ou récupération de la désignation
      if (categorie && categorie.id) {
        await Designation.findOrCreate({
          where: { nom: designationStr, categorieId: categorie.id },
          defaults: { nom: designationStr, categorieId: categorie.id }
        });
      }

      // Création du matériel (stock chantier commence à 0)
      const nouveauMateriel = await Materiel.create({
        nom: designationStr,
        reference: null,
        quantite: 0,
        description: null,
        prix: null,
        categorie: categorieStr,
        fournisseur: fournisseurStr || null,
        vehiculeId: null,
        chantierId: null,
        emplacementId: null,
        rack: null,
        compartiment: null,
        niveau: null
      });

      // Création de l'association MaterielChantier
      await MaterielChantier.create({
        chantierId: chantierId,
        materielId: nouveauMateriel.id,
        quantite: 0,
        quantiteActuelle: 0,
        quantitePrevue: null,
        quantitePrevueInitiale: null,
        quantitePrevue1: qteSlots[0],
        quantitePrevue2: qteSlots[1],
        quantitePrevue3: qteSlots[2],
        quantitePrevue4: qteSlots[3],
        quantitePrevueInitiale1: qteSlots[0],
        quantitePrevueInitiale2: qteSlots[1],
        quantitePrevueInitiale3: qteSlots[2],
        quantitePrevueInitiale4: qteSlots[3],
        dateLivraisonPrevue: null,
        dateLivraisonPrevue1: dateSlots[0],
        dateLivraisonPrevue2: dateSlots[1],
        dateLivraisonPrevue3: dateSlots[2],
        dateLivraisonPrevue4: dateSlots[3],
        remarque: null
      });

      // Enregistrement dans l'historique
      await Historique.create({
        materielId: nouveauMateriel.id,
        oldQuantite: null,
        newQuantite: 0,
        userId: req.user ? req.user.id : null,
        action: 'IMPORTÉ SUR CHANTIER',
        materielNom: `${nouveauMateriel.nom} (Chantier : ${chantier.nom})`,
        stockType: 'chantier'
      });

      createdCount.lignes++;
    }

    console.log(`Import Excel chantier : ${createdCount.lignes} lignes importées.`);
    // Redirection avec indication du chantier sélectionné pour faciliter l'affichage
    return res.redirect(`/chantier?chantierId=${encodeURIComponent(chantierId)}`);
  } catch (error) {
    console.error("Erreur lors de l'importation Excel chantier", error);
    res.status(500).send("Erreur lors de l'importation du fichier Excel.");
  }
});

/*
 * ===== VIDER LE CHANTIER (ADMIN) =====
 */
router.post('/:id/vider', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const chantierId = parseInt(req.params.id, 10);
    if (!chantierId) {
      return res.status(400).send('Chantier invalide.');
    }

    await MaterielChantier.destroy({ where: { chantierId } });
    console.log(`Chantier ${chantierId} vidé par ${req.user ? req.user.email : 'user'}`);
    return res.redirect(`/chantier?chantierId=${encodeURIComponent(chantierId)}&cleared=1`);
  } catch (e) {
    console.error('Erreur lors du vidage chantier', e);
    return res.status(500).send('Erreur lors du vidage du chantier.');
  }
});

// 📦 Exportations professionnelles
const PDFDocument = require('pdfkit');

function construireCheminEmplacement(emplacement) {
  const chemin = [];
  let courant = emplacement;
  while (courant) {
    chemin.unshift(courant.nom);
    courant = courant.parent;
  }
  return chemin.join(' > ');
}

router.get('/export-excel', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const materielChantiers = await fetchMaterielChantiersWithFilters(req.query, { includePhotos: false });

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.creator = 'Gestion Stock';
    workbook.lastModifiedBy = req.user ? req.user.email || req.user.username || 'Utilisateur' : 'Utilisateur';

    const worksheet = workbook.addWorksheet('Inventaire chantier', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    worksheet.columns = [
      { header: 'Chantier', key: 'chantier', width: 30 },
      { header: 'Matériel', key: 'materiel', width: 28 },
      { header: 'Référence', key: 'reference', width: 18 },
      { header: 'Catégorie', key: 'categorie', width: 18 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Emplacement', key: 'emplacement', width: 30 },
      { header: 'Rack', key: 'rack', width: 12 },
      { header: 'Compartiment', key: 'compartiment', width: 18 },
      { header: 'Niveau', key: 'niveau', width: 10 },
      { header: 'Quantité', key: 'quantite', width: 12 },
      { header: 'Quantité actuelle', key: 'quantiteActuelle', width: 18 },
      { header: 'Quantité prévue', key: 'quantitePrevue', width: 18 },
      { header: 'Qté init prévue (total)', key: 'quantitePrevueInitiale', width: 20 },
      { header: 'Quantité prévue 1', key: 'quantitePrevue1', width: 18 },
      { header: 'Qté init prévue 1', key: 'quantitePrevueInitiale1', width: 18 },
      { header: 'Quantité prévue 2', key: 'quantitePrevue2', width: 18 },
      { header: 'Qté init prévue 2', key: 'quantitePrevueInitiale2', width: 18 },
      { header: 'Quantité prévue 3', key: 'quantitePrevue3', width: 18 },
      { header: 'Qté init prévue 3', key: 'quantitePrevueInitiale3', width: 18 },
      { header: 'Quantité prévue 4', key: 'quantitePrevue4', width: 18 },
      { header: 'Qté init prévue 4', key: 'quantitePrevueInitiale4', width: 18 },
      { header: 'Date prévue', key: 'datePrevue', width: 16 }
    ];

    worksheet.getRow(1).height = 28;
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF10304A' } },
        left: { style: 'thin', color: { argb: 'FF10304A' } },
        bottom: { style: 'thin', color: { argb: 'FF10304A' } },
        right: { style: 'thin', color: { argb: 'FF10304A' } }
      };
    });

    const altFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE7EFF7' }
    };
    const neutralFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' }
    };

    materielChantiers.forEach(mc => {
      const mat = mc.materiel || {};
      const chantier = mc.chantier;
      const emplacement = mat.emplacement;

      worksheet.addRow({
        chantier: chantier ? `${chantier.nom}${chantier.localisation ? ' - ' + chantier.localisation : ''}` : 'N/A',
        materiel: mat.nom || 'N/A',
        reference: mat.reference || '-',
        categorie: mat.categorie || '-',
        description: mat.description || '-',
        emplacement: emplacement ? construireCheminEmplacement(emplacement) : '-',
        rack: mat.rack || '-',
        compartiment: mat.compartiment || '-',
        niveau: mat.niveau != null ? mat.niveau : '-',
        quantite: mc.quantite != null ? Number(mc.quantite) : null,
        quantiteActuelle: mc.quantiteActuelle != null
          ? Number(mc.quantiteActuelle)
          : (mc.quantite != null ? Number(mc.quantite) : null),
        quantitePrevue: mc.quantitePrevue != null ? Number(mc.quantitePrevue) : null,
        quantitePrevueInitiale: mc.quantitePrevueInitiale != null ? Number(mc.quantitePrevueInitiale) : null,
        quantitePrevue1: mc.quantitePrevue1 != null ? Number(mc.quantitePrevue1) : null,
        quantitePrevueInitiale1: mc.quantitePrevueInitiale1 != null ? Number(mc.quantitePrevueInitiale1) : null,
        quantitePrevue2: mc.quantitePrevue2 != null ? Number(mc.quantitePrevue2) : null,
        quantitePrevueInitiale2: mc.quantitePrevueInitiale2 != null ? Number(mc.quantitePrevueInitiale2) : null,
        quantitePrevue3: mc.quantitePrevue3 != null ? Number(mc.quantitePrevue3) : null,
        quantitePrevueInitiale3: mc.quantitePrevueInitiale3 != null ? Number(mc.quantitePrevueInitiale3) : null,
        quantitePrevue4: mc.quantitePrevue4 != null ? Number(mc.quantitePrevue4) : null,
        quantitePrevueInitiale4: mc.quantitePrevueInitiale4 != null ? Number(mc.quantitePrevueInitiale4) : null,
        datePrevue: mc.dateLivraisonPrevue ? new Date(mc.dateLivraisonPrevue) : null
      });
    });

    worksheet.autoFilter = {
      from: 'A1',
      to: 'M1'
    };

    worksheet.columns.forEach(column => {
      column.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      row.height = Math.max(row.height || 18, 22);
      const fill = rowNumber % 2 === 0 ? altFill : neutralFill;

      row.eachCell(cell => {
        const columnKey = cell._column && cell._column.key;
        cell.fill = fill;
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFB4C6E7' } },
          left: { style: 'hair', color: { argb: 'FFB4C6E7' } },
          bottom: { style: 'hair', color: { argb: 'FFB4C6E7' } },
          right: { style: 'hair', color: { argb: 'FFB4C6E7' } }
        };
        if (columnKey === 'quantite' || (columnKey && columnKey.startsWith('quantitePrevue'))) {
          cell.numFmt = '#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
        if (columnKey === 'datePrevue' && cell.value) {
          cell.numFmt = 'yyyy-mm-dd';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="stock_chantiers.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur lors de la génération de l\'export Excel', error);
    res.status(500).send("Erreur lors de l'export Excel du stock chantier.");
  }
});

// 📄 Export PDF structuré et lisible

router.get('/export-pdf', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const materiels = await MaterielChantier.findAll({
      include: [
        { model: Materiel, as: 'materiel', include: [{ model: Emplacement, as: 'emplacement', include: [{ model: Emplacement, as: 'parent' }] }] },
        { model: Chantier, as: 'chantier' }
      ]
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Disposition', 'attachment; filename=stock_chantiers.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');

    const addWatermark = () => {
      try {
        const boundingWidth = doc.page.width * 0.5;
        const boundingHeight = doc.page.height * 0.5;
        const x = (doc.page.width - boundingWidth) / 2;
        const y = (doc.page.height - boundingHeight) / 2;

        doc.save();
        doc.opacity(0.05);
        doc.image(logoPath, x, y, {
          fit: [boundingWidth, boundingHeight],
          align: 'center',
          valign: 'center'
        });
        doc.restore();
      } catch (error) {
        console.error("Erreur lors de l'ajout du filigrane du logo :", error);
      }
    };

    let watermarkPending = true;

    const scheduleWatermark = () => {
      watermarkPending = true;
    };

    const ensureWatermark = () => {
      if (!watermarkPending) {
        return;
      }
      addWatermark();
      watermarkPending = false;
    };

    scheduleWatermark();
    doc.on('pageAdded', scheduleWatermark);

    doc.opacity(1);
    doc.fillColor('black');

    doc.fontSize(18).text('Inventaire Matériel par Chantier', { align: 'center' });
    doc.moveDown(1.5);

    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnRatios = [0.15, 0.15, 0.1, 0.1, 0.2, 0.12, 0.05, 0.05, 0.04, 0.04];
    const colWidths = [];
    let usedWidth = 0;
    columnRatios.forEach((ratio, index) => {
      if (index === columnRatios.length - 1) {
        colWidths.push(availableWidth - usedWidth);
      } else {
        const width = Math.floor(availableWidth * ratio);
        colWidths.push(width);
        usedWidth += width;
      }
    });

    const headers = [
      'Chantier', 'Matériel', 'Référence', 'Catégorie',
      'Description', 'Emplacement', 'Rack', 'Compartiment', 'Niveau', 'Quantité'
    ];

    const tableLeft = doc.page.margins.left;
    let y = doc.y;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const cellPadding = 6;
    const headerFontSize = 9;
    const bodyFontSize = 8;

    const getRowHeight = (row, { header = false } = {}) => {
      doc.save();
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica');
      doc.fontSize(header ? headerFontSize : bodyFontSize);
      const heights = row.map((text, i) => {
        const content = text != null && text !== '' ? String(text) : '-';
        return doc.heightOfString(content, {
          width: colWidths[i] - cellPadding * 2,
          align: 'left'
        });
      });
      doc.restore();
      const maxHeight = heights.length ? Math.max(...heights) : 0;
      return Math.max(maxHeight + cellPadding * 2, header ? 24 : 20);
    };

    const drawRow = (row, yPosition, { header = false, index = 0, rowHeight } = {}) => {
      const height = rowHeight ?? getRowHeight(row, { header });
      let x = tableLeft;

      row.forEach((text, i) => {
        const width = colWidths[i];
        const background = header
          ? '#ECEFF7'
          : index % 2 === 1
            ? '#F8F9FB'
            : null;

        if (background) {
          doc.save();
          doc.fillColor(background);
          doc.rect(x, yPosition, width, height).fill();
          doc.restore();
        }

        x += width;
      });

      ensureWatermark();

      x = tableLeft;

      row.forEach((text, i) => {
        const value = text != null && text !== '' ? String(text) : '-';
        const width = colWidths[i];

        doc.save();
        doc.lineWidth(0.5);
        doc.strokeColor('#CDD4E0');
        doc.rect(x, yPosition, width, height).stroke();
        doc.restore();

        doc.save();
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica');
        doc.fontSize(header ? headerFontSize : bodyFontSize);
        doc.fillColor('#000000');
        doc.text(value, x + cellPadding, yPosition + cellPadding, {
          width: width - cellPadding * 2,
          height: height - cellPadding * 2,
          align: 'left',
          lineBreak: true,
          ellipsis: true
        });
        doc.restore();

        x += width;
      });

      return height;
    };

    const headerHeight = getRowHeight(headers, { header: true });
    y += drawRow(headers, y, { header: true, rowHeight: headerHeight });

    let rowIndex = 0;
    for (const m of materiels) {
      const mat = m.materiel;
      const chantier = m.chantier;

      const emplacement = mat?.emplacement;
      const chemin = [];
      let courant = emplacement;
      while (courant) {
        chemin.unshift(courant.nom);
        courant = courant.parent;
      }

      const values = [
        chantier?.nom || 'N/A',
        mat?.nom || 'N/A',
        mat?.reference || '-',
        mat?.categorie || '-',
        mat?.description || '-',
        chemin.join(' > ') || '-',
        mat?.rack || '-',
        mat?.compartiment || '-',
        mat?.niveau != null ? String(mat.niveau) : '-',
        m.quantite != null ? String(m.quantite) : '0'
      ];

      const rowHeight = getRowHeight(values, { header: false });
      if (y + rowHeight > bottom) {
        doc.addPage();
        scheduleWatermark();
        doc.opacity(1);
        doc.fillColor('black');
        y = doc.page.margins.top;
        y += drawRow(headers, y, { header: true, rowHeight: headerHeight });
      }

      y += drawRow(values, y, { index: rowIndex, rowHeight });
      rowIndex++;
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la génération du PDF.');
  }
});

/**
 * Génère un QR-code PNG pour un matériel de chantier.
 * Le contenu encode la valeur qr_code_value (ex: MC_<id>).
 */
router.get('/materielChantier/:id/qr', ensureAuthenticated, async (req, res) => {
  try {
    const materielChantier = await MaterielChantier.findByPk(req.params.id);
    if (!materielChantier) {
      return res.status(404).end();
    }

    if (!materielChantier.qr_code_value) {
      materielChantier.qr_code_value = `MC_${materielChantier.id}`;
      await materielChantier.save();
    }

    res.type('png');
    await QRCode.toFileStream(res, materielChantier.qr_code_value, {
      errorCorrectionLevel: 'M',
      margin: 2
    });
  } catch (err) {
    console.error('Erreur génération QR chantier:', err);
    return res.status(500).send('Erreur QR chantier');
  }
});



// Back-compat: tout /chantier/scan -> nouveau module /scan
router.get('/scan', ensureAuthenticated, (req, res) => res.redirect('/scan'));
router.post('/scan', ensureAuthenticated, (req, res) => {
  const code = (req.body && (req.body.code || req.body.barcode)) || '';
  if (!code) return res.redirect('/scan');
  return res.redirect(`/scan/resolve?code=${encodeURIComponent(code)}`);
});

module.exports = router;
