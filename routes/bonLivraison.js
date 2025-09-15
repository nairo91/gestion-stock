// routes/bonLivraison.js
const express = require('express');
const router = express.Router();

// Vos modèles
const BonLivraison = require('../models/BonLivraison');
const MaterielDelivery = require('../models/MaterielDelivery');
const Materiel = require('../models/Materiel');
const MaterielChantier = require('../models/MaterielChantier');
const Chantier = require('../models/Chantier');
const Vehicule = require('../models/Vehicule');

// Fonctions d'authentification/autorisation
const { ensureAuthenticated, checkAdmin } = require('./materiel');

// GET : Formulaire d'ajout d'un bon de livraison
router.get('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    // Récupérer tous les matériels du dépôt
    const materiels = await Materiel.findAll();
    // Récupérer tous les chantiers
    const chantiers = await Chantier.findAll();
    // Récupérer tous les véhicules
    const vehicules = await Vehicule.findAll();

    res.render('bonLivraison/ajouter', {
      materiels,
      chantiers,
      vehicules
    });
  } catch (err) {
    console.error("Erreur GET /bonLivraison/ajouter :", err);
    res.send("Erreur lors du chargement du formulaire d'ajout de bon de livraison.");
  }
});

// POST : Traitement du formulaire d'ajout d'un bon de livraison
router.post('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const {
      fournisseur,
      dateLivraison,
      reference,
      receptionneur,
      destination,   // "Stock dépôt", "Chantier", ou "Véhicule"
      chantierId,
      vehiculeId,
      items
    } = req.body;

    // 1. Créer le bon de livraison
    //    Si la destination est "Chantier" et qu'on a un chantierId, on le stocke.
    const bon = await BonLivraison.create({
      fournisseur,
      dateLivraison,
      reference,
      receptionneur,
      destination,
      chantierId: (destination === 'Chantier' && chantierId) ? parseInt(chantierId, 10) : null
    });

    // 2. Pour chaque article livré
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.materielId && item.quantite) {
          const deliveredQuantity = parseInt(item.quantite, 10);
          if (deliveredQuantity <= 0) continue;

          // (a) Enregistrer l'article dans MaterielDelivery (traçabilité de la livraison)
          await MaterielDelivery.create({
            bonLivraisonId: bon.id,
            materielId: item.materielId,
            quantite: deliveredQuantity
          });

          // (b) Récupérer le matériel (en dépôt)
          const materiel = await Materiel.findByPk(item.materielId);
          if (!materiel) continue;

          // (c) Selon la destination :
          if (destination === 'Stock dépôt') {
            // Incrémenter la quantité dans le dépôt
            materiel.quantite += deliveredQuantity;
            await materiel.save();
          }
          else if (destination === 'Chantier') {
            if (chantierId) {
              // Vérifier si (chantierId, materielId) existe déjà
              const existing = await MaterielChantier.findOne({
                where: {
                  chantierId: parseInt(chantierId, 10),
                  materielId: materiel.id
                }
              });

              if (existing) {
                existing.quantite += deliveredQuantity;
                await existing.save();
              } else {
                // Créer une nouvelle entrée
                await MaterielChantier.create({
                  chantierId: parseInt(chantierId, 10),
                  materielId: materiel.id,
                  quantite: deliveredQuantity,
                  remarque: null
                });
              }

              // Décrémenter le stock d'entrepôt
              materiel.quantite = Math.max(0, materiel.quantite - deliveredQuantity);
              await materiel.save();
            }
          }
          else if (destination === 'Véhicule') {
            if (vehiculeId) {
              // Décrémenter le stock d'entrepôt
              materiel.quantite = Math.max(0, materiel.quantite - deliveredQuantity);
              await materiel.save();

              // Créer un nouveau "Materiel" rattaché au véhicule
              await Materiel.create({
                nom: materiel.nom,
                quantite: deliveredQuantity,
                description: materiel.description,
                prix: materiel.prix,
                categorie: materiel.categorie,
                rack: null,
                compartiment: null,
                niveau: null,
                vehiculeId: parseInt(vehiculeId, 10)
              });
            }
          }
        }
      }
    }

    // Rediriger vers la liste des bons de livraison
    res.redirect('/bonLivraison');
  } catch (err) {
    console.error("Erreur POST /bonLivraison/ajouter :", err);
    res.send("Erreur lors de l'ajout du bon de livraison.");
  }
});

// GET : Liste des bons de livraison
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // On inclut le Chantier pour pouvoir accéder bon.chantier.nom
    const bons = await BonLivraison.findAll({
      include: [
        {
          model: MaterielDelivery,
          as: 'materiels',
          include: [{ model: Materiel, as: 'materiel' }]
        },
        {
          model: Chantier,
          as: 'chantier'
        }
      ]
    });
    res.render('bonLivraison/index', { bons });
  } catch (err) {
    console.error("Erreur GET /bonLivraison :", err);
    res.send("Erreur lors de la récupération des bons de livraison.");
  }
});

module.exports = router;
