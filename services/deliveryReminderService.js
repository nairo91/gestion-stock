const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const cron = require('node-cron');
const { Op, col } = require('sequelize');

const { MaterielChantier, Materiel, Chantier } = require('../models');
const { sendDeliveryDelayNotification } = require('../utils/mailer');

dayjs.extend(utc);
dayjs.extend(timezone);

const REMINDER_TIMEZONE = process.env.DELIVERY_REMINDER_TZ || 'Europe/Paris';
const DEFAULT_CRON_EXPRESSION = process.env.DELIVERY_REMINDER_CRON || '0 17 * * *';

function isShortage(record) {
  if (record.quantitePrevue == null) {
    return false;
  }

  if (record.quantite == null) {
    return true;
  }

  const currentQuantity = Number(record.quantite);
  const expectedQuantity = Number(record.quantitePrevue);
  if (Number.isNaN(currentQuantity) || Number.isNaN(expectedQuantity)) {
    return false;
  }

  return currentQuantity < expectedQuantity;
}

async function fetchOverdueRecords(now) {
  return MaterielChantier.findAll({
    where: {
      dateLivraisonPrevue: {
        [Op.lt]: now,
        [Op.ne]: null,
      },
      quantitePrevue: {
        [Op.ne]: null,
        [Op.gt]: 0,
      },
      [Op.or]: [
        { quantite: { [Op.eq]: null } },
        { quantite: { [Op.lt]: col('quantitePrevue') } },
      ],
    },
    include: [
      { model: Materiel, as: 'materiel' },
      { model: Chantier, as: 'chantier' },
    ],
  });
}

async function handleRecord(record, now) {
  if (!isShortage(record)) {
    return;
  }

  const firstReminderSent = !!record.deliveryReminderSentAt;
  const followUpSent = !!record.deliveryReminderFollowUpSentAt;

  if (!firstReminderSent) {
    await sendReminder(record, now, false);
    record.deliveryReminderSentAt = now;
    await record.save();
    return;
  }

  if (followUpSent) {
    return;
  }

  const hoursSinceFirstReminder = dayjs(now).diff(dayjs(record.deliveryReminderSentAt), 'hour');
  if (hoursSinceFirstReminder < 48) {
    return;
  }

  await sendReminder(record, now, true);
  record.deliveryReminderFollowUpSentAt = now;
  await record.save();
}

async function sendReminder(record, now, isFollowUp) {
  const materielNom = record.materiel ? record.materiel.nom : 'Matériel non référencé';
  const chantierNom = record.chantier ? record.chantier.nom : null;
  const quantitePrevue = record.quantitePrevue != null ? Number(record.quantitePrevue) : null;
  const quantiteReelle = record.quantite != null ? Number(record.quantite) : null;
  const daysLate = Math.max(dayjs(now).diff(dayjs(record.dateLivraisonPrevue), 'day'), 1);

  await sendDeliveryDelayNotification({
    materielNom,
    chantierNom,
    quantitePrevue,
    quantiteReelle,
    datePrevue: record.dateLivraisonPrevue,
    daysLate,
    isFollowUp,
  });
}

async function runDailyCheck(now = new Date()) {
  try {
    const overdueRecords = await fetchOverdueRecords(now);
    for (const record of overdueRecords) {
      await handleRecord(record, now);
    }
  } catch (error) {
    console.error('Erreur lors de la vérification des retards de livraison :', error);
  }
}

function scheduleDeliveryReminderJob() {
  const task = cron.schedule(
    DEFAULT_CRON_EXPRESSION,
    async () => {
      await runDailyCheck(new Date());
    },
    { timezone: REMINDER_TIMEZONE },
  );

  task.start();
  return task;
}

module.exports = {
  scheduleDeliveryReminderJob,
  runDailyCheck,
};
