const jwt = require('jsonwebtoken');

/**
 * Generate a signed JWT token containing the user's ID
 * @param {string} id - MongoDB ObjectId as string
 * @returns {string} - Signed JWT
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

module.exports = generateToken;
