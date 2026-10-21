// AllerFoods (allergy-aware food ordering), the wallet, and the order history.
// Uses db, state, show() and formData() from app.js.
const peso = (n) => "₱" + Number(n).toFixed(2);
const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** @type {Array<{id:string, name:string, price:number, allergens:string[], restaurant:string, logo?:string, source:'partner'|'sample'}>} */
let menuItems = [];
/** @type {Array<{id:string, name:string, logo:string, products:any[]}>} */
let restaurants = [];
let activeRestaurantId = null;
const cart = {}; // item id -> quantity

let pointsBalance = 0; // the customer's points, 1 point = ₱1 off

function resetCart() {
  for (const id in cart) delete cart[id];
  document.getElementById("use-points").checked = false;
  renderCart();
}

// Points to spend on this total: all of them, but never more than the order is worth.
function pointsToUse(total) {
  return document.getElementById("use-points").checked ? Math.min(pointsBalance, Math.floor(total)) : 0;
}

const orderMessage = (data) =>
  `Order placed: ${peso(data.total)}` +
  (data.points_used ? ` (${data.points_used} points used)` : "") +
  `. You earned ${data.points} point${data.points === 1 ? "" : "s"}.`;

// Words of the same type map to one group, so a "shellfish" allergy also blocks shrimp, crab, etc.
const ALLERGEN_ALIASES = {
  shrimp: "shellfish", crab: "shellfish", lobster: "shellfish", prawn: "shellfish",
  clam: "shellfish", mussel: "shellfish", oyster: "shellfish", scallop: "shellfish", squid: "shellfish",
  milk: "dairy", cheese: "dairy", butter: "dairy", cream: "dairy", yogurt: "dairy", whey: "dairy",
  egg: "eggs", wheat: "gluten", flour: "gluten", barley: "gluten", rye: "gluten",
  peanut: "peanuts",
  nuts: "tree nuts", almond: "tree nuts", cashew: "tree nuts", walnut: "tree nuts",
  pecan: "tree nuts", pistachio: "tree nuts", hazelnut: "tree nuts",
  salmon: "fish", tuna: "fish", tilapia: "fish", anchovy: "fish",
  soya: "soy", soybean: "soy", tofu: "soy",
  tahini: "sesame",
};
// Maps a word to its allergen group, ignoring a plural "s" ("shrimps", "peanuts").
function normalize(word) {
  const w = word.trim().toLowerCase();
  return ALLERGEN_ALIASES[w] ?? ALLERGEN_ALIASES[w.replace(/s$/, "")] ?? w;
}

// Checks both the dish's allergen tags and every word in its ingredients against the customer's allergies,
// so a dish listing "shrimp" is caught even if the business forgot to tag it.
// Returns [{ contains, allergy }], for example [{ contains: "shrimp", allergy: "shellfish" }].
function conflicts(item) {
  if (!state.customer?.allergies?.length) return [];
  const mine = state.customer.allergies.map((allergy) => ({ allergy, group: normalize(allergy) }));
  const tags = Array.isArray(item.allergens) ? item.allergens : [];
  const words = String(item.ingredients || "").toLowerCase().split(/[^a-zñé]+/).filter(Boolean);
  const found = new Map();
  for (const word of [...tags, ...words]) {
    const hit = mine.find((m) => m.group === normalize(word));
    if (hit && !found.has(word.toLowerCase())) found.set(word.toLowerCase(), hit.allergy);
  }
  return [...found].map(([contains, allergy]) => ({ contains, allergy }));
}

const warningText = (hits) =>
  hits
    .map(({ contains, allergy }) =>
      contains === allergy.toLowerCase()
        ? `Contains ${contains}, which you're allergic to.`
        : `Contains ${contains}, and you're allergic to ${allergy}.`
    )
    .join(" ");

// ---------- Dietary filter (remembered on this device) ----------
let selectedDiets = [];
try {
  selectedDiets = JSON.parse(localStorage.getItem("allerlink_diets") || "[]").filter((key) => DIET_MATCHES[key]);
} catch (error) {
  selectedDiets = [];
}

const visibleDishes = (rest) => rest.products.filter((item) => dishMatchesDiets(item.diets || [], selectedDiets));

createDietPicker(document.getElementById("diet-filter"), {
  label: "Filter by diet",
  withAll: true,
  selected: selectedDiets,
  note: "Dietary tags are set by each restaurant. Confirm with staff.",
  onChange(list) {
    selectedDiets = list;
    try {
      localStorage.setItem("allerlink_diets", JSON.stringify(selectedDiets));
    } catch (error) {
      // storage unavailable: the filter just will not be remembered
    }
    if (activeRestaurantId) renderRestaurantMenu(activeRestaurantId);
    else renderRestaurantList();
  },
});

function logoHtml(url, name) {
  if (url) {
    return `<img class="rest-logo" src="${esc(url)}" alt="">`;
  }
  const letter = esc((name || "?").charAt(0).toUpperCase());
  return `<div class="rest-logo rest-logo-fallback" aria-hidden="true">${letter}</div>`;
}

// ---------- AllerFoods ----------
async function loadFoods() {
  activeRestaurantId = null;
  restaurants = [];
  menuItems = [];

  // Partner restaurants + their products (preferred)
  const [estRes, prodRes] = await Promise.all([
    db.from("establishments").select("id, business_name, logo_url, active").eq("active", true),
    db.from("partner_products").select("id, establishment_id, name, price, ingredients, allergens, available, image_url, diets").eq("available", true),
  ]);

  if (!estRes.error && !prodRes.error && (estRes.data?.length || 0) > 0) {
    const products = prodRes.data || [];
    restaurants = (estRes.data || [])
      .map((est) => {
        const own = products
          .filter((p) => p.establishment_id === est.id)
          .map((p) => ({
            id: "p-" + p.id,
            rawId: p.id,
            name: p.name,
            price: Number(p.price),
            allergens: Array.isArray(p.allergens) ? p.allergens : [],
            ingredients: p.ingredients || "",
            image: p.image_url || "",
            diets: Array.isArray(p.diets) ? p.diets : [],
            restaurant: est.business_name || "Partner",
            logo: est.logo_url || "",
            source: "partner",
            establishmentId: est.id,
          }));
        return {
          id: est.id,
          name: est.business_name || "Partner restaurant",
          logo: est.logo_url || "",
          products: own,
        };
      })
      .filter((r) => r.products.length > 0);

    menuItems = restaurants.flatMap((r) => r.products);
  }

  // Fallback to sample menu_items if no partner menus yet
  if (!restaurants.length) {
    const { data, error } = await db.from("menu_items").select("id, name, price, allergens, restaurants(name)");
    if (error) return alert(error.message);
    const byRest = new Map();
    for (const item of data || []) {
      const restName = item.restaurants?.name || "Restaurant";
      if (!byRest.has(restName)) {
        byRest.set(restName, {
          id: "sample-" + restName,
          name: restName,
          logo: "",
          products: [],
        });
      }
      const row = {
        id: String(item.id),
        rawId: item.id,
        name: item.name,
        price: Number(item.price),
        allergens: item.allergens || [],
        restaurant: restName,
        logo: "",
        source: "sample",
      };
      byRest.get(restName).products.push(row);
      menuItems.push(row);
    }
    restaurants = [...byRest.values()];
  }

  const { data: wallet } = await db.rpc("get_wallet");
  pointsBalance = wallet?.points ?? 0;
  renderRestaurantList();
  renderCart();
}

function renderRestaurantList() {
  const root = document.getElementById("menu");
  if (!restaurants.length) {
    root.innerHTML = '<p class="note">No partner restaurants have posted products yet.</p>';
    return;
  }
  const shown = restaurants.map((r) => ({ ...r, dishes: visibleDishes(r) })).filter((r) => r.dishes.length);
  if (!shown.length) {
    root.innerHTML = '<p class="note">No dishes match your dietary filter. Restaurants that have not tagged their dishes are hidden while a filter is on.</p>';
    return;
  }
  root.innerHTML =
    '<p class="note" style="margin-top:0">Choose a restaurant to see their menu.</p>' +
    '<div class="rest-grid">' +
    shown
      .map(
        (r) => `<button type="button" class="rest-card" data-open-rest="${esc(r.id)}">
        ${logoHtml(r.logo, r.name)}
        <span class="rest-name">${esc(r.name)}</span>
        <span class="rest-meta">${r.dishes.length} dish${r.dishes.length === 1 ? "" : "es"}</span>
      </button>`
      )
      .join("") +
    "</div>";
}

function renderRestaurantMenu(restId) {
  const rest = restaurants.find((r) => r.id === restId);
  const root = document.getElementById("menu");
  if (!rest) return renderRestaurantList();
  activeRestaurantId = restId;

  const dishes = visibleDishes(rest)
    .map((item) => {
      const blocked = conflicts(item);
      const warning = blocked.length
        ? `<div class="allergy-warning">⚠ Allergy warning: ${esc(warningText(blocked))}</div>`
        : "";
      const contains = item.allergens.length ? "Contains: " + item.allergens.join(", ") : "No listed allergens";
      const ingredients = item.ingredients ? `<br>${esc("Ingredients: " + item.ingredients)}` : "";
      const dietLine = item.diets?.length ? `<br>Diet: ${esc(item.diets.map(dietLabel).join(", "))}` : "";
      const photo = item.image ? `<img class="dish-img" src="${esc(item.image)}" alt="${esc(item.name)}">` : "";
      return `<div class="dish ${blocked.length ? "unsafe" : ""}">
        ${photo}
        <div><b>${esc(item.name)}</b><br>
          <small>${peso(item.price)} · ${esc(contains)}${ingredients}${dietLine}</small>${warning}</div>
        ${
          blocked.length
            ? '<span class="tag">Not safe for you</span>'
            : `<button class="ghost" data-add="${esc(item.id)}">Add</button>`
        }
      </div>`;
    })
    .join("");

  root.innerHTML = `
    <button type="button" class="back-inline" data-back-rest>← All restaurants</button>
    <div class="rest-heading">
      ${logoHtml(rest.logo, rest.name)}
      <div>
        <h3 style="margin:0;color:var(--navy)">${esc(rest.name)}</h3>
        <p class="note" style="margin:0.25rem 0 0">Menu posted by this partner</p>
      </div>
    </div>
    ${dishes || `<p class="note">${selectedDiets.length ? "No dishes here match your dietary filter." : "No dishes listed."}</p>`}`;
}

function renderCart() {
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: menuItems.find((m) => String(m.id) === String(id)), qty }))
    .filter((line) => line.item);
  const total = lines.reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  document.getElementById("cart-lines").innerHTML = lines.length
    ? lines
        .map(
          ({ item, qty }) => `<li class="cart-line">
            <span class="cart-line-info">${esc(item.name)} · ${peso(item.price * qty)}</span>
            <span class="qty-controls">
              <button type="button" class="qty-btn" data-dec="${esc(item.id)}" aria-label="Decrease">−</button>
              <span class="qty-num">${qty}</span>
              <button type="button" class="qty-btn" data-inc="${esc(item.id)}" aria-label="Increase">+</button>
            </span>
          </li>`
        )
        .join("")
    : "<li class=\"note\">Your cart is empty.</li>";
  const used = pointsToUse(total);
  document.getElementById("cart-total").textContent = peso(total);
  document.getElementById("cart-points").textContent = lines.length ? 1 : 0;
  document.getElementById("points-available").textContent = pointsBalance;
  document.getElementById("use-points-row").hidden = pointsBalance === 0;
  document.getElementById("discount-line").hidden = used === 0;
  document.getElementById("cart-discount").textContent = peso(used);
  document.getElementById("cart-pay").textContent = peso(total - used);
}

document.getElementById("menu").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open-rest]");
  if (open) {
    renderRestaurantMenu(open.getAttribute("data-open-rest"));
    return;
  }
  if (e.target.closest("[data-back-rest]")) {
    activeRestaurantId = null;
    renderRestaurantList();
    return;
  }
  const add = e.target.closest("[data-add]");
  if (!add) return;
  const id = add.getAttribute("data-add");
  cart[id] = (cart[id] ?? 0) + 1;
  renderCart();
});

document.getElementById("cart-lines").addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  if (inc) {
    const id = inc.getAttribute("data-inc");
    cart[id] = (cart[id] ?? 0) + 1;
    renderCart();
    return;
  }
  if (dec) {
    const id = dec.getAttribute("data-dec");
    cart[id] = (cart[id] ?? 0) - 1;
    if (!cart[id]) delete cart[id];
    renderCart();
  }
});

document.getElementById("use-points").addEventListener("change", renderCart);

document.getElementById("btn-place-order").addEventListener("click", async () => {
  const ids = Object.keys(cart);
  if (!ids.length) return alert("Your cart is empty.");
  const lines = ids.map((id) => menuItems.find((m) => String(m.id) === String(id))).filter(Boolean);
  if (lines.some((item) => conflicts(item).length)) {
    return alert("Your cart has a dish that conflicts with your allergy profile.");
  }
  const method = document.getElementById("pay-method").value;
  let usePoints = pointsToUse(lines.reduce((sum, item) => sum + item.price * cart[item.id], 0));

  const partnerLines = lines.filter((i) => i.source === "partner");
  const sampleLines = lines.filter((i) => i.source === "sample");

  try {
    if (sampleLines.length) {
      const items = sampleLines.map((i) => ({ id: Number(i.rawId), qty: cart[i.id] }));
      const { data, error } = await db.rpc("place_food_order", { cart: items, method, use_points: usePoints });
      if (error) return alert(error.message);
      for (const i of sampleLines) delete cart[i.id];
      usePoints = 0; // already spent on this order
      if (!partnerLines.length) {
        resetCart();
        alert(orderMessage(data));
        return show("wallet");
      }
    }

    if (partnerLines.length) {
      const items = partnerLines.map((i) => ({ id: Number(i.rawId), qty: cart[i.id] }));
      const { data, error } = await db.rpc("place_partner_food_order", { cart: items, method, use_points: usePoints });
      if (error) {
        // Fallback: still clear UI feedback if function is missing
        return alert(error.message + " — run foods-partner.sql in Supabase to enable partner checkout.");
      }
      resetCart();
      alert(orderMessage(data));
      return show("wallet");
    }

    renderCart();
  } catch (err) {
    alert(err.message || String(err));
  }
});

// ---------- Wallet ----------
async function refreshWallet() {
  const { data: wallet, error } = await db.rpc("get_wallet");
  if (error) return alert(error.message);
  document.getElementById("w-cash").textContent = peso(wallet.cash);
  document.getElementById("w-points").textContent = wallet.points;
}

function loadWallet() {
  refreshWallet();
}

async function loadHistory() {
  const [foods, cards] = await Promise.all([
    db.from("food_orders").select("total, payment_method, created_at, points_used").order("created_at", { ascending: false }),
    db.from("orders").select("status, payment_method"),
  ]);
  const rows = [
    ...(cards.data ?? []).map((o) => `<li>AllerCard order · ${esc(o.status)} · ${esc(o.payment_method ?? "")}</li>`),
    ...(foods.data ?? []).map(
      (o) => `<li>${new Date(o.created_at).toLocaleDateString()} · AllerFoods ·
      ${peso(o.total)}${o.points_used ? ` (${o.points_used} points used)` : ""} · ${esc(o.payment_method)}</li>`
    ),
  ];
  document.getElementById("history").innerHTML = rows.join("") || "<li>No orders yet.</li>";
}

document.getElementById("form-topup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.rpc("top_up_wallet", { amount: Number(formData(e.target).amount) });
  if (error) return alert(error.message);
  e.target.reset();
  refreshWallet();
});
