// src/messaging/whatsapp.js
// WhatsApp Cloud API — send text messages via Meta Business API

const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

/**
 * Send a text message via WhatsApp Cloud API
 * @param {string} phoneId - WhatsApp Phone Number ID
 * @param {string} token - WhatsApp access token
 * @param {string} to - Recipient phone number (E.164 format)
 * @param {string} text - Message text
 * @returns {Promise<object>} API response
 */
async function sendWhatsApp(phoneId, token, to, text) {
  if (!phoneId || !token || !to || !text) {
    throw new Error('phoneId, token, to e text são obrigatórios');
  }

  const url = `${WHATSAPP_API}/${phoneId}/messages`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
      signal: ctrl.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || `WhatsApp API error ${res.status}`;
      throw new Error(errMsg);
    }

    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('WhatsApp API timeout (10s)');
    throw err;
  }
}

/**
 * Test WhatsApp connection by checking phone number status
 */
async function testConnection(phoneId, token) {
  if (!phoneId || !token) {
    throw new Error('phoneId e token são obrigatórios');
  }

  const url = `${WHATSAPP_API}/${phoneId}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `Erro ${res.status}` };
    }

    return {
      ok: true,
      phoneNumber: data.display_phone_number || data.verified_name || phoneId,
      qualityRating: data.quality_rating || null,
    };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendWhatsApp, testConnection };
