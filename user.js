
// User model
class User {
  constructor(id, username, password) {
    this.id = id;
    this.username = username;
    this.password = password;
  }
}

// User authentication functions
const users = {};

function createUser(username, password) {
  const id = Object.keys(users).length + 1;
  const user = new User(id, username, password);
  users[id] = user;
  return user;
}

function authenticateUser(username, password) {
  for (let id in users) {
    if (users[id].username === username && users[id].password === password) {
      return users[id];
    }
  }
  return null;
}

module.exports = { createUser, authenticateUser };

