// models/User.js
const bcrypt = require('bcryptjs');      // ← même lib que le reste du projet
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');   // ajuste le chemin si besoin

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    nom: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },

    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    role: {
      type: DataTypes.ENUM('user', 'admin'),
      defaultValue: 'user',
    },
  },
  {
    tableName: 'users',         // nom physique clair
    timestamps: true,           // createdAt / updatedAt
    hooks: {
      /**
       * Hash automatique – évite d’oublier
       * On ne re-hash pas si le mot de passe n’a pas changé.
       */
      beforeCreate: async (user) => {
        user.password = await bcrypt.hash(user.password, 10);
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
    },
    defaultScope: {
      // on ne sélectionne jamais le hash par défaut
      attributes: { exclude: ['password'] },
    },
    scopes: {
      withPassword: { attributes: {} }, // permet d’inclure le hash quand on en a besoin
    },
  }
);

/* ======================
   Associations
   (à déclarer dans index.js ou juste après tous les imports)
====================== */
// Exemple : User.hasMany(Historique, { foreignKey: 'userId', as: 'historiques' });

module.exports = User;
