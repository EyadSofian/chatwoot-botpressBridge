# Chatwoot ↔ Botpress Bridge

## URLs بعد الـ Deploy على Railway

| Endpoint | الاستخدام |
|----------|-----------|
| `POST /chatwoot/webhook` | حطه في Chatwoot → Agent Bot Webhook |
| `POST /botpress/response` | حطه في Botpress → Messaging API → Response Endpoint URL |

## خطوات الـ Deploy على Railway

1. ارفع الـ repo على GitHub
2. اعمل New Project على Railway من الـ repo
3. حط الـ Environment Variables:
   - `CHATWOOT_URL` = https://chat.engosoft.com
   - `CHATWOOT_API_KEY` = Buvw2SUpLEJPydCEywhdUd8H
   - `CHATWOOT_ACCOUNT_ID` = 2
   - `BOTPRESS_WEBHOOK_URL` = https://webhook.botpress.cloud/2ea5aae3-c1af-49c5-844e-6396d07c9b6e
4. بعد الـ deploy خد الـ Railway URL

## إعداد Chatwoot

Settings → Integrations → Agent Bots → New Bot:
- Webhook URL: `https://YOUR-RAILWAY-URL/chatwoot/webhook`

ربط الـ Bot بالـ Inbox:
Settings → Inboxes → اختار الـ Inbox → Configuration → Agent Bot

## إعداد Botpress

Integrations → Messaging API → Enable:
- Response Endpoint URL: `https://YOUR-RAILWAY-URL/botpress/response`
