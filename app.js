const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Test minimaliste Node.js OVH réussi !');
});

app.listen(PORT, () => {
  console.log(`App minimaliste écoute sur ${PORT}`);
});
