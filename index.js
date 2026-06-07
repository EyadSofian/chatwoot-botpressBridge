const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const config = {
  chatwootBaseUrl: (process.env.CHATWOOT_BASE_URL || process.env.CHATWOOT_URL || '').replace(/\/$/, ''),
  chatwootAccountId: process.env.CHATWOOT_ACCOUNT_ID || '',
  chatwootApiToken: process.env.CHATWOOT_API_TOKEN || process.env.CHATWOOT_API_KEY || '',
  botpressWebhookUrl: process.env.BOTPRESS_WEBHOOK_URL || '',
  botpressPat: process.env.BOTPRESS_PAT || '',
};

function requireConfig(requiredKeys) {
  const missing = requiredKeys.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables for: ${missing.join(', ')}`);
  }
}

function botpressHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (config.botpressPat) {
    headers.Authorization = `Bearer ${config.botpressPat}`;
  }
  return headers;
}

function extractChatwootConversationId(body) {
  const candidates = [
    body.metadata?.chatwootConvId,
    body.metadata?.chatwoot_conversation_id,
    body.chatwootConvId,
    body.chatwoot_conversation_id,
    body.conversationId,
    body.botpressConversationId,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate);
    const match = value.match(/(?:chatwoot-conv-|cw_conv_0*)(\d+)/);
    if (match) return match[1];
    if (/^\d+$/.test(value)) return value;
  }

  return null;
}

function extractBotpressTexts(body) {
  const items = [];
  if (Array.isArray(body.responses)) items.push(...body.responses);
  if (Array.isArray(body.messages)) items.push(...body.messages);
  items.push(body);

  return items
    .map((item) => item.text || item.payload?.text || item.message?.payload?.text || item.content)
    .filter((text) => typeof text === 'string' && text.trim().length > 0);
}

app.get('/', (_req, res) => {
  res.json({
    status: 'running',
    endpoints: {
      chatwoot: '/chatwoot/webhook',
      botpressWebhook: '/botpress/webhook',
      botpressResponse: '/botpress/response',
    },
  });
});

app.post('/chatwoot/webhook', async (req, res) => {
  try {
    requireConfig(['botpressWebhookUrl']);

    const payload = req.body;
    console.log('Chatwoot webhook:', payload.message_type, payload.content?.substring(0, 50));

    if (payload.message_type !== 'incoming') {
      return res.status(200).json({ status: 'skipped', reason: 'not_incoming' });
    }

    if (!payload.content || !payload.conversation?.id) {
      return res.status(200).json({ status: 'skipped', reason: 'missing_content_or_conversation' });
    }

    const chatwootConvId = String(payload.conversation.id);
    const chatwootUserId = String(payload.sender?.id || 'unknown');
    const messageId = String(payload.id || Date.now());

    await axios.post(
      config.botpressWebhookUrl,
      {
        userId: `chatwoot-user-${chatwootUserId}`,
        messageId: `msg-${messageId}`,
        conversationId: `chatwoot-conv-${chatwootConvId}`,
        type: 'text',
        text: payload.content,
        payload: {
          type: 'text',
          text: payload.content,
        },
        metadata: {
          chatwootConvId,
          chatwootUserId,
          senderName: payload.sender?.name || '',
        },
      },
      {
        headers: botpressHeaders(),
        timeout: 30000,
      }
    );

    console.log('Sent to Botpress');
    return res.status(200).json({ status: 'sent' });
  } catch (error) {
    console.error('Chatwoot webhook error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

async function handleBotpressResponse(req, res) {
  try {
    requireConfig(['chatwootBaseUrl', 'chatwootAccountId', 'chatwootApiToken']);

    const payload = req.body;
    const chatwootConvId = extractChatwootConversationId(payload);
    const texts = extractBotpressTexts(payload);

    if (!chatwootConvId) {
      return res.status(400).json({ error: 'missing chatwoot conversation id' });
    }

    if (texts.length === 0) {
      return res.status(200).json({ status: 'skipped', reason: 'no_text' });
    }

    for (const text of texts) {
      await axios.post(
        `${config.chatwootBaseUrl}/api/v1/accounts/${config.chatwootAccountId}/conversations/${chatwootConvId}/messages`,
        {
          content: text,
          message_type: 'outgoing',
          private: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            api_access_token: config.chatwootApiToken,
          },
          timeout: 15000,
        }
      );
    }

    console.log(`Sent ${texts.length} Botpress response(s) to Chatwoot conversation ${chatwootConvId}`);
    return res.status(200).json({ status: 'sent', count: texts.length });
  } catch (error) {
    console.error('Botpress response error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
}

app.post('/botpress/webhook', handleBotpressResponse);
app.post('/botpress/response', handleBotpressResponse);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const missing = [];
  if (!config.botpressWebhookUrl) missing.push('BOTPRESS_WEBHOOK_URL');
  if (!config.chatwootBaseUrl) missing.push('CHATWOOT_BASE_URL or CHATWOOT_URL');
  if (!config.chatwootAccountId) missing.push('CHATWOOT_ACCOUNT_ID');
  if (!config.chatwootApiToken) missing.push('CHATWOOT_API_TOKEN or CHATWOOT_API_KEY');

  console.log(`Bridge server running on port ${PORT}`);
  if (missing.length > 0) {
    console.warn(`Missing configuration: ${missing.join(', ')}`);
  }
});
