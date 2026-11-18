# Onassis Auto Limited – WhatsApp Order System

## What this project is
A WhatsApp chatbot for **Onassis Auto Limited**. Customers message the company's WhatsApp number, pick a product, enter a quantity, and confirm. The order is saved, and when production is finished the customer is notified on WhatsApp. It is being shown to customers as a demo, so message wording and looks matter.

## Tech stack
- Node.js (18+, uses global `fetch`) + Express (only dependency)
- WhatsApp Cloud API (Meta Graph API v20.0) via webhook
- Storage: `orders.json` (flat file, no database). Conversation state is in memory (`sessions` Map), so it resets on server restart.
- Config via `.env` (loaded by a tiny built-in loader in `server.js`; no dotenv). See `.env.example`.

## Files
- `server.js` – everything: webhook, conversation flow, message templates, admin endpoints
- `.env` / `.env.example` – `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`, `ADMIN_KEY`, `PORT`
- `orders.json` – created at runtime; array of orders

## Products (the `PRODUCTS` map in server.js)
1. HYD Rack
2. Gear Shift Rail
3. Gear Shift Shaft
4. Inner Shaft

## Conversation flow
State machine per phone number: `IDLE → PRODUCT → QTY → CONFIRM → (order saved)`
1. "hi / hello / hey / menu / start" (any time) restarts the flow and sends a welcome + product **list message** (tap to select; typing 1-4 also works).
2. Product chosen → bot asks quantity.
3. Quantity must be a positive whole number. Above `MAX_QTY` (100) the bot replies that there isn't enough raw material and stays on the quantity step so the user can retype.
4. Bot shows `Product × Qty` with buttons **Confirm / Change / Cancel**.
   - Confirm → saves order, replies "Order #N Placed… we'll notify you when production is done."
   - Change → back to product list. Cancel → order discarded.
5. Interactive replies arrive as ids (`p1`–`p4`, `confirm`, `change`, `cancel`) and are handled by the same `handleMessage` as typed text.

## Admin endpoints (header `x-admin-key: <ADMIN_KEY>`)
- `POST /orders/:id/complete` – marks order COMPLETED and sends the customer a "Production Completed" message
- `GET /orders` – list all orders
- `GET/POST /webhook` – Meta webhook verification / incoming messages

## Message style rules (user preferences)
- Messages must be **short and clean** – no "Step 1 of 3" labels, no long order-detail blocks, minimal divider lines.
- Use a few emojis; keep text easy for customers to read at a glance.
- The "Production Completed" message is still the longer version and may be shortened later.

## Gotchas
- WhatsApp only allows free-form messages within 24 h of the customer's last message. Notifying later (production usually takes longer) needs an approved **message template** – not implemented yet.
- Error `401 / code 190` on send = invalid/expired `WHATSAPP_TOKEN` (temporary tokens last ~24 h). Use a System User permanent token for demos. Restart the server after editing `.env`.
- Webhook needs a public HTTPS URL (e.g. `ngrok http 3000`), subscribed to the `messages` field.
- Edits to string/template literals in `server.js`: run `node --check server.js` after changes.

## Run
```
npm install
copy .env.example .env   # then fill in values
npm start                # listens on PORT (default 3000)
```

## Possible next steps
- Message template for the production-done notification
- Admin web page with a "Production done" button
- Per-product stock limits instead of one global `MAX_QTY`
- Persist sessions / move orders to a real database
