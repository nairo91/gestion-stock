// utils/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',  // Pour Gmail
  auth: {
    user: process.env.EMAIL_USER, // alerts.gestionstock@gmail.com
    pass: process.env.EMAIL_PASS  // Mot de passe d'application généré
  }
});

async function sendLowStockNotification(materiel) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,  // On envoie à ce compte (tu peux le modifier si besoin)
    subject: `Alerte Stock Faible pour ${materiel.nom}`,
    text: `Le stock du matériel "${materiel.nom}" est faible.\nQuantité actuelle : ${materiel.quantite}.\nVeuillez vérifier rapidement l'inventaire.`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Notification envoyée pour ${materiel.nom}`);
  } catch (error) {
    console.error('Erreur lors de l’envoi de l’alerte e-mail :', error);
  }
}

module.exports = { sendLowStockNotification };
