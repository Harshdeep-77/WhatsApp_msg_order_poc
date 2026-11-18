# WhatsApp Order System (POC)

Receives WhatsApp messages through the Meta WhatsApp Cloud API, stores them in SQLite,
and sends a custom reply. Built with Node.js, Express and better-sqlite3.

```
WhatsApp -> Meta Cloud API -> ngrok -> Express /webhook -> SQLite -> reply via Graph API -> WhatsApp
```

## One-time setup

1. Install dependencies:
   ```
   npm install
   ```
2. Create your env file and fill it in (never commit `.env`):
   ```
   copy .env.example .env
   ```

   | Variable | Value |
   |---|---|
   | `VERIFY_TOKEN` | Any string you invent. Must match the verify token you enter in Meta's webhook settings. |
   | `WHATSAPP_TOKEN` | Access token from Meta: WhatsApp > API Setup. |
   | `PHONE_NUMBER_ID` | Phone number ID (a long number) from the same API Setup page. Not your mobile number. |
   | `APP_SECRET` | Optional. Meta app settings > Basic. Turns on request signature validation. |
   | `GRAPH_VERSION` | Default `v23.0`. |
   | `PORT`, `DB_PATH` | Default `3000` and `./data/app.db`. |

3. Install ngrok, run `ngrok config add-authtoken <your-token>`, and make sure it is version 3.29 or newer
   (`ngrok update`). Older versions are rejected by free accounts.

## Start the server (every session)

Open **two terminals** in the project folder.

**Terminal 1: app server**
```
npm start
```
You should see `Server listening on http://localhost:3000`.

**Terminal 2: public tunnel**
```
ngrok http 3000
```
Copy the `https://....ngrok-free.dev` URL shown as "Forwarding".

**Update Meta if the URL changed.** The free ngrok URL changes every restart.
In Meta: WhatsApp > Configuration > Webhook > Edit:
- Callback URL: `https://<your-ngrok-url>/webhook`
- Verify token: your `VERIFY_TOKEN`
- Click **Verify and save**, then make sure the `messages` field is subscribed.

The server must be running before you click Verify, because Meta calls it immediately.

## Test

1. In Meta WhatsApp > API Setup, add your own number under **"To"** and confirm the code.
2. From your phone, message the Meta test number (the "From" number). Send `Hi`, `menu` or `order`.
3. You should get a reply. Check the stored messages at http://localhost:3000/messages.

If replies stop working after about a day, the temporary access token expired: generate a new one in
API Setup, update `WHATSAPP_TOKEN` in `.env`, and restart the server.

## Stop the server

Press `Ctrl + C` in each terminal.

## Project structure

```
src/server.js    Express app: Meta webhook verification, incoming messages, sending replies
src/db.js        SQLite setup and message helpers (table: messages)
src/replies.js   Keyword reply rules
data/app.db      SQLite database (created automatically, gitignored)
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Meta webhook "Verify and save" fails | Server or ngrok not running, or `VERIFY_TOKEN` does not match. |
| Test button reaches the server, real messages do not | The app is not subscribed to the WhatsApp Business Account (`POST /{waba-id}/subscribed_apps`), or `messages` is not subscribed. |
| Reply fails with `131030` | Recipient number is not in the allowed list in API Setup > "To". |
| Reply fails with `190` / `OAuthException` | Access token expired or invalid. |
| ngrok `ERR_NGROK_121` | ngrok agent too old, run `ngrok update`. |
| Nothing arrives after restarting ngrok | The ngrok URL changed, update the callback URL in Meta. |
