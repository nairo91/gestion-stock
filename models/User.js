// models/User.js
const { sequelize, Sequelize } = require('./index');

const User = sequelize.define('User', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    nom: { type: Sequelize.STRING, allowNull: false },
    email: { type: Sequelize.STRING, unique: true, allowNull: false },
    password: { type: Sequelize.STRING, allowNull: false },
    role: { type: Sequelize.STRING, defaultValue: 'user' }
});

module.exports = User;
