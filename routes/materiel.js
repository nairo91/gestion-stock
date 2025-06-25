// routes/materiel.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storage, cloudinary } = require('../config/cloudinary.config');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const Materiel = require('../models/Materiel');
const Photo = require('../models/Photo');
const Historique = require('../models/Historique');
const User = require('../models/User');
const MaterielDelivery = require('../models/MaterielDelivery'); // si utilisé
const { sendLowStockNotification } = require('../utils/mailer') || {};

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
        { id: 'rack', title: 'Rack' },
        { id: 'compartiment', title: 'Compartiment' },
        { id: 'niveau', title: 'Niveau' },
        { id: 'photos', title: 'Photos' }
      ]
    });
    const records = materiels.map(m => ({
      id: m.id,
      nom: m.nom,
      quantite: m.quantite,
      description: m.description,
      prix: m.prix,
      rack: m.rack,
      compartiment: m.compartiment,
      niveau: m.niveau,
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
      { header: 'Rack', key: 'rack', width: 15 },
      { header: 'Compartiment', key: 'compartiment', width: 15 },
      { header: 'Niveau', key: 'niveau', width: 10 },
      { header: 'Photos', key: 'photos', width: 30 }
    ];
    materiels.forEach(m => {
      worksheet.addRow({
        id: m.id,
        nom: m.nom,
        quantite: m.quantite,
        description: m.description,
        prix: m.prix,
        rack: m.rack,
        compartiment: m.compartiment,
        niveau: m.niveau,
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
      doc.fontSize(12).text(`Quantité: ${m.quantite}`);
      doc.fontSize(12).text(`Description: ${m.description}`);
      doc.fontSize(12).text(`Prix: ${m.prix} €`);
      doc.fontSize(12).text(`Rack: ${m.rack || 'Non défini'}`);
      doc.fontSize(12).text(`Compartiment: ${m.compartiment || 'Non défini'}`);
      doc.fontSize(12).text(`Niveau: ${m.niveau || 'Non défini'}`);
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
      niveau
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
      whereClause.categorie = categorie;
    }
    if (rack && rack.trim() !== '') {
      whereClause.rack = rack;
    }
    if (compartiment && compartiment.trim() !== '') {
      whereClause.compartiment = compartiment;
    }
    if (niveau && niveau.trim() !== '') {
      whereClause.niveau = parseInt(niveau, 10);
    }
    if (minPrix || maxPrix) {
      whereClause.prix = {};
      if (minPrix) whereClause.prix[Op.gte] = parseFloat(minPrix);
      if (maxPrix) whereClause.prix[Op.lte] = parseFloat(maxPrix);
    }
    if (minQuantite || maxQuantite) {
      whereClause.quantite = whereClause.quantite || {};
      if (minQuantite) whereClause.quantite[Op.gte] = parseInt(minQuantite, 10);
      if (maxQuantite) whereClause.quantite[Op.lte] = parseInt(maxQuantite, 10);
    }

    const materiels = await Materiel.findAll({
      where: whereClause,
      include: [{ model: Photo, as: 'photos' }]
    });

    res.render('materiel/dashboard', {
      materiels,
      query: req.query,
      user: req.user
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
  const { barcode } = req.query;
  res.render('materiel/ajouter', { barcode });
});

router.post('/ajouter', ensureAuthenticated, checkAdmin, upload.array('photos', 5), async (req, res) => {
  try {
    const {
      nom,
      reference,
      barcode,   // <-- on récupère le code scanné s'il y en a un
      quantite,
      description,
      prix,
      categorie,
      rack,
      compartiment,
      niveau
    } = req.body;

    const nouveauMateriel = await Materiel.create({
      nom,
      reference,
      barcode,
      quantite: parseInt(quantite, 10),
      description,
      prix: parseFloat(prix),
      categorie,
      rack,
      compartiment,
      niveau: niveau ? parseInt(niveau, 10) : null,
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
    const delta = parseInt(amount, 10);

    const materiel = await Materiel.findByPk(req.params.id);
    if (!materiel) return res.send("Matériel non trouvé.");

    const oldQte = materiel.quantite;

    if (action === 'add') {
      materiel.quantite += delta;
    } else if (action === 'remove') {
      materiel.quantite = Math.max(0, materiel.quantite - delta);
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
    if (materiel.quantite < 5 && typeof sendLowStockNotification === 'function') {
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
    const oldQte = materiel.quantite;

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
   SCAN DU CODE-BARRES / QR
====================== */
// Affiche la page de scan (caméra)
router.get('/scanner', ensureAuthenticated, (req, res) => {
  res.render('materiel/scanner');
});

// Traite le code scanné
router.post('/scan', ensureAuthenticated, async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.json({ error: 'Aucun code reçu.' });
    }

    // Vérifie si un matériel existe déjà avec ce code
    const materiel = await Materiel.findOne({ where: { barcode } });
    if (materiel) {
      // On redirige vers un "détail" ou "modifier" ou autre
      // Par exemple : /materiel/modifier/:id
      return res.json({ redirect: `/materiel/modifier/${materiel.id}` });
    } else {
      // Aucun matériel => on redirige vers le formulaire d'ajout
      // en passant le code scanné en query
      return res.json({
        redirect: `/materiel/ajouter?barcode=${encodeURIComponent(barcode)}`
      });
    }
  } catch (err) {
    console.error('Erreur lors du scan :', err);
    return res.json({ error: 'Erreur interne' });
  }
});

module.exports.ensureAuthenticated = ensureAuthenticated;
module.exports.checkAdmin = checkAdmin;
router.ensureAuthenticated = ensureAuthenticated;
router.checkAdmin = checkAdmin;
module.exports = router;
