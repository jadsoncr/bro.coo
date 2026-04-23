// src/api/auth.js
const express = require('express');
const { login } = require('../auth/service');

const router = express.Router();

/**
 * POST /auth/login
 * Body: { email, senha }
 * Returns: { token, user }
 */
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const result = await login(email, senha);
  if (!result) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  return res.json(result);
});

module.exports = router;
