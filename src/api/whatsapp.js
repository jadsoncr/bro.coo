// src/api/whatsapp.js
// WhatsApp webhook receiver + test connection endpoint
const express = require('express');
const { getPrisma } = require('../infra/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { testConnection } = require('../messaging/whatsapp');
const normalize = require('../normalizer');
const { process: processFlow } = require('../flow/engine');
const { buildResponse } = require('../responder');
const sessionManager = require('../sessionManager');
const { sendWhatsApp } = require('../messaging/whatsapp');

const router = express.Router();

/**
 * GET /webhook/whatsapp/:tenantId — Meta verification challenge
 */
router.get('/whatsapp/:tenantId', async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });

    if (!tenant || !tenant.whatsappVerifyToken) {
      return res.sendStatus(403);
    }

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === tenant.whatsappVerifyToken) {
      console.log(`[whatsapp] Webhook verificado para tenant ${tenant.id}`);
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  } catch (err) {
    console.error('[whatsapp] verify error:', err.message);
    return res.sendStatus(500);
  }
});

/**
 * POST /webhook/whatsapp/:tenantId — Receive incoming messages
 */
router.post('/whatsapp/:tenantId', async (req, res) => {
  // WhatsApp requires 200 response quickly
  res.sendStatus(200);

  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });

    if (!tenant || tenant.whatsappStatus === 'nao_configurado') return;

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return; // status update, not a message

    for (const msg of value.messages) {
      if (msg.type !== 'text' || !msg.text?.body) continue;

      const from = msg.from; // phone number E.164
      const text = msg.text.body;
      const sessao = `wa_${from}`;

      // Process through Flow Engine
      const resultado = await processFlow(tenant.id, sessao, text, 'whatsapp');

      if (resultado && resultado.resposta) {
        const resposta = buildResponse(resultado);
        // Send reply via WhatsApp
        if (tenant.whatsappPhoneId && tenant.whatsappToken) {
          await sendWhatsApp(tenant.whatsappPhoneId, tenant.whatsappToken, from, resposta.message).catch(err => {
            console.error(`[whatsapp] send error tenant=${tenant.id}:`, err.message);
          });
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp] webhook error:', err.message);
  }
});

/**
 * POST /owner/tenant/whatsapp/test — Test WhatsApp connection
 * Requires OWNER auth
 */
router.post('/tenant/whatsapp/test', requireAuth, requireRole('OWNER'), async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenantId = req.query.tenantId || req.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (!tenant.whatsappPhoneId || !tenant.whatsappToken) {
      return res.status(400).json({ error: 'Configure Phone ID e Token antes de testar' });
    }

    const result = await testConnection(tenant.whatsappPhoneId, tenant.whatsappToken);

    if (result.ok) {
      // Update status to configurado
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { whatsappStatus: 'configurado' },
      });
    }

    return res.json(result);
  } catch (err) {
    console.error('[whatsapp] test error:', err.message);
    return res.status(500).json({ error: 'Erro ao testar conexão' });
  }
});

/**
 * PATCH /owner/tenant/whatsapp — Save WhatsApp config
 * Requires OWNER auth
 */
router.patch('/tenant/whatsapp', requireAuth, requireRole('OWNER'), async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenantId = req.query.tenantId || req.tenantId;
    const { phoneId, wabaId, token, verifyToken } = req.body;

    const data = {};
    if (phoneId !== undefined) data.whatsappPhoneId = phoneId || null;
    if (wabaId !== undefined) data.whatsappWabaId = wabaId || null;
    if (token !== undefined) data.whatsappToken = token || null;
    if (verifyToken !== undefined) data.whatsappVerifyToken = verifyToken || null;

    // If clearing all fields, reset status
    if (!phoneId && !token) {
      data.whatsappStatus = 'nao_configurado';
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data,
    });

    return res.json({
      whatsappPhoneId: updated.whatsappPhoneId,
      whatsappWabaId: updated.whatsappWabaId,
      whatsappStatus: updated.whatsappStatus,
      whatsappVerifyToken: updated.whatsappVerifyToken,
      hasToken: !!updated.whatsappToken,
    });
  } catch (err) {
    console.error('[whatsapp] config error:', err.message);
    return res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

module.exports = router;
