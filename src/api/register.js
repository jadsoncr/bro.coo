// src/api/register.js
// Public registration + setup endpoint
const express = require('express');
const { createTenantFromTemplate } = require('../templates/service');
const { login } = require('../auth/service');

const router = express.Router();

/**
 * POST /auth/register
 * Simple registration — uses template defaults
 */
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, empresa, segmento, moeda } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    const templateMap = { advocacia: 'juridico', juridico: 'juridico', clinica: 'juridico', imobiliaria: 'juridico' };
    const templateId = templateMap[(segmento || 'advocacia').toLowerCase()] || 'juridico';

    const result = await createTenantFromTemplate({
      templateId,
      nome: empresa || `Escritório de ${nome}`,
      ownerEmail: email,
      ownerSenha: senha,
      ownerNome: nome,
      moeda: moeda || 'BRL',
    });

    const loginResult = await login(email, senha);
    if (!loginResult) return res.status(500).json({ error: 'Conta criada mas falha no login automático' });

    return res.json({ ok: true, token: loginResult.token, user: loginResult.user, tenant: { id: result.tenant.id, nome: result.tenant.nome } });
  } catch (err) {
    if (err.message.includes('Unique constraint')) return res.status(400).json({ error: 'Email já cadastrado' });
    console.error('POST /auth/register error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /auth/setup
 * Full setup with merge engine — TEMPLATE + VARIABLES = CUSTOM FLOW
 * 
 * Body: {
 *   companyName, businessType, segments: [{nome, valorMin, valorMax, ticketMedio}],
 *   slaMinutes, slaContratoHoras, moeda,
 *   owner: {nome, email, senha}
 * }
 */
router.post('/setup', async (req, res) => {
  try {
    const { companyName, businessType, segments, slaMinutes, slaContratoHoras, moeda, owner } = req.body;

    if (!owner?.nome || !owner?.email || !owner?.senha) {
      return res.status(400).json({ error: 'owner.nome, owner.email e owner.senha são obrigatórios' });
    }
    if (!companyName) {
      return res.status(400).json({ error: 'companyName é obrigatório' });
    }

    // Map businessType to template
    const templateMap = { legal: 'juridico', advocacia: 'juridico', clinica: 'juridico', imobiliaria: 'juridico' };
    const templateId = templateMap[(businessType || 'legal').toLowerCase()] || 'juridico';

    // Create tenant with merge engine
    const result = await createTenantFromTemplate({
      templateId,
      nome: companyName,
      ownerEmail: owner.email,
      ownerSenha: owner.senha,
      ownerNome: owner.nome,
      moeda: moeda || 'BRL',
      segments: segments || [],
      slaMinutes: slaMinutes || undefined,
      slaContratoHoras: slaContratoHoras || undefined,
    });

    // Auto-login
    const loginResult = await login(owner.email, owner.senha);
    if (!loginResult) return res.status(500).json({ error: 'Conta criada mas falha no login automático' });

    return res.json({
      ok: true,
      token: loginResult.token,
      user: loginResult.user,
      tenant: { id: result.tenant.id, nome: result.tenant.nome },
      flow: { id: result.flow.id },
    });
  } catch (err) {
    if (err.message.includes('Unique constraint')) return res.status(400).json({ error: 'Email já cadastrado' });
    console.error('POST /auth/setup error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
