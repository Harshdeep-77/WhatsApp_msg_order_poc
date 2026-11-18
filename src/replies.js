// Simple keyword-based reply rules. Swap for a state machine / AI later.
function getReply(text = "") {
  const msg = text.trim().toLowerCase();

  if (/^(hi|hello|hey)\b/.test(msg)) {
    return "Welcome! 👋 Reply MENU to see our options.";
  }
  if (msg === "menu") {
    return "Menu:\n1. Pizza\n2. Burger\n3. Pasta\n\nReply ORDER to place an order.";
  }
  if (msg === "order") {
    return "Great! Please send your order details (item and quantity).";
  }
  if (msg === "pizza") {
    return "your order is confirmed . ";
  }
  return "Sorry, I didn't get that. Reply MENU to see options.";
}

module.exports = { getReply };
