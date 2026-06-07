import express, { Request, Response } from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════
//  Config
// ══════════════════════════════════════════════
const CHATWOOT_URL        = 'https://chat.engosoft.com';
const CHATWOOT_API_KEY    = process.env.CHATWOOT_API_KEY    || 'Buvw2SUpLEJPydCEywhdUd8H';
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '2';

// Messaging API webhook من Botpress Integration Hub
const BOTPRESS_WEBHOOK_URL = process.env.BOTPRESS_WEBHOOK_URL
  || 'https://webhook.botpress.cloud/2ea5aae3-c1af-49c5-844e-6396d07c9b6e';

const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════

/** يبعت رسالة لـ Chatwoot كـ bot (outgoing) */
async function sendToChatwoot(conversationId: string, content: string) {
  const url = `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`;
  await axios.post(
    url,
    { content, message_type: 'outgoing', private: false },
    { headers: { api_access_token: CHATWOOT_API_KEY }, timeout: 15000 }
  );
}

/** يبعت رسالة لـ Botpress عبر Messaging API */
async function sendToBotpress(payload: object) {
  await axios.post(BOTPRESS_WEBHOOK_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
}

// ══════════════════════════════════════════════
//  1. Chatwoot → Bridge → Botpress
//     حط الـ URL ده في Chatwoot Agent Bot Webhook
//     مثال: https://your-bridge.railway.app/chatwoot/webhook
// ══════════════════════════════════════════════
app.post('/chatwoot/webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    const msgType     = payload.message_type;
    const content     = payload.content;
    const convId      = payload.conversation?.id;
    const convStatus  = payload.conversation?.status;
    const senderId    = payload.sender?.id;
    const senderName  = payload.sender?.name || '';

    console.log(`[chatwoot→] type=${msgType} conv=${convId} status=${convStatus} content="${content?.substring(0, 60)}"`);

    // فلاتر — نشيل أي حاجة مش رسالة عميل جديدة
    if (msgType !== 'incoming')              return res.json({ status: 'skipped', reason: 'not_incoming' });
    if (!content || !convId)                 return res.json({ status: 'skipped', reason: 'no_content_or_conv' });
    if (convStatus === 'open')               return res.json({ status: 'skipped', reason: 'agent_handling' });

    // بعت لـ Botpress — Messaging API format
    await sendToBotpress({
      type:    'text',
      text:    content,
      userId:  `cw_user_${String(senderId).padStart(10, '0')}`,
      conversationId: `cw_conv_${String(convId).padStart(10, '0')}`,
      // بيانات إضافية يقدر ماجد يستخدمها
      metadata: {
        chatwoot_conversation_id: String(convId),
        chatwoot_sender_id:       String(senderId),
        chatwoot_sender_name:     senderName,
        chatwoot_status:          convStatus,
      }
    });

    console.log(`[chatwoot→botpress] conv=${convId} forwarded ✓`);
    return res.json({ status: 'forwarded' });

  } catch (err: any) {
    console.error('[chatwoot/webhook] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  2. Botpress → Bridge → Chatwoot
//     ده الـ "Response Endpoint URL" اللي تحطه
//     في Botpress Messaging API Integration
//     مثال: https://your-bridge.railway.app/botpress/response
// ══════════════════════════════════════════════
app.post('/botpress/response', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    console.log('[botpress→] raw body:', JSON.stringify(body).substring(0, 200));

    // Messaging API بيبعت payload بالشكل ده
    const responses = body.responses || body.messages || [];

    // استخرج conversation ID من الـ metadata
    // Botpress بيبعت conversationId بالـ format اللي بعتناه
    const rawConvId = body.conversationId
      || body.metadata?.chatwoot_conversation_id
      || '';

    // لو conversationId فيه prefix بتاعنا (cw_conv_) نشيله
    const chatwootConvId = rawConvId.replace(/^cw_conv_0*/, '') || rawConvId;

    if (!chatwootConvId) {
      console.warn('[botpress→] no conversation ID found in payload');
      return res.json({ status: 'skipped', reason: 'no_conversation_id' });
    }

    // ابعت كل رسالة لـ Chatwoot
    for (const msg of responses) {
      const text = msg.text || msg.payload?.text || msg.content || '';
      if (!text) continue;

      await sendToChatwoot(chatwootConvId, text);
      console.log(`[botpress→chatwoot] conv=${chatwootConvId} sent: "${text.substring(0, 60)}" ✓`);
    }

    // لو مفيش responses array — جرب text مباشرة
    if (responses.length === 0) {
      const directText = body.text || body.message || body.content || '';
      if (directText) {
        await sendToChatwoot(chatwootConvId, directText);
        console.log(`[botpress→chatwoot] conv=${chatwootConvId} direct text sent ✓`);
      }
    }

    return res.json({ status: 'delivered' });

  } catch (err: any) {
    console.error('[botpress/response] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  Health check
// ══════════════════════════════════════════════
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'chatwoot-botpress-bridge',
    chatwoot: CHATWOOT_URL,
    account: CHATWOOT_ACCOUNT_ID,
    botpress_webhook: BOTPRESS_WEBHOOK_URL,
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'Chatwoot ↔ Botpress Bridge is running 🚀' });
});

// ══════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🚀 Bridge running on port ${PORT}`);
  console.log(`   Chatwoot webhook : POST /chatwoot/webhook`);
  console.log(`   Botpress response: POST /botpress/response`);
  console.log(`   Health check     : GET  /health\n`);
});
