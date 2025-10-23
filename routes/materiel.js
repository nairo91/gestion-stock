// routes/materiel.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storage, cloudinary } = require('../config/cloudinary.config');
const { Op, fn, col, where } = require('sequelize');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const Materiel = require('../models/Materiel');
const Photo = require('../models/Photo');
const Historique = require('../models/Historique');
const User = require('../models/User');
const Emplacement = require('../models/Emplacement');
const MaterielDelivery = require('../models/MaterielDelivery'); // si utilisé
const { sendLowStockNotification } = require('../utils/mailer') || {};

const buildEmplacement = (materiel) => {
  const parts = [];
  if (materiel.rack) parts.push(materiel.rack);
  if (materiel.compartiment) parts.push(materiel.compartiment);
  if (
    materiel.niveau !== null &&
    materiel.niveau !== undefined &&
    materiel.niveau !== ''
  ) {
    parts.push(String(materiel.niveau));
  }
  if (materiel.position) parts.push(materiel.position);
  return parts.join('-');
};

const trimString = value =>
  typeof value === 'string' ? value.trim() : value;

const normalizeDecimalString = value =>
  typeof value === 'string' ? value.replace(/,/g, '.').trim() : value;

const normalizeOptionalString = value => {
  const trimmedValue = trimString(value);
  if (trimmedValue === undefined || trimmedValue === null || trimmedValue === '') {
    return null;
  }
  return trimmedValue;
};

const parseOptionalInt = value => {
  const trimmedValue = trimString(value);
  if (trimmedValue === undefined || trimmedValue === null || trimmedValue === '') {
    return null;
  }
  const parsed = parseInt(trimmedValue, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseOptionalFloat = value => {
  const trimmedValue = normalizeDecimalString(value);
  if (trimmedValue === undefined || trimmedValue === null || trimmedValue === '') {
    return null;
  }
  const parsed = parseFloat(trimmedValue);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseDecimalOrZero = value => {
  const normalized = normalizeDecimalString(value);
  if (normalized === undefined || normalized === null || normalized === '') {
    return 0;
  }
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const quantityFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatQuantity = value => quantityFormatter.format(parseDecimalOrZero(value));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/login');
}

function checkAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.send("Accès refusé : vous n'êtes pas administrateur.");
}

// Configuration Multer pour upload photos sur Cloudinary
const upload = multer({ storage });

/* ======================
   QR RACKS
====================== */
router.get('/rack/:rack/qr', ensureAuthenticated, async (req, res) => {
  try {
    const rack = req.params.rack;
    const payload = `RACK_${encodeURIComponent(rack)}`;
    res.type('png');
    await QRCode.toFileStream(res, payload, { errorCorrectionLevel: 'M', margin: 2 });
  } catch (e) {
    console.error('Erreur génération QR rack:', e);
    res.status(500).send('Erreur QR rack');
  }
});

/* ======================
   EXPORT CSV / EXCEL / PDF
====================== */
router.get('/export/csv', ensureAuthenticated, async (req, res) => {
  try {
    const materiels = await Materiel.findAll({
      where: {
        vehiculeId: null,
        chantierId: null,
        quantite: { [Op.gt]: 0 }
      },
      include: [{ model: Photo, as: 'photos' }]
    });
    const { createObjectCsvStringifier } = require('csv-writer');
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'ID' },
        { id: 'nom', title: 'Nom' },
        { id: 'quantite', title: 'Quantité' },
        { id: 'description', title: 'Description' },
        { id: 'prix', title: 'Prix' },
        { id: 'emplacement', title: 'Emplacement stock' },
        { id: 'photos', title: 'Photos' }
      ]
    });
    const records = materiels.map(m => ({
      id: m.id,
      nom: m.nom,
      quantite: formatQuantity(m.quantite),
      description: m.description,
      prix: m.prix,
      emplacement: buildEmplacement(m),
      photos: (m.photos && m.photos.length > 0)
        ? m.photos.map(p => p.chemin).join('; ')
        : ''
    }));
    let csvOutput = csvStringifier.getHeaderString();
    csvOutput += csvStringifier.stringifyRecords(records);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="materiels.csv"');
    res.send(csvOutput);
  } catch (err) {
    console.error('Erreur lors de l\'export CSV :', err);
    res.send('Erreur lors de l\'export CSV.');
  }
});

router.get('/export/excel', ensureAuthenticated, async (req, res) => {
  try {
    const materiels = await Materiel.findAll({
      where: {
        vehiculeId: null,
        chantierId: null,
        quantite: { [Op.gt]: 0 }
      },
      include: [{ model: Photo, as: 'photos' }]
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventaire');
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Quantité', key: 'quantite', width: 10 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Prix', key: 'prix', width: 10 },
      { header: 'Emplacement stock', key: 'emplacement', width: 20 },
      { header: 'Photos', key: 'photos', width: 30 }
    ];
    materiels.forEach(m => {
      worksheet.addRow({
        id: m.id,
        nom: m.nom,
        quantite: formatQuantity(m.quantite),
        description: m.description,
        prix: m.prix,
        emplacement: buildEmplacement(m),
        photos: (m.photos && m.photos.length > 0)
          ? m.photos.map(p => p.chemin).join('; ')
          : ''
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="materiels.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Erreur lors de l\'export Excel :', err);
    res.send('Erreur lors de l\'export Excel.');
  }
});

router.get('/export/pdf', ensureAuthenticated, async (req, res) => {
  try {
    const materiels = await Materiel.findAll({
      where: {
        vehiculeId: null,
        chantierId: null,
        quantite: { [Op.gt]: 0 }
      },
      include: [{ model: Photo, as: 'photos' }]
    });
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="materiels.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Inventaire des Matériels', { align: 'center' });
    doc.moveDown();

    materiels.forEach(m => {
      doc.fontSize(14).text(`ID: ${m.id} - ${m.nom}`, { underline: true });
      doc.fontSize(12).text(`Quantité: ${formatQuantity(m.quantite)}`);
      doc.fontSize(12).text(`Description: ${m.description}`);
      doc.fontSize(12).text(`Prix: ${m.prix} €`);
      const emplacement = buildEmplacement(m) || 'Non défini';
      doc.fontSize(12).text(`Emplacement: ${emplacement}`);
      if (m.photos && m.photos.length > 0) {
        doc.fontSize(12).text(`Photos: ${m.photos.map(p => p.chemin).join(', ')}`);
      }
      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error('Erreur lors de l\'export PDF :', err);
    res.send('Erreur lors de l\'export PDF.');
  }
});

/* ======================
   DASHBOARD : Stock dépôt
====================== */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const {
      nom,
      reference,
      minPrix,
      maxPrix,
      minQuantite,
      maxQuantite,
      categorie,
      rack,
      compartiment,
      niveau,
      position
    } = req.query;

    let whereClause = {
      vehiculeId: null,
      chantierId: null,
      quantite: { [Op.gt]: 0 }
    };

    // Filtres
    if (nom && nom.trim() !== '') {
      whereClause.nom = { [Op.like]: `%${nom}%` };
    }
     /* ✅ filtre référence */
     if (reference && reference.trim() !== '') {
      whereClause.reference = { [Op.like]: `%${reference}%` };
    }
    if (categorie && categorie.trim() !== '') {
      whereClause.categorie = where(
        fn('LOWER', col('categorie')),
        { [Op.like]: `%${categorie.toLowerCase()}%` }
      );
    }
    if (rack && rack.trim() !== '') {
      const rackValue = rack.trim();
      whereClause.rack = rackValue;
    }
    if (compartiment && compartiment.trim() !== '') {
      whereClause.compartiment = compartiment;
    }
    if (niveau && niveau.trim() !== '') {
      whereClause.niveau = parseInt(niveau, 10);
    }
    if (position && position.trim() !== '') {
      whereClause.position = position;
    }
    if (minPrix || maxPrix) {
      whereClause.prix = {};
      if (minPrix) whereClause.prix[Op.gte] = parseFloat(minPrix);
      if (maxPrix) whereClause.prix[Op.lte] = parseFloat(maxPrix);
    }
    if (minQuantite || maxQuantite) {
      whereClause.quantite = whereClause.quantite || {};
      const minQuantiteValue = parseOptionalFloat(minQuantite);
      const maxQuantiteValue = parseOptionalFloat(maxQuantite);
      if (minQuantiteValue !== null) whereClause.quantite[Op.gte] = minQuantiteValue;
      if (maxQuantiteValue !== null) whereClause.quantite[Op.lte] = maxQuantiteValue;
    }

    const materiels = await Materiel.findAll({
      where: whereClause,
      include: [{ model: Photo, as: 'photos' }]
    });

    const filtreRack = rack && rack.trim() !== '' ? rack : null;

    res.render('materiel/dashboard', {
      materiels,
      query: req.query,
      user: req.user,
      filtreRack
    });
  } catch (err) {
    console.error(err);
    res.send('Erreur lors de la récupération des données.');
  }
});

/* ======================
   AJOUT D'UN MATÉRIEL
====================== */
router.get('/ajouter', ensureAuthenticated, checkAdmin, (req, res) => {
  // Si un code-barres a été scanné, on peut le pré-remplir
  const { barcode: barcodeQuery } = req.query;
  const barcode =
    typeof barcodeQuery === 'string' ? barcodeQuery.trim() : barcodeQuery;
  res.render('materiel/ajouter', { barcode });
});

router.post('/ajouter', ensureAuthenticated, checkAdmin, upload.array('photos', 5), async (req, res) => {
  try {
    const {
      prix,
      quantite,
      niveau,
      rack,
      compartiment,
      position,
      barcode,
      ...rest
    } = req.body;

    const sanitizedRest = Object.fromEntries(
      Object.entries(rest).map(([key, value]) => [key, trimString(value)])
    );

    if (!sanitizedRest.nom || sanitizedRest.nom === '') {
      return res.send('Le nom du matériel est requis.');
    }

    const quantiteTrimmed = trimString(quantite);
    if (quantiteTrimmed === undefined || quantiteTrimmed === null || quantiteTrimmed === '') {
      return res.send('La quantité est requise.');
    }

    const quantiteValue = parseDecimalOrZero(quantiteTrimmed);

    const nouveauMateriel = await Materiel.create({
      ...sanitizedRest,
      quantite: quantiteValue,
      prix: parseOptionalFloat(prix),
      rack: normalizeOptionalString(rack),
      compartiment: normalizeOptionalString(compartiment),
      niveau: parseOptionalInt(niveau),
      position: normalizeOptionalString(position),
      barcode: normalizeOptionalString(barcode),
      vehiculeId: null,
      chantierId: null
    });

    // Enregistrement des photos
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = file.path || file.secure_url;
        await Photo.create({
          chemin: url,
          materielId: nouveauMateriel.id
        });
      }
    }

    // Historique
    await Historique.create({
      materielId: nouveauMateriel.id,
      oldQuantite: null,
      newQuantite: nouveauMateriel.quantite,
      userId: req.user ? req.user.id : null,
      action: 'CREATE',
      materielNom: nouveauMateriel.nom,
      stockType: 'depot'
    });

    res.redirect('/materiel');
  } catch (err) {
    console.error(err);
    res.send('Erreur lors de l’ajout.');
  }
});

/* ======================
   ÉDITION COMPLÈTE
====================== */
router.get('/editer/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const materiel = await Materiel.findByPk(req.params.id, {
      include: [{ model: Photo, as: 'photos' }]
    });
    if (!materiel) return res.send('Matériel non trouvé.');
    res.render('materiel/editer', { materiel });
  } catch (err) {
    console.error(err);
    res.send('Erreur lors de la récupération du matériel.');
  }
});

router.post(
  '/editer/:id',
  ensureAuthenticated,
  checkAdmin,
  upload.array('photos', 5),
  async (req, res) => {
    try {
      const materiel = await Materiel.findByPk(req.params.id, {
        include: [{ model: Photo, as: 'photos' }]
      });
      if (!materiel) return res.send('Matériel non trouvé.');

      const {
        prix,
        quantite,
        niveau,
        rack,
        compartiment,
        position,
        barcode,
        photosToDelete,
        ...rest
      } = req.body;

      const sanitizedRest = Object.fromEntries(
        Object.entries(rest).map(([key, value]) => [key, trimString(value)])
      );

      if (!sanitizedRest.nom || sanitizedRest.nom === '') {
        return res.send('Le nom du matériel est requis.');
      }

      const quantiteTrimmed = trimString(quantite);
      if (quantiteTrimmed === undefined || quantiteTrimmed === null || quantiteTrimmed === '') {
        return res.send('La quantité est requise.');
      }

      const quantiteValue = parseDecimalOrZero(quantiteTrimmed);

      const updateData = {
        ...sanitizedRest,
        quantite: quantiteValue,
        prix: parseOptionalFloat(prix),
        rack: normalizeOptionalString(rack),
        compartiment: normalizeOptionalString(compartiment),
        niveau: parseOptionalInt(niveau),
        position: normalizeOptionalString(position),
        barcode: normalizeOptionalString(barcode)
      };

      const oldQuantite = parseDecimalOrZero(materiel.quantite);
      await materiel.update(updateData);

      const photosToDeleteValue = photosToDelete;
      if (photosToDeleteValue) {
        const idsToDelete = Array.isArray(photosToDeleteValue)
          ? photosToDeleteValue
          : [photosToDeleteValue];
        const numericIds = idsToDelete
          .map(id => parseInt(id, 10))
          .filter(id => !Number.isNaN(id));
        if (numericIds.length > 0) {
          await Photo.destroy({
            where: { id: numericIds, materielId: materiel.id }
          });
        }
      }

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const url = file.path || file.secure_url;
          await Photo.create({
            chemin: url,
            materielId: materiel.id
          });
        }
      }

      if (oldQuantite !== quantiteValue) {
        await Historique.create({
          materielId: materiel.id,
          oldQuantite: oldQuantite,
          newQuantite: quantiteValue,
          userId: req.user ? req.user.id : null,
          action: 'UPDATE',
          materielNom: materiel.nom,
          stockType: 'depot'
        });
      }

      res.redirect('/materiel');
    } catch (err) {
      console.error(err);
      res.send('Erreur lors de la mise à jour du matériel.');
    }
  }
);

/* ======================
   MODIFICATION QUANTITÉ
====================== */
router.get('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const materiel = await Materiel.findByPk(req.params.id);
    if (!materiel) return res.send("Matériel non trouvé.");
    res.render('materiel/modifier', { materiel });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la récupération du matériel.");
  }
});

router.post('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    // On suppose qu'on reçoit "action=add|remove" et "amount"
    const { action, amount } = req.body;
    const delta = parseDecimalOrZero(amount);

    const materiel = await Materiel.findByPk(req.params.id);
    if (!materiel) return res.send("Matériel non trouvé.");

    const currentQuantite = parseDecimalOrZero(materiel.quantite);
    const oldQte = currentQuantite;

    if (action === 'add') {
      materiel.quantite = currentQuantite + delta;
    } else if (action === 'remove') {
      materiel.quantite = Math.max(0, currentQuantite - delta);
    } else {
      // S’il n’y a pas d’action, on ne fait rien (ou on gère autrement)
      return res.send("Action inconnue.");
    }

    await materiel.save();

    // Historique
    await Historique.create({
      materielId: materiel.id,
      oldQuantite: oldQte,
      newQuantite: materiel.quantite,
      userId: req.user ? req.user.id : null,
      action: 'UPDATE',
      materielNom: materiel.nom,
      stockType: 'depot'
    });

    // Notification stock faible
    if (parseDecimalOrZero(materiel.quantite) < 5 && typeof sendLowStockNotification === 'function') {
      sendLowStockNotification(materiel);
    }

    res.redirect('/materiel');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la mise à jour.");
  }
});

/* ======================
   SUPPRESSION
====================== */
router.post('/supprimer/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const materiel = await Materiel.findByPk(id);
    if (!materiel) return res.send("Matériel non trouvé.");

    const oldName = materiel.nom;
    const oldQte = parseDecimalOrZero(materiel.quantite);

    // Historique
    await Historique.create({
      materielId: materiel.id,
      oldQuantite: oldQte,
      newQuantite: null,
      userId: req.user ? req.user.id : null,
      action: 'DELETE',
      materielNom: oldName,
      stockType: 'depot'
    });

    // Libérer l'association dans l'historique
    await Historique.update({ materielId: null }, { where: { materielId: id } });

    // Supprimer photos
    await Photo.destroy({ where: { materielId: id } });
    // Supprimer MaterielDelivery
    await MaterielDelivery.destroy({ where: { materielId: id } });
    // Supprimer le matériel
    await Materiel.destroy({ where: { id } });

    res.redirect('/materiel');
  } catch (err) {
    console.error("Erreur lors de la suppression :", err);
    res.send("Erreur lors de la suppression.");
  }
});

/* ======================
   HISTORIQUE (ADMIN ONLY)
====================== */
router.get('/historique', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    // Filtre stockType = 'depot'
    const historiques = await Historique.findAll({
      where: { stockType: 'depot' },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC']]
    });
    res.render('materiel/historique', { historiques });
  } catch (err) {
    console.error("Erreur lors de la récupération de l'historique du dépôt :", err);
    res.send("Erreur lors de la récupération de l'historique du dépôt.");
  }
});

/* ======================
   FICHE D'UN MATÉRIEL (DÉPÔT)
====================== */
router.get('/info/:id', ensureAuthenticated, async (req, res) => {
  try {
    const materiel = await Materiel.findByPk(req.params.id, {
      include: [
        { model: Photo, as: 'photos' },
        { model: Emplacement, as: 'emplacement' }
      ]
    });

    if (!materiel) {
      return res.status(404).send("Matériel non trouvé.");
    }

    const historique = await Historique.findAll({
      where: { materielId: materiel.id },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC']]
    });

    res.render('materiel/infoMaterielDepot', { materiel, historique });
  } catch (err) {
    console.error('Erreur lors de la récupération des informations du matériel dépôt :', err);
    res.send("Erreur lors de la récupération des informations du matériel.");
  }
});

/* ======================
   SCAN DU CODE-BARRES / QR
====================== */
// Affiche la page de scan (caméra)
router.get('/scanner', ensureAuthenticated, (req, res) => {
  res.render('materiel/scanner');
});

/**
 * Génère un QR-code PNG pour un matériel du dépôt.
 * Le contenu encode la valeur qr_code_value (ex: MAT_<id>).
 * Accessible via /materiel/:id/qr
 */
router.get('/:id/qr', ensureAuthenticated, async (req, res) => {
  try {
    const materiel = await Materiel.findByPk(req.params.id);
    if (!materiel) {
      return res.status(404).end();
    }

    if (!materiel.qr_code_value) {
      materiel.qr_code_value = `MAT_${materiel.id}`;
      await materiel.save();
    }

    res.type('png');
    await QRCode.toFileStream(res, materiel.qr_code_value, {
      errorCorrectionLevel: 'M',
      margin: 2
    });
  } catch (err) {
    console.error('Erreur génération QR dépôt:', err);
    return res.status(500).send('Erreur QR');
  }
});

// Back-compat: tout /materiel/scan -> nouveau module /scan
router.get('/scan', ensureAuthenticated, (req, res) => res.redirect('/scan'));
router.post('/scan', ensureAuthenticated, (req, res) => {
  const code = (req.body && (req.body.code || req.body.barcode)) || '';
  if (!code) return res.redirect('/scan');
  return res.redirect(`/scan/resolve?code=${encodeURIComponent(code)}`);
});

module.exports.ensureAuthenticated = ensureAuthenticated;
module.exports.checkAdmin = checkAdmin;
router.ensureAuthenticated = ensureAuthenticated;
router.checkAdmin = checkAdmin;
module.exports = router;
