# Gestion Stock

## Déploiement Render

Dans Render, utilisez la commande de pré-déploiement suivante pour exécuter les migrations Sequelize en production :

```bash
npx sequelize-cli db:migrate --env production --config config/config.js
```

La configuration Sequelize CLI lit `DATABASE_URL` et active SSL pour Postgres (avec `rejectUnauthorized: false` si nécessaire pour Render).
