const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Hello depuis OVH - Application test Node.js');
});

app.listen(port, () => {
  console.log(`Test app is listening on port ${port}`);
});
