// AllerFoods (allergy-aware food ordering), the wallet, and the customer home page.
// Uses db, state, show() and formData() from app.js.
const peso = (n) => "₱" + Number(n).toFixed(2);
const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let menuItems = [];
const cart = {}; // menu item id -> quantity

function resetCart() {
  for (const id in cart) delete cart[id];
  renderCart();
}

// Words a customer might type, mapped to the allergen tags used on the menu.
const ALLERGEN_ALIASES = {
  shrimp: "shellfish", crab: "shellfish", lobster: "shellfish", prawn: "shellfish",
  milk: "dairy", cheese: "dairy", butter: "dairy",
  egg: "eggs", wheat: "gluten", peanut: "peanuts",
  nuts: "tree nuts", almond: "tree nuts", cashew: "tree nuts",
};
const normalize = (word) => ALLERGEN_ALIASES[word.trim().toLowerCase()] ?? word.trim().toLowerCase();

// Which of this dish's allergens match the customer's allergy profile?
function conflicts(item) {
  const mine = state.customer.allergies.map(normalize);
  return item.allergens.filter((tag) => mine.includes(normalize(tag)));
}

// ---------- Customer home ----------
function loadOverview() {
  const profile = state.customer;
  document.getElementById("greeting").textContent = `Good day, ${profile.display_name}!`;
  document.getElementById("ov-allergies").innerHTML =
    profile.allergies.map((a) => `<span class="chip">${esc(a)}</span>`).join("");
  refreshWallet();
}

// ---------- AllerFoods ----------
async function loadFoods() {
  const { data, error } = await db.from("menu_items").select("id, name, price, allergens, restaurants(name)");
  if (error) return alert(error.message);
  menuItems = data;
  document.getElementById("menu").innerHTML = menuItems
    .map((item) => {
      const blocked = conflicts(item);
      const contains = item.allergens.length ? "Contains: " + item.allergens.join(", ") : "No listed allergens";
      return `<div class="dish ${blocked.length ? "unsafe" : ""}">
        <div><b>${esc(item.name)}</b><br>
          <small>${esc(item.restaurants.name)} · ${peso(item.price)}<br>${esc(contains)}</small></div>
        ${blocked.length
          ? '<span class="tag">Not safe for you</span>'
          : `<button class="ghost" data-add="${item.id}">Add</button>`}
      </div>`;
    })
    .join("");
  renderCart();
}

function renderCart() {
  const lines = Object.entries(cart).map(([id, qty]) => ({ item: menuItems.find((m) => m.id == id), qty }));
  const total = lines.reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  document.getElementById("cart-lines").innerHTML =
    lines
      .map(({ item, qty }) => `<li>${qty} × ${esc(item.name)} · ${peso(item.price * qty)}
        <button class="link" data-remove="${item.id}">Remove one</button></li>`)
      .join("") || "<li>Your cart is empty.</li>";
  document.getElementById("cart-total").textContent = peso(total);
  document.getElementById("cart-points").textContent = Math.floor(total / 10);
}

document.getElementById("menu").addEventListener("click", (e) => {
  const id = e.target.dataset.add;
  if (!id) return;
  cart[id] = (cart[id] ?? 0) + 1;
  renderCart();
});

document.getElementById("cart-lines").addEventListener("click", (e) => {
  const id = e.target.dataset.remove;
  if (!id) return;
  cart[id] -= 1;
  if (!cart[id]) delete cart[id];
  renderCart();
});

document.getElementById("btn-place-order").addEventListener("click", async () => {
  const ids = Object.keys(cart);
  if (!ids.length) return alert("Your cart is empty.");
  if (ids.some((id) => conflicts(menuItems.find((m) => m.id == id)).length)) {
    return alert("Your cart has a dish that conflicts with your allergy profile.");
  }
  const items = ids.map((id) => ({ id: Number(id), qty: cart[id] }));
  const method = document.getElementById("pay-method").value;
  const { data, error } = await db.rpc("place_food_order", { cart: items, method });
  if (error) return alert(error.message);
  resetCart();
  alert(`Order placed: ${peso(data.total)}. You earned ${data.points} points.`);
  show("wallet");
});

// ---------- Wallet ----------
async function refreshWallet() {
  const { data: wallet, error } = await db.rpc("get_wallet");
  if (error) return alert(error.message);
  for (const prefix of ["ov", "w"]) {
    document.getElementById(prefix + "-cash").textContent = peso(wallet.cash);
    document.getElementById(prefix + "-points").textContent = wallet.points;
  }
}

async function loadWallet() {
  refreshWallet();
  const { data } = await db
    .from("food_orders")
    .select("total, payment_method, points_earned, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  document.getElementById("w-orders").innerHTML =
    (data ?? [])
      .map((o) => `<li>${new Date(o.created_at).toLocaleDateString()} · ${peso(o.total)} ·
        ${esc(o.payment_method)} · +${o.points_earned} pts</li>`)
      .join("") || "<li>No orders yet.</li>";
}

document.getElementById("form-topup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.rpc("top_up_wallet", { amount: Number(formData(e.target).amount) });
  if (error) return alert(error.message);
  e.target.reset();
  refreshWallet();
});
