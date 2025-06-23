// routes/chantier.js
const Emplacement = require('../models/Emplacement');
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');

const Materiel = require('../models/Materiel');
const Photo = require('../models/Photo');
const Historique = require('../models/Historique');
const User = require('../models/User');
const Chantier = require('../models/Chantier');
const MaterielChantier = require('../models/MaterielChantier');

const { ensureAuthenticated, checkAdmin } = require('./materiel');

// Configuration Multer pour les uploads de photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

/* ===== INVENTAIRE CUMULÉ CHANTIER ===== */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { chantierId, nomMateriel, categorie, emplacement, description, triNom, triAjout, triModification } = req.query;

    const whereChantier = chantierId ? { chantierId: chantierId } : {};
    const whereMateriel = {};

    if (nomMateriel) whereMateriel.nom = { [Op.like]: `%${nomMateriel}%` };
    if (categorie) whereMateriel.categorie = { [Op.like]: `%${categorie}%` };
    if (description) whereMateriel.description = { [Op.like]: `%${description}%` };


    const order = [];
    if (triNom === 'asc' || triNom === 'desc') {
      order.push([{ model: Materiel, as: 'materiel' }, 'nom', triNom.toUpperCase()]);
    }
    if (triAjout === 'asc' || triAjout === 'desc') {
      order.push(['createdAt', triAjout.toUpperCase()]);
    }
    if (triModification === 'asc' || triModification === 'desc') {
      order.push(['updatedAt', triModification.toUpperCase()]);
    }

    const materielChantiers = await MaterielChantier.findAll({
  where: whereChantier,
  include: [
    { model: Chantier, as: 'chantier' },
    {
      model: Materiel,
      as: 'materiel',
      where: whereMateriel,
      include: [
        { model: Photo, as: 'photos' },
       {
  model: Emplacement,
  as: 'emplacement',
  where: emplacement
    ? { nom: { [Op.like]: `%${emplacement}%` } }
    : undefined,
  include: [
    {
      model: Emplacement,
      as: 'parent',
      include: [
        { model: Emplacement, as: 'parent' } // 2 niveaux de profondeur
      ]
    }
  ]
}

      ]
    }
  ],

  order: order.length > 0 ? order : undefined



});


    const chantiers = await Chantier.findAll(); // Pour la liste déroulante
    const emplacements = await Emplacement.findAll(); // AJOUTÉ
    res.render('chantier/index', {
  materielChantiers,
  chantiers,
  emplacements,
  chantierId,
  nomMateriel,
  categorie,
  emplacement,
  description,
  triNom,
  triAjout,
  triModification
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
    res.render('chantier/ajouterMateriel', { chantiers, emplacements });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors du chargement du formulaire d'ajout de matériel dans un chantier.");
  }
});

router.post('/ajouterMateriel', ensureAuthenticated, checkAdmin, upload.array('photos', 5), async (req, res) => {
  try {
    const { nom, reference, quantite, description, prix, categorie, fournisseur, chantierId, emplacementId, rack, compartiment, niveau } = req.body;

    
    // 1) Créer le matériel avec quantite=0 dans la table Materiel
   const nouveauMateriel = await Materiel.create({
  nom,
  reference,
  quantite: 0,
  description,
  prix: parseFloat(prix),
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
        const relativePath = path
          .join('uploads', file.filename)
          .replace(/\\/g, '/');
        await Photo.create({
          chemin: relativePath,
          materielId: nouveauMateriel.id
        });
      }
    }

    // 3) Créer l'entrée dans MaterielChantier
    const qte = parseInt(quantite, 10);
    await MaterielChantier.create({
      chantierId: parseInt(chantierId, 10),
      materielId: nouveauMateriel.id,
      quantite: qte
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
              quantite: deliveredQuantity
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

    if (!mc) return res.send("Enregistrement introuvable.");

    res.render('chantier/modifierMaterielChantier', { mc, emplacements });
  } catch (err) {
    console.error(err);
    res.send("Erreur lors du chargement de la page    de modification.");
  }
});


router.post('/materielChantier/modifier/:id', ensureAuthenticated, checkAdmin, upload.single('photo'), async (req, res) => {
  try {
    const {
      quantite, nomMateriel, categorie, fournisseur, emplacementId,
      rack, compartiment, niveau
    } = req.body;

    const mc = await MaterielChantier.findByPk(req.params.id, {
      include: [
        { model: Materiel, as: 'materiel' },
        { model: Chantier, as: 'chantier' }
      ]
    });
    if (!mc) return res.send("Enregistrement non trouvé.");

    const changementsDetail = [];

    const oldQte = mc.quantite;
    const oldNom = mc.materiel.nom;
    const oldCategorie = mc.materiel.categorie;
    const oldEmplacement = mc.materiel.emplacementId;
    const oldRack = mc.materiel.rack;
    const oldCompartiment = mc.materiel.compartiment;
    const oldFournisseur = mc.materiel.fournisseur;
    const oldNiveau = mc.materiel.niveau;

    const newQte = parseInt(quantite, 10);
    const newNom = nomMateriel.trim();
    const newCategorie = categorie;
    const newEmplacement = emplacementId ? parseInt(emplacementId) : null;
    const newRack = rack;
    const newCompartiment = compartiment;
    const newFournisseur = fournisseur;
    const newNiveau = niveau ? parseInt(niveau) : null;

    if (oldQte !== newQte) changementsDetail.push(`Quantité: ${oldQte} ➔ ${newQte}`);
    if (oldNom !== newNom) changementsDetail.push(`Nom: ${oldNom} ➔ ${newNom}`);
    if (oldCategorie !== newCategorie) changementsDetail.push(`Catégorie: ${oldCategorie || '-'} ➔ ${newCategorie}`);
    if (oldEmplacement !== newEmplacement) changementsDetail.push(`Emplacement: ${oldEmplacement || '-'} ➔ ${newEmplacement || '-'}`);
    if (oldRack !== newRack) changementsDetail.push(`Rack: ${oldRack || '-'} ➔ ${newRack || '-'}`);
    if (oldFournisseur !== newFournisseur) changementsDetail.push(`Fournisseur: ${oldFournisseur || '-'} ➔ ${newFournisseur || '-'}`);
    if (oldCompartiment !== newCompartiment) changementsDetail.push(`Compartiment: ${oldCompartiment || '-'} ➔ ${newCompartiment || '-'}`);
    if (oldNiveau !== newNiveau) changementsDetail.push(`Niveau: ${oldNiveau || '-'} ➔ ${newNiveau || '-'}`);

    // Mise à jour
    mc.quantite = newQte;
    mc.materiel.nom = newNom;
    mc.materiel.categorie = newCategorie;
    mc.materiel.emplacementId = newEmplacement;
    mc.materiel.fournisseur = newFournisseur;
    mc.materiel.rack = newRack;
    mc.materiel.compartiment = newCompartiment;
    mc.materiel.niveau = newNiveau;

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
      await Photo.destroy({ where: { materielId: mc.materiel.id } });
      const chemin = path
        .join('uploads', req.file.filename)
        .replace(/\\/g, '/');
      await Photo.create({
        chemin,
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
  res.render('chantier/dupliquerMaterielChantier', { mc, chantiers, emplacements });
});


router.post('/materielChantier/dupliquer/:id', ensureAuthenticated, checkAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { nom, reference, quantite, description, prix, categorie, chantierId, emplacementId } = req.body;

    // Créer le matériel
    const nouveauMateriel = await Materiel.create({
      nom,
      reference,
      description,
      prix: parseFloat(prix),
      categorie,
      quantite: 0,
      emplacementId: emplacementId ? parseInt(emplacementId) : null
    });

    // Gérer la photo si fournie
    if (req.file) {
      const chemin = path
        .join('uploads', req.file.filename)
        .replace(/\\/g, '/');
      await Photo.create({
        chemin,
        materielId: nouveauMateriel.id
      });
    }

    // Ajouter dans le chantier
    await MaterielChantier.create({
      chantierId: parseInt(chantierId),
      materielId: nouveauMateriel.id,
      quantite: parseInt(quantite)
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

// 📦 Export PDF structuré et lisible
const PDFDocument = require('pdfkit');

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

    doc.fontSize(18).text('Inventaire Matériel par Chantier', { align: 'center' });
    doc.moveDown(1.5);

    // Colonnes du tableau
    const headers = [
      'Chantier', 'Matériel', 'Référence', 'Catégorie',
      'Description', 'Emplacement', 'Rack', 'Compartiment', 'Niveau', 'Quantité'
    ];
    const colWidths = [80, 90, 70, 60, 110, 90, 35, 50, 40, 40];
    const startX = doc.x;
    let y = doc.y;

    const drawCell = (text, x, y, width) => {
      doc.rect(x, y, width, 30).stroke();
      doc.fontSize(8).text(text || '-', x + 2, y + 4, { width: width - 4 });
    };

    // En-têtes
    let x = startX;
    headers.forEach((h, i) => {
      drawCell(h, x, y, colWidths[i]);
      x += colWidths[i];
    });

    y += 30;

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

      x = startX;
      values.forEach((val, i) => {
        drawCell(val, x, y, colWidths[i]);
        x += colWidths[i];
      });

      y += 30;

      if (y > 750) {
        doc.addPage();
        y = 40;
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la génération du PDF.');
  }
});



module.exports = router;
