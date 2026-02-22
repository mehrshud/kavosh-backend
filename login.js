
// Import required modules
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Define a function to handle login
async function handleLogin(req, res) {
  try {
    // Get the username and password from the request body
    const { username, password } = req.body;

    // Check if the username and password are provided
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Compare the provided password with the hashed password
    const isValidPassword = await bcrypt.compare(password, hashedPassword);

    // If the password is valid, generate a JWT token
    if (isValidPassword) {
      const token = jwt.sign({ username }, process.env.SECRET_KEY, {
        expiresIn: '1h',
      });

      return res.json({ token });
    } else {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// Define the login route
router.post('/login', handleLogin);

module.exports = router;
