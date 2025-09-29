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

async function sendReceptionGapNotification({
  difference,
  materielNom,
  chantierNom,
  quantitePrevue,
  quantiteReelle
}) {
  const recipients = [
    'launay.jeremy@batirenov.info',
    'athari.keivan@batirenov.info',
    'blot.valentin@batirenov.info',
    'rouault.christophe@batirenov.info',
    'mirona.orian@batirenov.info'
  ];

  const ecartAbsolu = Math.abs(difference);
  const tendance = difference > 0 ? 'supérieure' : 'inférieure';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipients.join(','),
    subject: `Écart de réception pour ${materielNom}`,
    text: [
      `Une différence de ${ecartAbsolu} a été détectée entre la quantité prévue et la quantité réceptionnée pour ${materielNom}.`,
      `La quantité réceptionnée est ${tendance} à la quantité prévue.`,
      `Quantité prévue : ${quantitePrevue}.`,
      `Quantité réceptionnée : ${quantiteReelle}.`,
      `Chantier concerné : ${chantierNom}.`
    ].join('\n')
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Alerte de réception envoyée pour ${materielNom} (${chantierNom})`);
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'alerte de réception :", error);
  }
}

module.exports = { sendLowStockNotification, sendReceptionGapNotification };
