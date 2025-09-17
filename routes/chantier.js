// routes/chantier.js
const Emplacement = require('../models/Emplacement');
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
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

async function fetchMaterielChantiersWithFilters(query, { includePhotos = true } = {}) {
  const {
    chantierId,
    nomMateriel,
    categorie,
    emplacement,
    description,
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

/* ===== INVENTAIRE CUMULÉ CHANTIER ===== */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const {
      chantierId,
      nomMateriel,
      categorie,
      emplacement,
      description,
      triNom,
      triAjout,
      triModification,
      recherche
    } = req.query;

    const materielChantiers = await fetchMaterielChantiersWithFilters(req.query, { includePhotos: true });

    const chantiers = await Chantier.findAll(); // Pour la liste déroulante
    const emplacements = await Emplacement.findAll(); // AJOUTÉ
    const categories = await loadCategories();
    res.render('chantier/index', {
      materielChantiers,
      chantiers,
      emplacements,
      categories,
      chantierId,
      nomMateriel,
      categorie,
      emplacement,
      description,
      triNom,
      triAjout,
      triModification,
      recherche
    });

  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la récupération du stock chantier.");
  }
});


/* ===== AJOUT DIRECT DE MATÉRIEL DANS UN CHANTIER ===== */
router.get('/ajouterMateriel', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const chantiers = await Chantier.findAll();
    const emplacementsBruts = await Emplacement.findAll({ include: [{ model: Emplacement, as: 'parent' }] });
    const categories = await loadCategories();

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
    res.render('chantier/ajouterMateriel', { chantiers, emplacements, categories });
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

// 📦 Exportations professionnelles
const ExcelJS = require('exceljs');
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
        doc.opacity(0.12);
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

    addWatermark();
    doc.on('pageAdded', addWatermark);

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
        const value = text != null && text !== '' ? String(text) : '-';
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
