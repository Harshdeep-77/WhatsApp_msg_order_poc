require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { saveMessage, listMessages } = require('./db');
const { getReply } = require('./replies');

const {
  PORT = 3000,
  VERIFY_TOKEN,          // any string you choose; must match what you enter in Meta's webhook config
  WHATSAPP_TOKEN,        // access token from Meta
  PHONE_NUMBER_ID,       // WhatsApp phone number ID from Meta
  APP_SECRET,            // optional: enables X-Hub-Signature-256 validation
  GRAPH_VERSION = 'v23.0',
} = process.env;

const app = express();
// Keep the raw body so the Meta signature can be verified.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// 1) Webhook verification handshake (Meta calls this once when you save the webhook URL).
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

function validSignature(req) {
  if (!APP_SECRET) return true; // validation off until APP_SECRET is set
  const sig = req.header('X-Hub-Signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(req.rawBody || '').digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sendText(to, body) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`${resp.status} ${JSON.stringify(data.error || data)}`);
  return data.messages?.[0]?.id;
}

// 2) Incoming messages
app.post('/webhook', async (req, res) => {
  if (!validSignature(req)) return res.sendStatus(403);
  res.sendStatus(200); // acknowledge immediately; Meta retries if we are slow

  const messages = (req.body.entry || [])
    .flatMap((e) => e.changes || [])
    .flatMap((c) => c.value?.messages || []); // status updates have no "messages"

  for (const m of messages) {
    const phone = m.from;
    const body = m.type === 'text' ? m.text.body : `[${m.type} message]`;

    const isNew = saveMessage({ message_sid: m.id, phone, direction: 'IN', body });
    if (!isNew) continue; // duplicate delivery

    const reply = getReply(body);
    try {
      const id = await sendText(phone, reply);
      saveMessage({ message_sid: id, phone, direction: 'OUT', body: reply });
      console.log(`Reply sent ${id} to ${phone}`);
    } catch (err) {
      console.error('Failed to send reply:', err.message);
    }
  }
});

// View stored messages (POC only, remove or protect before production).
app.get('/messages', (req, res) => res.json(listMessages()));
app.get('/', (req, res) => res.send('WhatsApp order system is running'));

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
