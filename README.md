# Chatwoot Botpress Bridge

Small Express bridge that forwards incoming Chatwoot messages to Botpress and sends Botpress responses back to Chatwoot.

## Railway Deploy

This project does not need a build step. `railway.toml` sets the Nixpacks build command to a no-op, and `npm run build` is also available as a no-op fallback.

Required Railway variables:

```env
CHATWOOT_BASE_URL=https://your-chatwoot.example.com
CHATWOOT_ACCOUNT_ID=your_account_id
CHATWOOT_API_TOKEN=your_chatwoot_api_token
BOTPRESS_WEBHOOK_URL=https://webhook.botpress.cloud/your-webhook-id
```

Optional:

```env
BOTPRESS_PAT=optional_botpress_pat
PORT=3000
```

`CHATWOOT_URL` and `CHATWOOT_API_KEY` are also supported as aliases for older deployments.

## Endpoints

- `GET /` - health check
- `POST /chatwoot/webhook` - Chatwoot to Botpress
- `POST /botpress/webhook` - Botpress to Chatwoot
- `POST /botpress/response` - Botpress to Chatwoot response endpoint alias

`GET` and `HEAD` on the Botpress endpoints return `200` so Botpress can validate the response endpoint during registration.

## Local Run

```bash
npm install
npm start
```

Set the environment variables before testing real Chatwoot or Botpress traffic.
