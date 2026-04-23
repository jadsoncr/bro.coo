// src/api/register.js
// Public registration endpoint — creates tenant + owner from template
const express = require('express');
const { createTenantFromTemplate } = require('../templates/service');
const { login } = require('../auth/service');

const router = express.Router();

/**
 * POST /auth/register
 * Body: { nome, email, senha, empresa, segmento, moeda }
 * Creates tenant from template + owner user, returns JWT
 */
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, empresa, segmento, moeda } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    // Map segmento to template
    const templateMap = {
      advocacia: 'juridico',
      juridico: 'juridico',
      clinica: 'juridico', // TODO: create clinica template
      imobiliaria: 'juridico', // TODO: create imobiliaria template
    };
    const templateId = templateMap[(segmento || 'advocacia').toLowerCase()] || 'juridico';

    // Create tenant + owner
    const result = await createTenantFromTemplate({
      templateId,
      nome: empresa || `Escritório de ${nome}`,
      ownerEmail: email,
      ownerSenha: senha,
      ownerNome: nome,
      moeda: moeda || 'BRL',
    });

    // Auto-login after registration
    const loginResult = await login(email, senha);
    if (!loginResult) {
      return res.status(500).json({ error: 'Conta criada mas falha no login automático' });
    }

    return res.json({
      ok: true,
      token: loginResult.token,
      user: loginResult.user,
      tenant: { id: result.tenant.id, nome: result.tenant.nome },
    });
  } catch (err) {
    // Handle duplicate email
    if (err.message.includes('Unique constraint')) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    console.error('POST /auth/register error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
