// models/MaterielChantier.js
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');   // ajuste le chemin si besoin

/**
 * Table d’association n-m entre les chantiers et les matériels.
 * Chaque ligne dit : « il y a N exemplaires de tel matériel sur tel chantier ».
 */
const MaterielChantier = sequelize.define(
  'MaterielChantier',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    quantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    quantiteActuelle: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    quantitePrevue1: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    dateLivraisonPrevue1: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    quantitePrevue2: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    dateLivraisonPrevue2: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    quantitePrevue3: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    dateLivraisonPrevue3: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    quantitePrevue4: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    dateLivraisonPrevue4: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    quantitePrevueInitiale: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    quantitePrevueInitiale1: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    quantitePrevueInitiale2: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    quantitePrevueInitiale3: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    quantitePrevueInitiale4: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    quantitePrevue: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    dateLivraisonPrevue: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryReminderSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryReminderFollowUpSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryPopupDismissed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    deliveryPopupDismissed1: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    deliveryPopupDismissed2: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    deliveryPopupDismissed3: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    deliveryPopupDismissed4: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    deliveryPopupSnoozeUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryPopupSnoozeUntil1: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryPopupSnoozeUntil2: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryPopupSnoozeUntil3: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    deliveryPopupSnoozeUntil4: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    lastReceptionAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    bonLivraisonUrls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'bon_livraison_urls',   // map Sequelize -> colonne PG
    },

    remarque: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    qr_code_value: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },

    alertStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'critique',
    },
  },
  {
    tableName: 'materiel_chantiers',
    timestamps: true,    // createdAt / updatedAt
    indexes: [
      { fields: ['barcode'] },
      { unique: true, fields: ['qr_code_value'] },
      { unique: true, fields: ['chantierId', 'materielId'] },
      { fields: ['deliveryReminderSentAt'] },
      { fields: ['deliveryReminderFollowUpSentAt'] },
    ],
  }
);

/* ======================
   Associations (à placer dans le fichier central)
======================

MaterielChantier.belongsTo(Chantier, {
  foreignKey: 'chantierId',
  as: 'chantier',
  onDelete: 'CASCADE',
});

MaterielChantier.belongsTo(Materiel, {
  foreignKey: 'materielId',
  as: 'materiel',
  onDelete: 'CASCADE',
});

Chantier.hasMany(MaterielChantier, {
  foreignKey: 'chantierId',
  as: 'materielChantiers',
});

Materiel.hasMany(MaterielChantier, {
  foreignKey: 'materielId',
  as: 'materielChantiers',
});

*/

MaterielChantier.addHook('afterCreate', async materielChantier => {
  if (!materielChantier.qr_code_value) {
    materielChantier.qr_code_value = `MC_${materielChantier.id}`;
    await materielChantier.save();
  }
});

module.exports = MaterielChantier;
