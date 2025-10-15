// routes/chantier.js
const Emplacement = require('../models/Emplacement');
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const { storage, cloudinary } = require('../config/cloudinary.config');

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
const { sendReceptionGapNotification } = require('../utils/mailer');

const CHANTIER_FILTER_KEYS = [
  'chantierId',
  'nomMateriel',
  'categorie',
  'emplacement',
  'description',
  'fournisseur',
  'triNom',
  'triAjout',
  'triModification',
  'recherche'
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

async function fetchMaterielChantiersWithFilters(query, { includePhotos = true } = {}) {
  const {
    chantierId,
    nomMateriel,
    categorie,
    emplacement,
    description,
    fournisseur,
    triNom,
    triAjout,
    triModification,
    recherche
  } = query;

  const whereChantier = chantierId ? { chantierId } : {};
  const whereMateriel = {};

  if (nomMateriel) {
    whereMateriel.nom = { [Op.iLike]: `%${nomMateriel}%` };
  }
  if (categorie) {
    whereMateriel.categorie = { [Op.iLike]: `%${categorie}%` };
  }
  if (description) {
    whereMateriel.description = { [Op.iLike]: `%${description}%` };
  }
  if (fournisseur) {
    whereMateriel.fournisseur = { [Op.iLike]: `%${fournisseur}%` };
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

    const materielChantiers = await fetchMaterielChantiersWithFilters(activeFilters, { includePhotos: true });

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
    const fournisseurs = Array.from(
      new Set(fournisseursRaw.map(item => item.fournisseur).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const categories = await loadCategories();
    res.render('chantier/index', {
      materielChantiers,
      chantiers,
      emplacements,
      fournisseurs,
      categories,
      ...activeFilters
    });

  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la récupération du stock chantier.");
  }
});


router.post('/materielChantier/receptionner/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const { quantiteReceptionnee } = req.body;
    const receptionQty = parseInt(quantiteReceptionnee, 10);

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

    const oldQuantite = mc.quantite || 0;
    const oldQuantitePrevue = mc.quantitePrevue ?? 0;
    const quantitePrevueTotale = oldQuantite + oldQuantitePrevue;

    const newQuantite = oldQuantite + receptionQty;
    const newQuantitePrevue = Math.max(oldQuantitePrevue - receptionQty, 0);

    mc.quantite = newQuantite;
    mc.quantitePrevue = newQuantitePrevue;
    await mc.save();

    await Historique.create({
      materielId: mc.materiel ? mc.materiel.id : null,
      oldQuantite,
      newQuantite,
      userId: req.user ? req.user.id : null,
      action: `Réception chantier de ${receptionQty}`,
      materielNom: mc.materiel
        ? `${mc.materiel.nom} (Chantier : ${mc.chantier ? mc.chantier.nom : 'N/A'})`
        : 'Matériel chantier',
      stockType: 'chantier'
    });

    const difference = newQuantite - quantitePrevueTotale;

    if (difference !== 0 && mc.materiel && mc.chantier) {
      await sendReceptionGapNotification({
        difference,
        materielNom: mc.materiel.nom,
        chantierNom: mc.chantier.nom,
        quantitePrevue: quantitePrevueTotale,
        quantiteReelle: newQuantite
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
    const { nom, reference, quantite, quantitePrevue, dateLivraisonPrevue, description, prix, categorie, fournisseur, chantierId, emplacementId, rack, compartiment, niveau, remarque } = req.body;
    const prixNumber = prix ? parseFloat(prix) : null;
    const qtePrevue = quantitePrevue ? parseInt(quantitePrevue, 10) : null;
    const datePrevue = dateLivraisonPrevue ? new Date(dateLivraisonPrevue) : null;

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
      quantitePrevue: qtePrevue,
      dateLivraisonPrevue: datePrevue,
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
            await mc.save();
          } else {
              await MaterielChantier.create({
                chantierId: parseInt(chantierId, 10),
                materielId: item.materielId,
                quantite: deliveredQuantity,
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

/* ===== HISTORIQUE CHANTIER ===== */
router.get('/historique', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const historiques = await Historique.findAll({
      where: { stockType: 'chantier' },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC']]
    });
    res.render('chantier/historique', { historiques });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la récupération de l'historique chantier.");
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
        rack, compartiment, niveau, reference, description, prix, remarque
      } = req.body;

    const mc = await MaterielChantier.findByPk(req.params.id, {
      include: [
        { model: Materiel, as: 'materiel' },
        { model: Chantier, as: 'chantier' }
      ]
    });
    if (!mc) return res.send("Enregistrement non trouvé.");

    const newQte = (quantite === undefined || quantite === '')
      ? mc.quantite
      : parseInt(quantite, 10);
    const newQtePrevue = (quantitePrevue === undefined || quantitePrevue === '')
      ? mc.quantitePrevue
      : parseInt(quantitePrevue, 10);
    const newDatePrevue = (dateLivraisonPrevue === undefined || dateLivraisonPrevue === '')
      ? mc.dateLivraisonPrevue
      : new Date(dateLivraisonPrevue);

    if (
      isNaN(newQte) || newQte < 0 ||
      !nomMateriel || !nomMateriel.trim() || !categorie
    ) {
      return res.status(400).send("Les champs désignation et catégorie sont obligatoires.");
    }

    const changementsDetail = [];

    const oldQte = mc.quantite;
    const oldNom = mc.materiel.nom;
    const oldCategorie = mc.materiel.categorie;
    const oldEmplacement = mc.materiel.emplacementId;
    const oldRack = mc.materiel.rack;
    const oldCompartiment = mc.materiel.compartiment;
    const oldFournisseur = mc.materiel.fournisseur;
    const oldNiveau = mc.materiel.niveau;
    const oldReference = mc.materiel.reference;
    const oldDescription = mc.materiel.description;
      const oldPrix = mc.materiel.prix;
      const oldRemarque = mc.remarque;
    const oldQtePrevue = mc.quantitePrevue;
    const oldDatePrevue = mc.dateLivraisonPrevue;

    const newNom = nomMateriel.trim();
    const newCategorie = categorie;
    await Categorie.findOrCreate({ where: { nom: newCategorie } });
    const newEmplacement = emplacementId ? parseInt(emplacementId) : null;
    const newRack = rack;
    const newCompartiment = compartiment;
    const newFournisseur = fournisseur;
    const newNiveau = niveau ? parseInt(niveau) : null;
    const newReference = reference;
    const newDescription = description;
      const newPrix = prix ? parseFloat(prix) : null;
      const newRemarque = remarque && remarque.trim() ? remarque.trim() : null;

    if (oldQte !== newQte) changementsDetail.push(`Quantité: ${oldQte} ➔ ${newQte}`);
    if (oldNom !== newNom) changementsDetail.push(`Nom: ${oldNom} ➔ ${newNom}`);
    if (oldCategorie !== newCategorie) changementsDetail.push(`Catégorie: ${oldCategorie || '-'} ➔ ${newCategorie}`);
    if (oldEmplacement !== newEmplacement) changementsDetail.push(`Emplacement: ${oldEmplacement || '-'} ➔ ${newEmplacement || '-'}`);
    if (oldRack !== newRack) changementsDetail.push(`Rack: ${oldRack || '-'} ➔ ${newRack || '-'}`);
    if (oldFournisseur !== newFournisseur) changementsDetail.push(`Fournisseur: ${oldFournisseur || '-'} ➔ ${newFournisseur || '-'}`);
    if (oldCompartiment !== newCompartiment) changementsDetail.push(`Compartiment: ${oldCompartiment || '-'} ➔ ${newCompartiment || '-'}`);
    if (oldNiveau !== newNiveau) changementsDetail.push(`Niveau: ${oldNiveau || '-'} ➔ ${newNiveau || '-'}`);
    if (oldReference !== newReference) changementsDetail.push(`Référence: ${oldReference || '-'} ➔ ${newReference || '-'}`);
    if (oldDescription !== newDescription) changementsDetail.push(`Description: ${oldDescription || '-'} ➔ ${newDescription || '-'}`);
      if (oldPrix !== newPrix) changementsDetail.push(`Prix: ${oldPrix || '-'} ➔ ${newPrix || '-'}`);
      if (oldRemarque !== newRemarque) changementsDetail.push(`Remarque: ${oldRemarque || '-'} ➔ ${newRemarque || '-'}`);
    if (oldQtePrevue !== newQtePrevue) changementsDetail.push(`Quantité prévue: ${oldQtePrevue || '-'} ➔ ${newQtePrevue || '-'}`);
    if ( (oldDatePrevue ? oldDatePrevue.toISOString().split('T')[0] : '') !== (newDatePrevue ? newDatePrevue.toISOString().split('T')[0] : '') )
      changementsDetail.push(`Date prévue: ${oldDatePrevue ? oldDatePrevue.toISOString().split('T')[0] : '-'} ➔ ${newDatePrevue ? newDatePrevue.toISOString().split('T')[0] : '-'}`);

    // Mise à jour
    mc.quantite = newQte;
    mc.quantitePrevue = newQtePrevue;
    mc.dateLivraisonPrevue = newDatePrevue;
    mc.materiel.nom = newNom;
    mc.materiel.categorie = newCategorie;
    mc.materiel.emplacementId = newEmplacement;
    mc.materiel.fournisseur = newFournisseur;
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
      oldQuantite: oldQte,
      newQuantite: newQte,
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
      const url = req.file.path || req.file.secure_url;
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
      const { nom, reference, quantite, quantitePrevue, dateLivraisonPrevue, description, prix, categorie, fournisseur, chantierId, emplacementId, remarque } = req.body;
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
      quantite: 0,
      emplacementId: emplacementId ? parseInt(emplacementId) : null
    });

    // Gérer la photo si fournie
    if (req.file) {
      const url = req.file.path || req.file.secure_url;
      await Photo.create({
        chemin: url,
        materielId: nouveauMateriel.id
      });
    }

    // Ajouter dans le chantier
      await MaterielChantier.create({
        chantierId: parseInt(chantierId),
        materielId: nouveauMateriel.id,
        quantite: parseInt(quantite),
        quantitePrevue: qtePrevue,
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
      const labels = row.values.map(v => (v != null ? String(v).trim() : ''));
      const upper = labels.map(l => l.toUpperCase());
      if (upper.includes('LOT') && (upper.includes('DÉSIGNATION') || upper.includes('DESIGNATION'))) {
        headerRowIdx = rowNumber;
        upper.forEach((val, idx) => {
          if (val === 'LOT') headerMap.lot = idx;
          if (val === 'DÉSIGNATION' || val === 'DESIGNATION') headerMap.designation = idx;
          if (val === 'FOURNISSEUR' || val === 'FOURNISSEURS') headerMap.fournisseur = idx;
          if ((val === 'QTE' || val === 'QTÉ' || val === 'QUANTITÉ') && typeof headerMap.qte === 'undefined') {
            headerMap.qte = idx;
          }
        });
        return false;
      }
    });

    if (!headerRowIdx || !headerMap.lot || !headerMap.designation || !headerMap.qte) {
      return res.status(400).send('Colonnes obligatoires introuvables (LOT, Désignation, Qte).');
    }

    const startRow = headerRowIdx + 1;
    const previewRows = [];

    for (let r = startRow; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const lotStr = getCellString(row.getCell(headerMap.lot)).trim();
      const designationStr = getCellString(row.getCell(headerMap.designation)).trim();
      const fournisseurStr = headerMap.fournisseur ? getCellString(row.getCell(headerMap.fournisseur)).trim() : '';
      const qteStr = getCellString(row.getCell(headerMap.qte)).trim();
      const qteClean = qteStr.replace(/[^\d.,-]/g, '');
      let qteNumber = qteClean ? Math.round(parseFloat(qteClean.replace(',', '.'))) : null;
      if (Number.isNaN(qteNumber)) {
        qteNumber = null;
      }

      if (!lotStr && !designationStr && !fournisseurStr && !qteStr) {
        continue;
      }

      let status = 'ok';
      let reason = '';
      if (!lotStr || !designationStr) {
        status = 'error';
        reason = 'LOT ou Désignation manquant';
      } else if (qteStr && qteNumber === null) {
        status = 'warn';
        reason = 'Quantité non numérique';
      } else if (!qteStr) {
        status = 'warn';
        reason = 'Quantité vide';
      }

      let operation = 'create';
      if (status !== 'error') {
        const existingMat = await Materiel.findOne({ where: { nom: designationStr, categorie: lotStr } });
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
        lot: lotStr,
        designation: designationStr,
        fournisseur: fournisseurStr || null,
        qtePrevue: qteNumber,
        status,
        reason,
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

    for (const r of preview.rows) {
      if (r.status === 'error') {
        skipped += 1;
        continue;
      }

      const [categorie] = await Categorie.findOrCreate({ where: { nom: r.lot } });
      if (categorie && categorie.id) {
        await Designation.findOrCreate({
          where: { nom: r.designation, categorieId: categorie.id },
          defaults: { nom: r.designation, categorieId: categorie.id }
        });
      }

      const [materiel] = await Materiel.findOrCreate({
        where: { nom: r.designation, categorie: r.lot },
        defaults: {
          nom: r.designation,
          categorie: r.lot,
          quantite: 0,
          fournisseur: r.fournisseur || null
        }
      });

      await MaterielChantier.upsert({
        chantierId: preview.chantierId,
        materielId: materiel.id,
        quantite: 0,
        quantitePrevue: r.qtePrevue,
        dateLivraisonPrevue: null,
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
    }

    delete req.session.importPreview;

    console.log(`Import confirmé: +${created} créés, ${updated} mis à jour, ${skipped} ignorés`);
    return res.redirect(`/chantier?chantierId=${encodeURIComponent(chantier.id)}&import=ok&created=${created}&updated=${updated}&skipped=${skipped}`);
  } catch (err) {
    console.error('Confirm import error', err);
    return res.status(500).send("Erreur lors de la confirmation d'import.");
  }
});

/*
 * ===== IMPORT DE MATÉRIEL VIA EXCEL SUR UN CHANTIER =====
 *
 * Cette fonctionnalité permet de préremplir le stock d'un chantier en
 * important un fichier Excel. L'utilisateur sélectionne un chantier et
 * téléverse un fichier comprenant les colonnes suivantes :
 *   - LOT : servira de nom de catégorie
 *   - Désignation : nom du matériel
 *   - Fournisseur : nom du fournisseur
 *   - Qte : quantité prévue (stock théorique ou attendue)
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
      const labels = row.values.map(v => {
        const str = v && typeof v === 'string' ? v : (v != null ? v.toString() : '');
        return str ? str.trim() : '';
      });
      const upper = labels.map(l => l.toUpperCase());
      // Si la ligne contient LOT et Désignation
      if (upper.includes('LOT') && (upper.includes('DÉSIGNATION') || upper.includes('DESIGNATION'))) {
        headerRowIdx = rowNumber;
        upper.forEach((val, idx) => {
          if (val === 'LOT') headerMap.lot = idx;
          if (val === 'DÉSIGNATION' || val === 'DESIGNATION') headerMap.designation = idx;
          if (val === 'FOURNISSEUR' || val === 'FOURNISSEURS') headerMap.fournisseur = idx;
          // QTE peut être écrit différemment ; on capture plusieurs variantes
          if (val === 'QTE' || val === 'QTÉ' || val === 'QUANTITÉ') {
            if (typeof headerMap.qte === 'undefined') {
              headerMap.qte = idx;
            }
          }
        });
        return false; // sortir de la boucle eachRow
      }
    });

    if (!headerRowIdx) {
      return res.status(400).send("Impossible de localiser les en-têtes LOT et Désignation dans le fichier.");
    }
    if (!headerMap.lot || !headerMap.designation || !headerMap.qte) {
      return res.status(400).send('Les colonnes LOT, Désignation ou Qte sont manquantes dans le fichier.');
    }

    const startRow = headerRowIdx + 1;
    const createdCount = { lignes: 0 };

    // Parcourir chaque ligne après l'en-tête
    for (let r = startRow; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const lotStr = getCellString(row.getCell(headerMap.lot)).trim();
      const designationStr = getCellString(row.getCell(headerMap.designation)).trim();
      const fournisseurStr = headerMap.fournisseur
        ? getCellString(row.getCell(headerMap.fournisseur)).trim()
        : '';
      const qteStr = getCellString(row.getCell(headerMap.qte)).trim();
      const qteClean = qteStr.replace(/[^\d.,-]/g, '');
      // On ne retient que les lignes avec une catégorie et une désignation
      if (!lotStr || !designationStr) {
        continue;
      }
      // Parsing de la quantité prévue : peut être un nombre, du texte ou vide
      let qteNumber = qteClean ? Math.round(parseFloat(qteClean.replace(',', '.'))) : null;
      if (qteClean && Number.isNaN(qteNumber)) {
        qteNumber = null;
      }

      // Création ou récupération de la catégorie
      const [categorie] = await Categorie.findOrCreate({ where: { nom: lotStr } });
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
        categorie: lotStr,
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
        quantitePrevue: qteNumber,
        dateLivraisonPrevue: null,
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
      { header: 'Quantité prévue', key: 'quantitePrevue', width: 18 },
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
        quantitePrevue: mc.quantitePrevue != null ? Number(mc.quantitePrevue) : null,
        datePrevue: mc.dateLivraisonPrevue ? new Date(mc.dateLivraisonPrevue) : null
      });
    });

    worksheet.autoFilter = {
      from: 'A1',
      to: 'L1'
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
        if (columnKey === 'quantite' || columnKey === 'quantitePrevue') {
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



module.exports = router;
