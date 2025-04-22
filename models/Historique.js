// models/Historique.js
const { sequelize, Sequelize } = require('./index');

const Historique = sequelize.define('Historique', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    materielId: {
        type: Sequelize.INTEGER,
        allowNull: true, // Permettre null après suppression
        references: {
            model: 'Materiels',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    oldQuantite: {
        type: Sequelize.INTEGER
    },
    newQuantite: {
        type: Sequelize.INTEGER
    },
    userId: {
        type: Sequelize.INTEGER
    },
    // Champ pour distinguer la nature de l’opération (UPDATE, DELETE, CREATE, etc.)
    action: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'UPDATE'
    },
    // Champ pour conserver le nom du matériel au moment de l’opération
    materielNom: {
        type: Sequelize.STRING
    },
    // Nouveau champ pour le type de stock ("depot" ou "chantier")
    stockType: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'depot'
    }
}, {
    timestamps: true
});

module.exports = Historique;

// Association Historique ↔ User
const User = require('./User');
Historique.belongsTo(User, { foreignKey: 'userId', as: 'user' });
