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

// Sécurité : protection des en-têtes HTTP
app.use(helmet());

// Génération d’un nonce et définition d'une politique de sécurité CSP
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " + 
    "script-src 'self' https://cdn.jsdelivr.net 'nonce-" + nonce + "'; " +
    "style-src 'self' 'unsafe-inline';"
  );
  next();
});

// EJS comme moteur de template
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware pour le corps des requêtes et les fichiers statiques
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessions et messages flash
app.use(session({
  secret: 'ton_secret_super_secure',
  resave: false,
  saveUninitialized: false
}));
app.use(flash());

// Passport.js
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// Injection de l'utilisateur dans les vues EJS
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Base de données Sequelize + modèles supplémentaires
const { sequelize } = require('./models');


sequelize.sync({ alter: true })
  .then(() => console.log('✅ Base de données synchronisée'))
  .catch(err => console.error('❌ Erreur de synchronisation', err));

// Déclaration des routes principales
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/materiel', require('./routes/materiel'));
app.use('/vehicule', require('./routes/vehicule'));
app.use('/bonLivraison', require('./routes/bonLivraison'));
app.use('/chantier', require('./routes/chantier'));
//app.use('/materielChantier', require('./routes/materielChantier')); // ← MANQUAIT
 app.use('/emplacements', require('./routes/emplacements'));
 

  const userRoutes = require('./routes/user');
  app.use('/user', userRoutes);
app.use('/user', require('./routes/user'));

// Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
