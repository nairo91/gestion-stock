// utils/mailer.js
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new Error('Les variables EMAIL_USER et EMAIL_PASS doivent être configurées pour l\'envoi des mails.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',  // Pour Gmail
  auth: {
    user: process.env.EMAIL_USER, // alerts.gestionstock@gmail.com
    pass: process.env.EMAIL_PASS  // Mot de passe d'application généré
  }
});

const DEFAULT_RECIPIENTS = [
  'blot.valentin@batirenov.info',
  'heidsieck.louisiane@batirenov.info',
  'launay.jeremy@batirenov.info',
  'mirona.orian@batirenov.info'
];

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
  const ecartAbsolu = Math.abs(difference);
  const tendance = difference > 0 ? 'supérieure' : 'inférieure';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: DEFAULT_RECIPIENTS.join(','),
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

async function sendDeliveryDelayNotification({
  materielNom,
  chantierNom,
  quantitePrevue,
  quantiteReelle,
  datePrevue,
  daysLate,
  isFollowUp
}) {
  const subjectPrefix = isFollowUp ? 'Rappel - Retard de livraison' : 'Retard de livraison';
  const subject = `${subjectPrefix} · ${materielNom} (${chantierNom || 'Stock dépôt'})`;

  const formattedDate = datePrevue
    ? dayjs(datePrevue).format('DD/MM/YYYY')
    : 'Non renseignée';
  const difference = quantitePrevue !== null && quantiteReelle !== null
    ? quantitePrevue - quantiteReelle
    : null;

  const headerColor = isFollowUp ? '#d35400' : '#c0392b';
  const ribbonColor = isFollowUp ? '#f39c12' : '#e74c3c';
  const introText = isFollowUp
    ? "Deuxième rappel : la livraison attendue n'a toujours pas été réceptionnée."
    : 'Alerte : une livraison prévue est en retard.';

  const html = `
    <div style="font-family: Arial, sans-serif; background-color:#f8f9fa; padding:20px;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; box-shadow:0 6px 24px rgba(231, 76, 60, 0.25); overflow:hidden;">
        <div style="background:${headerColor}; padding:24px; text-align:center; color:#ffffff;">
          <div style="font-size:40px; font-weight:800; letter-spacing:6px;">RETARD</div>
          <div style="font-size:18px; margin-top:8px; font-weight:600;">${introText}</div>
          <div style="font-size:14px; margin-top:6px;">Rappel automatique envoyé à ${dayjs().format('HH[h]mm')}</div>
        </div>
        <div style="padding:24px; color:#2c3e50;">
          <p style="margin-top:0; font-size:16px; line-height:1.6;">
            <strong>${daysLate} jour(s) de retard</strong> pour la livraison du matériel suivant :
          </p>
          <table style="width:100%; border-collapse:collapse; font-size:15px;">
            <tbody>
              <tr>
                <td style="padding:10px 0; font-weight:600; width:40%; color:#34495e;">Matériel</td>
                <td style="padding:10px 0;">${materielNom}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; font-weight:600; color:#34495e;">Chantier / Stock</td>
                <td style="padding:10px 0;">${chantierNom || 'Stock dépôt'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; font-weight:600; color:#34495e;">Date prévue</td>
                <td style="padding:10px 0;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; font-weight:600; color:#34495e;">Quantité prévue</td>
                <td style="padding:10px 0;">${quantitePrevue ?? 'Non renseignée'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; font-weight:600; color:#34495e;">Quantité reçue</td>
                <td style="padding:10px 0;">${quantiteReelle ?? 'Non réceptionnée'}</td>
              </tr>
              ${difference !== null ? `
              <tr>
                <td style="padding:10px 0; font-weight:600; color:#34495e;">Manquant</td>
                <td style="padding:10px 0; color:${ribbonColor}; font-weight:700;">${difference > 0 ? difference : 0}</td>
              </tr>` : ''}
            </tbody>
          </table>
          <div style="margin-top:20px; padding:16px; border:1px solid ${ribbonColor}; border-radius:8px; background:rgba(231, 76, 60, 0.08);">
            <p style="margin:0; font-size:14px; line-height:1.5;">
              Merci de mettre à jour le suivi de livraison dès réception du matériel ou de contacter le fournisseur pour planifier une nouvelle date.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textLines = [
    `RETARD - ${introText}`,
    `Matériel : ${materielNom}`,
    `Chantier / Stock : ${chantierNom || 'Stock dépôt'}`,
    `Date prévue : ${formattedDate}`,
    `Quantité prévue : ${quantitePrevue ?? 'Non renseignée'}`,
    `Quantité reçue : ${quantiteReelle ?? 'Non réceptionnée'}`,
    `${difference !== null ? `Manquant : ${difference > 0 ? difference : 0}` : ''}`.trim(),
    `${daysLate} jour(s) de retard.`
  ].filter(Boolean);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: DEFAULT_RECIPIENTS.join(','),
    subject,
    text: textLines.join('\n'),
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Notification de retard envoyée pour ${materielNom} (${chantierNom || 'Stock dépôt'})`);
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'alerte de retard :", error);
  }
}

module.exports = { sendLowStockNotification, sendReceptionGapNotification, sendDeliveryDelayNotification };
