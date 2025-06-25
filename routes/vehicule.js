// routes/vehicule.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const multer = require('multer');
const { storage, cloudinary } = require('../config/cloudinary.config');

const Materiel = require('../models/Materiel');
const Photo = require('../models/Photo');
const Historique = require('../models/Historique');
const User = require('../models/User');
const Vehicule = require('../models/Vehicule');
const MaterielDelivery = require('../models/MaterielDelivery'); // si utilisé
const { sendLowStockNotification } = require('../utils/mailer');

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/login');
}

function checkAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.send("Accès refusé : vous n'êtes pas administrateur.");
}

// Configuration Multer pour les uploads sur Cloudinary
const upload = multer({ storage });

/* --- DASHBOARD & GESTION DU STOCK VÉHICULE --- */

// Affichage du stock véhicule : on affiche uniquement les matériels dont vehiculeId n'est pas null
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { plaque, nom, minPrix, maxPrix, minQuantite, maxQuantite } = req.query;
    let whereClause = {
      vehiculeId: { [Op.ne]: null }
    };

    if (plaque && plaque.trim() !== '') {
      // On peut filtrer par plaque via l'association
      // Ici, on suppose que le filtre est fait par la plaque du véhicule
      // Nous ajustons plus tard via l'inclusion de l'objet Vehicule
      whereClause['$vehicule.plaque$'] = { [Op.like]: `%${plaque}%` };
    }
    if (nom && nom.trim() !== '') {
      whereClause.nom = { [Op.like]: `%${nom}%` };
    }
    if (minPrix || maxPrix) {
      whereClause.prix = {};
      if (minPrix) whereClause.prix[Op.gte] = parseFloat(minPrix);
      if (maxPrix) whereClause.prix[Op.lte] = parseFloat(maxPrix);
    }
    if (minQuantite || maxQuantite) {
      whereClause.quantite = {};
      if (minQuantite) whereClause.quantite[Op.gte] = parseInt(minQuantite, 10);
      if (maxQuantite) whereClause.quantite[Op.lte] = parseInt(maxQuantite, 10);
    }

    const materiels = await Materiel.findAll({
      where: whereClause,
      include: [
        { model: Photo, as: 'photos' },
        { model: Vehicule, as: 'vehicule' } // pour accéder aux infos du véhicule, par ex. la plaque
      ]
    });
    res.render('vehicule/dashboard', { materiels, query: req.query });
  } catch (err) {
    console.error(err);
    res.send('Erreur lors de la récupération du stock véhicule.');
  }
});

/* --- GESTION DES MATÉRIELS DANS UN VÉHICULE --- */

// Formulaire d'ajout de matériel dans un véhicule
router.get('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const vehicles = await Vehicule.findAll();
    res.render('vehicule/ajouter', { vehicles });
  } catch (err) {
    console.error(err);
    res.send('Erreur lors du chargement du formulaire d’ajout au stock véhicule.');
  }
});

// Traitement de l'ajout de matériel dans un véhicule
router.post('/ajouter', ensureAuthenticated,checkAdmin, upload.array('photos', 5), async (req, res) => {
  try {
    const { nom, reference,quantite, description, prix, categorie, rack, compartiment, niveau, vehiculeId } = req.body;
    const nouveauMateriel = await Materiel.create({
      nom,
      reference, 
      quantite: parseInt(quantite, 10),
      description,
      prix: parseFloat(prix),
      categorie,
      rack,
      compartiment,
      niveau: niveau ? parseInt(niveau, 10) : null,
      vehiculeId: vehiculeId ? parseInt(vehiculeId, 10) : null
    });

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = file.path || file.secure_url;
        await Photo.create({
          chemin: url,
          materielId: nouveauMateriel.id
        });
      }
    }

    // Enregistrement dans l'historique pour le stock véhicule
    await Historique.create({
      materielId: nouveauMateriel.id,
      oldQuantite: null,
      newQuantite: nouveauMateriel.quantite,
      userId: req.user ? req.user.id : null,
      action: 'CREATE',
      materielNom: nouveauMateriel.nom,
      stockType: 'vehicule'
    });

    res.redirect('/vehicule');
  } catch (err) {
    console.error(err);
    res.send('Erreur lors de l’ajout au stock véhicule.');
  }
});

/* --- GESTION DES VÉHICULES --- */

// Formulaire d'ajout d'un véhicule
router.get('/ajouter-vehicule', ensureAuthenticated,checkAdmin, async (req, res) => {
  try {
    res.render('vehicule/ajouterVehicule');
  } catch (err) {
    console.error(err);
    res.send('Erreur lors du chargement du formulaire d’ajout d’un véhicule.');
  }
});

// Traitement de l'ajout d'un véhicule
router.post('/ajouter-vehicule', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const { plaque, description } = req.body;
    if (!plaque || plaque.trim() === '') {
      return res.send("La plaque du véhicule est requise.");
    }
    const nouveauVehicule = await Vehicule.create({
      plaque: plaque.trim(),
      description: description ? description.trim() : null
    });
    // Enregistrement dans l'historique pour la création d'un véhicule
    await Historique.create({
      materielId: null, // pas de matériel associé ici
      oldQuantite: null,
      newQuantite: null,
      userId: req.user ? req.user.id : null,
      action: 'VEHICULE CREE',
      materielNom: `Véhicule: ${nouveauVehicule.plaque}`,
      stockType: 'vehicule'
    });
    res.redirect('/vehicule');
  } catch (err) {
    console.error(err);
    res.send('Erreur lors de l’ajout du véhicule.');
  }
});

/* --- HISTORIQUE DU STOCK VÉHICULE --- */

router.get('/historique', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    // Ici, nous filtrons l'historique pour n'afficher que les actions relatives aux matériels affectés à un véhicule
    // On considère qu'une action concerne le stock véhicule si le matériel associé a un vehiculeId non null
    // OU si l'action est liée à la création d'un véhicule (action 'VEHICULE_CREATE')
    const historiques = await Historique.findAll({
      where: {
        [Op.or]: [
          { stockType: 'vehicule' },
          { action: 'VEHICULE_CREATE' }
        ]
      },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC']]
    });
    res.render('vehicule/historique', { historiques });
  } catch (err) {
    console.error("Erreur lors de la récupération de l'historique des véhicules :", err);
    res.send("Erreur lors de la récupération de l'historique des véhicules.");
  }
});

/* --- MODIFICATION & SUPPRESSION DANS LE STOCK VÉHICULE --- */

// Formulaire de modification du matériel dans un véhicule
router.get('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const materiel = await Materiel.findByPk(req.params.id, {
      include: [{ model: Vehicule, as: 'vehicule' }]
    });
    if (!materiel) return res.send("Matériel non trouvé.");
    const vehicles = await Vehicule.findAll();
    res.render('vehicule/modifier', { materiel, vehicles });
  } catch (err) {
    console.error(err);
    res.send('Erreur lors du chargement du formulaire de modification.');
  }
});

// Traitement de la modification du matériel dans un véhicule
router.post('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const { nom, quantite, description, prix, categorie, vehiculeId } = req.body;
    const materiel = await Materiel.findByPk(req.params.id);
    if (!materiel) return res.send("Matériel non trouvé.");

    const oldQte = materiel.quantite;
    materiel.nom = nom;
    materiel.quantite = parseInt(quantite, 10);
    materiel.description = description;
    materiel.prix = parseFloat(prix);
    materiel.categorie = categorie;
    materiel.vehiculeId = vehiculeId ? parseInt(vehiculeId, 10) : null;
    await materiel.save();

    await Historique.create({
      materielId: materiel.id,
      oldQuantite: oldQte,
      newQuantite: materiel.quantite,
      userId: req.user ? req.user.id : null,
      action: 'UPDATE',
      materielNom: materiel.nom,
      stockType: 'vehicule'
    });

    res.redirect('/vehicule');
  } catch (err) {
    console.error(err);
    res.send("Erreur lors de la mise à jour.");
  }
});

// Suppression d'un matériel dans le stock véhicule (ADMIN ONLY)
router.post('/supprimer/:id', ensureAuthenticated, checkAdmin, checkAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const materiel = await Materiel.findByPk(id);
    if (!materiel) {
      return res.send("Matériel non trouvé.");
    }

    const oldName = materiel.nom;
    const oldQte = materiel.quantite;

    await Historique.create({
      materielId: materiel.id,
      oldQuantite: oldQte,
      newQuantite: null,
      userId: req.user ? req.user.id : null,
      action: 'DELETE',
      materielNom: oldName,
      stockType: 'vehicule'
    });

    // Libérer l'association dans l'historique
    await Historique.update({ materielId: null }, { where: { materielId: id } });

    // Supprimer les photos associées
    await Photo.destroy({ where: { materielId: id } });
    // Supprimer les entrées dans MaterielDelivery associées
    await MaterielDelivery.destroy({ where: { materielId: id } });
    // Supprimer le matériel lui-même
    await Materiel.destroy({ where: { id } });

    res.redirect('/vehicule');
  } catch (err) {
    console.error("Erreur lors de la suppression :", err);
    res.send("Erreur lors de la suppression.");
  }
});

module.exports = router;
