const express = require("express");
const fs = require("fs");
const path = require("path");

// Minimal .env loader (no extra dependency)
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8")
    .split(/\r?\n/)
    .forEach((l) => {
      const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
} catch {}

const {
  PORT = 3000,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  ADMIN_KEY,
} = process.env;
const COMPANY = "Edquest";
const PRODUCTS = {
  1: "HYD Rack",
  2: "Gear Shift Rail",
  3: "Gear Shift Shaft",
  4: "Inner Shaft",
};

const DB_FILE = path.join(__dirname, "orders.json");
const loadOrders = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return [];
  }
};
const saveOrders = (o) => fs.writeFileSync(DB_FILE, JSON.stringify(o, null, 2));

// In-memory conversation state: phone -> { step, product }
const sessions = new Map();

const MAX_QTY = 100; // max units per order (raw material limit)
const LINE = "━━━━━━━━━━━━━━━━";

async function post(payload) {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    },
  );
  if (!res.ok) console.error("Send failed:", res.status, await res.text());
  return res.ok;
}
const sendText = (to, body) => post({ to, type: "text", text: { body } });
const sendButtons = (to, body, buttons) =>
  post({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map(([id, title]) => ({
          type: "reply",
          reply: { id, title },
        })),
      },
    },
  });

// Product picker: tap-to-select list (customer can also just type 1-4)
const sendProductList = (to, intro) =>
  post({
    to,
    type: "interactive",
    interactive: {
      type: "list",

      body: {
        text: `${intro}

Please choose a product 👇
`,
      },
      action: {
        button: "View Products",
        sections: [
          {
            title: "Our Products",
            rows: Object.entries(PRODUCTS).map(([n, p]) => ({
              id: "p" + n,
              title: `${n}. ${p}`,
            })),
          },
        ],
      },
    },
  });

const welcome = (to) => sendProductList(to, `👋 *Welcome to ${COMPANY}!*`);

const askQty = (to, product) =>
  sendText(
    to,
    `🔧 *${product}*
How many units do you need? (e.g. 100)`,
  );

const askConfirm = (to, product, qty) =>
  sendButtons(
    to,
    `📋 *${product} × ${qty}*
Confirm your order?`,
    [
      ["confirm", "✅ Confirm"],
      ["change", "✏️ Change"],
      ["cancel", "❌ Cancel"],
    ],
  );

const orderPlaced = (to, o) =>
  sendText(
    to,
    `🎉 *Order #${o.id} Placed!*
🔧 ${o.product} × ${o.quantity}

🔔 We'll notify you when production is done.
Thank you! 🙏`,
  );

async function handleMessage(from, input) {
  const msg = input.trim();
  const s = sessions.get(from) || { step: "IDLE" };

  // Greeting always (re)starts the flow
  if (/^(hi+|hello|hey|menu|start)$/i.test(msg)) {
    sessions.set(from, { step: "PRODUCT" });
    return welcome(from);
  }

  if (s.step === "PRODUCT") {
    const n = msg.replace(/^p/i, "");
    if (!PRODUCTS[n])
      return sendProductList(from, "⚠️ Sorry, that isn't a valid option.");
    sessions.set(from, { step: "QTY", product: PRODUCTS[n] });
    return askQty(from, PRODUCTS[n]);
  }

  if (s.step === "QTY") {
    const qty = Number(msg);
    if (!Number.isInteger(qty) || qty <= 0)
      return sendText(
        from,
        "⚠️ Please enter a valid quantity as a whole number, e.g. *50*.",
      );
    if (qty > MAX_QTY)
      return sendText(
        from,
        `⚠️ Sorry, we don't have enough raw material for ${qty} units.\nPlease enter a quantity of ${MAX_QTY} or less.`,
      );
    sessions.set(from, { step: "CONFIRM", product: s.product, qty });
    return askConfirm(from, s.product, qty);
  }

  if (s.step === "CONFIRM") {
    const a = msg.toLowerCase();
    if (a === "confirm" || a === "yes") {
      const orders = loadOrders();
      const order = {
        id: orders.length + 1,
        phone: from,
        product: s.product,
        quantity: s.qty,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      };
      orders.push(order);
      saveOrders(orders);
      sessions.delete(from);
      return orderPlaced(from, order);
    }
    if (a === "change") {
      sessions.set(from, { step: "PRODUCT" });
      return sendProductList(from, "No problem! Let's pick again.");
    }
    if (a === "cancel" || a === "no") {
      sessions.delete(from);
      return sendText(
        from,
        `❌ *Order cancelled.*
No worries! Send *Hi* whenever you want to order again.

— ${COMPANY}`,
      );
    }
    return askConfirm(from, s.product, s.qty);
  }

  return sendText(
    from,
    `👋 Hello from *${COMPANY}*!
Send *Hi* to place an order.`,
  );
}

const app = express();
app.use(express.json());

// Webhook verification (Meta calls this once when you set up the webhook)
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  )
    return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

// Incoming messages
app.post("/webhook", (req, res) => {
  res.sendStatus(200); // ack fast
  try {
    for (const entry of req.body.entry || [])
      for (const ch of entry.changes || [])
        for (const m of ch.value?.messages || []) {
          let t = null;
          if (m.type === "text") t = m.text.body;
          else if (m.type === "interactive")
            t = m.interactive.list_reply?.id || m.interactive.button_reply?.id;
          if (t) handleMessage(m.from, t).catch(console.error);
        }
  } catch (e) {
    console.error(e);
  }
});

// Mark production done and notify customer:  POST /orders/1/complete  (header: x-admin-key)
app.post("/orders/:id/complete", async (req, res) => {
  if (req.get("x-admin-key") !== ADMIN_KEY) return res.sendStatus(401);
  const orders = loadOrders();
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.sendStatus(404);
  order.status = "COMPLETED";
  saveOrders(orders);
  const ok = await sendText(
    order.phone,
    `🏭 *Production Completed!*
${LINE}
🧾 Order No : *#${order.id}*
🔧 Product : ${order.product}
🔢 Quantity : ${order.quantity} units
📌 Status : ✅ Ready
${LINE}
Good news! Your order has finished production. Our team will contact you shortly for dispatch.

Thank you for choosing *${COMPANY}* 🙏`,
  );
  res.json({ order, notified: ok });
});

app.get("/orders", (req, res) => {
  if (req.get("x-admin-key") !== ADMIN_KEY) return res.sendStatus(401);
  res.json(loadOrders());
});

app.listen(PORT, () => console.log(`Listening on :${PORT}`));
