require('dotenv').config();
// app.js

const express       = require('express');
const crypto        = require('crypto');
const session       = require('express-session');
const flash         = require('connect-flash');
const passport      = require('passport');
const path          = require('path');
const helmet        = require('helmet');
const https         = require('https');
const dayjs         = require('dayjs');

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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve vendor assets locally (jQuery + DataTables) to satisfy CSP 'self'
app.use('/vendor/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist')));
app.use('/vendor/datatables', express.static(path.join(__dirname, 'node_modules/datatables.net/js')));
app.use('/vendor/datatables-dt', express.static(path.join(__dirname, 'node_modules/datatables.net-dt')));

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

app.locals.formatDateFr = (date) => {
  if (!date) return null;
  const parsed = dayjs(date);
  return parsed.isValid() ? parsed.format('DD-MM-YYYY') : null;
};

// Mémorise l'URL d'origine avant authentification pour rediriger l'utilisateur après login.
app.use((req, res, next) => {
  try {
    if (typeof req.isAuthenticated === 'function' && !req.isAuthenticated() && req.method === 'GET') {
      req.session.returnTo = req.originalUrl;
    }
  } catch (_) {}
  next();
});

// Headers COEP/COOP
app.use(setCrossOriginHeaders);

// Base de données Sequelize + modèles supplémentaires
const { sequelize, Chantier } = require('./models');

app.use(async (req, res, next) => {
  if (Array.isArray(res.locals.chantiers) && res.locals.chantiers.length > 0) {
    return next();
  }

  try {
    res.locals.chantiers = await Chantier.findAll({ order: [['nom', 'ASC']] });
  } catch (error) {
    console.error(error);
  }

  next();
});



sequelize.sync({ alter: true })
  .then(() => console.log('✅ Base de données synchronisée'))
  .catch(err => console.error('❌ Erreur de synchronisation', err));

// Proxy pour récupérer les images Cloudinary avec les bons headers

app.get('/img-proxy/*', (req, res, next) => {
  const publicId = req.params[0];
  const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`;

  https.get(url, response => {
    if (response.statusCode && response.statusCode >= 400) {
      res.sendStatus(response.statusCode);
      return;
    }

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    response.pipe(res);
  }).on('error', err => {
    next(err);
  });
});

// Déclaration des routes principales
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/materiel', require('./routes/materiel'));
app.use('/vehicule', require('./routes/vehicule'));
app.use('/bonLivraison', require('./routes/bonLivraison'));
app.use('/chantier', require('./routes/chantier'));
app.use('/chantier', require('./routes/chantierDashboard'));
//app.use('/materielChantier', require('./routes/materielChantier')); // ← MANQUAIT
app.use('/emplacements', require('./routes/emplacements'));
app.use('/scan', require('./routes/scan'));

app.use('/transferts', require('./routes/transferts'));
 

const userRoutes = require('./routes/user');
app.use('/user', userRoutes);

app.use('/dashboard', require('./routes/dashboard'));

const { scheduleDeliveryReminderJob } = require('./services/deliveryReminderService');
if (process.env.JOB_RUNNER === '1') {
  scheduleDeliveryReminderJob();
}

// Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
