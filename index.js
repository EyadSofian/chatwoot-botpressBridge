const express = require('express');
const axios   = require('axios');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
// Config — كله من environment variables
// ─────────────────────────────────────────────
const CHATWOOT_URL        = process.env.CHATWOOT_URL        || 'https://chat.engosoft.com';
const CHATWOOT_API_KEY    = process.env.CHATWOOT_API_KEY    || 'Buvw2SUpLEJPydCEywhdUd8H';
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '2';

// Botpress Messaging API webhook (من الصورة)
const BOTPRESS_WEBHOOK_URL = process.env.BOTPRESS_WEBHOOK_URL
  || 'https://webhook.botpress.cloud/2ea5aae3-c1af-49c5-844e-6396d07c9b6e';

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Chatwoot ↔ Botpress Bridge running ✅' });
});

// ─────────────────────────────────────────────
// 1. Chatwoot → Bridge → Botpress
//    حط URL ده في Chatwoot Agent Bot Webhook
// ─────────────────────────────────────────────
app.post('/chatwoot/webhook', async (req, res) => {
  try {
    const payload = req.body;

    console.log(`[CW→BP] event=${payload.event} type=${payload.message_type} conv=${payload.conversation?.id}`);

    // فلتر: بس الرسائل الجاية من العميل
    if (payload.message_type !== 'incoming') {
      return res.json({ status: 'skipped', reason: 'not_incoming' });
    }

    if (!payload.content || !payload.conversation?.id) {
      return res.json({ status: 'skipped', reason: 'no_content_or_conv' });
    }

    // لو agent بيشتغل (status=open) — البوت ميردش
    if (payload.conversation.status === 'open') {
      console.log('[CW→BP] Skipping — human agent is handling');
      return res.json({ status: 'skipped', reason: 'agent_active' });
    }

    const convId  = String(payload.conversation.id);
    const userId  = String(payload.sender?.id || 'unknown');
    const userName = payload.sender?.name || 'Visitor';

    // الـ payload اللي هيروح لـ Botpress Messaging API
    const botpressPayload = {
      type:    'text',
      text:    payload.content,
      userId:  `cw_user_${userId.padStart(20, '0')}`,
      conversationId: `cw_conv_${convId.padStart(20, '0')}`,
      // بيانات إضافية يقدر ماجد يشوفها
      metadata: {
        chatwootConvId:  convId,
        chatwootUserId:  userId,
        senderName:      userName,
        convStatus:      payload.conversation.status,
        inboxId:         payload.inbox?.id,
      }
    };

    await axios.post(BOTPRESS_WEBHOOK_URL, botpressPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    console.log(`[CW→BP] Forwarded conv=${convId} to Botpress ✅`);
    res.json({ status: 'forwarded' });

  } catch (err) {
    console.error('[CW→BP] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 2. Botpress → Bridge → Chatwoot
//    حط URL ده في Botpress Messaging API → Response Endpoint URL
//    URL: https://YOUR-RAILWAY-URL/botpress/response
// ─────────────────────────────────────────────
app.post('/botpress/response', async (req, res) => {
  try {
    const body = req.body;
    console.log('[BP→CW] Received from Botpress:', JSON.stringify(body).substring(0, 200));

    // Botpress Messaging API بيبعت الرد بالشكل ده
    const text = body.text
      || body.payload?.text
      || body.message?.payload?.text
      || body.content
      || null;

    // استخرج conversation ID الأصلي من metadata أو من الـ conversationId
    let chatwootConvId = body.metadata?.chatwootConvId
      || body.chatwootConvId
      || null;

    // لو مجاش في metadata، استخرجه من conversationId اللي احنا بعتناه
    if (!chatwootConvId && body.conversationId) {
      // كنا بنبعت: cw_conv_00000000000000000042
      const match = String(body.conversationId).match(/cw_conv_0*(\d+)/);
      if (match) chatwootConvId = match[1];
    }

    if (!text) {
      console.log('[BP→CW] No text in response, skipping');
      return res.json({ status: 'skipped', reason: 'no_text' });
    }

    if (!chatwootConvId) {
      console.error('[BP→CW] Cannot find chatwoot conversation ID');
      console.error('[BP→CW] Full body:', JSON.stringify(body));
      return res.status(400).json({ error: 'missing chatwootConvId' });
    }

    // ابعت الرد لـ Chatwoot
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${chatwootConvId}/messages`,
      {
        content:      text,
        message_type: 'outgoing',
        private:      false,
      },
      {
        headers: { 'api_access_token': CHATWOOT_API_KEY },
        timeout: 15000,
      }
    );

    console.log(`[BP→CW] Sent reply to Chatwoot conv=${chatwootConvId} ✅`);
    res.json({ status: 'sent' });

  } catch (err) {
    console.error('[BP→CW] Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║  Chatwoot ↔ Botpress Bridge                  ║
║  Port: ${PORT}                                   ║
╠══════════════════════════════════════════════╣
║  POST /chatwoot/webhook  ← من Chatwoot       ║
║  POST /botpress/response ← من Botpress       ║
╚══════════════════════════════════════════════╝
  `);
});
