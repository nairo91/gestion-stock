require('dotenv').config();
// app.js

const express       = require('express');
const crypto        = require('crypto');
const bodyParser    = require('body-parser');
const session       = require('express-session');
const flash         = require('connect-flash');
const passport      = require('passport');
const path          = require('path');
const helmet        = require('helmet');

const app = express();

// Middleware COEP/COOP
const setCrossOriginHeaders = (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
};

// Génération d’un nonce utilisé dans certaines vues
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Sécurité : protection des en-têtes HTTP avec CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", 'https://res.cloudinary.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      },
    },
  })
);

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

// Headers COEP/COOP
app.use(setCrossOriginHeaders);

// Base de données Sequelize + modèles supplémentaires
const { sequelize } = require('./models');


sequelize.sync({ alter: true })
  .then(() => console.log('✅ Base de données synchronisée'))
  .catch(err => console.error('❌ Erreur de synchronisation', err));

app.get('/img-proxy/:public_id', async (req, res, next) => {
  try {
    const publicId = req.params.public_id;
    const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.sendStatus(response.status);
    }
    res.setHeader('Content-Type', response.headers.get('Content-Type'));
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

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
