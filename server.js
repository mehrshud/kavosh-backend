
const express = require('express');
const app = express();
const { createUser, authenticateUser } = require('./user');

// Middlewares
app.use(express.json());

// User endpoints
app.post('/users', (req, res) => {
  const { username, password } = req.body;
  const user = createUser(username, password);
  res.send(user);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = authenticateUser(username, password);
  if (user) {
    res.send(user);
  } else {
    res.status(401).send('Invalid username or password');
  }
});

// Start server
const port = 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
