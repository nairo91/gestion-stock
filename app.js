// app.js
require('dotenv').config();

const express       = require('express');
const crypto        = require('crypto');
const bodyParser    = require('body-parser');
const session       = require('express-session');
const flash         = require('connect-flash');
const passport      = require('passport');
const path          = require('path');
const helmet        = require('helmet');

const app = express();

// Utilisation de Helmet pour d'autres protections
app.use(helmet());

// Middleware pour générer un nonce et définir la CSP
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  // On autorise uniquement les scripts de 'self' et les scripts inline portant ce nonce.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'nonce-" + nonce + "'; " +
    "style-src 'self' 'unsafe-inline';"
  );
  next();
});

// Configuration du moteur de template EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware pour parser le corps des requêtes et servir les fichiers statiques
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Gestion des sessions et flash messages
app.use(session({
  secret: 'ton_secret_super_secure',
  resave: false,
  saveUninitialized: false
}));
app.use(flash());

// Initialisation de Passport
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// <-- AJOUTER CE MIDDLEWARE POUR QUE LA VARIABLE user SOIT DISPONIBLE DANS LES VUES
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Synchronisation de la base de données avec alteration pour mettre à jour la structure
const { sequelize } = require('./models');

// Chargez explicitement les modèles qui ne sont pas importés automatiquement
require('./models/Chantier');
require('./models/MaterielChantier');

sequelize.sync({ alter: true })
    .then(() => console.log('Base de données synchronisée avec les nouveaux champs'))
    .catch(err => console.error('Erreur de synchronisation', err));

// Définition des routes
app.use('/',               require('./routes/index'));
app.use('/auth',           require('./routes/auth'));
app.use('/materiel',       require('./routes/materiel'));
// Dans app.js, après les autres routes
app.use('/vehicule',       require('./routes/vehicule'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});

// Routes supplémentaires
const bonLivraisonRoutes = require('./routes/bonLivraison');
app.use('/bonLivraison', bonLivraisonRoutes);

const chantierRoutes = require('./routes/chantier');
app.use('/chantier', chantierRoutes);
const materielChantierRoutes = require('./routes/materielChantier');