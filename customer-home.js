// Customer Home, Favorites and Settings pages. Promos, events and ads come from the promotions table.
// Uses db, state, show() from app.js, and esc(), peso(), fetchRestaurants(), restaurants, menuItems,
// conflicts(), selectedDiets, restaurantCardHtml(), openRestaurant() from foods.js.
const el = (id) => document.getElementById(id);

// ---------- Home ----------
async function loadCustomerHome() {
  const firstName = (state.customer?.display_name || "").trim().split(" ")[0];
  el("home-welcome").textContent = firstName ? `Welcome back, ${firstName}!` : "Welcome back!";
  if (!db) return;

  const [orders, wallet] = await Promise.all([
    db.from("food_orders").select("total, created_at").order("created_at", { ascending: false }),
    db.rpc("get_wallet"),
    renderPromotions(),
  ]);
  const list = orders.data ?? [];
  const spent = list.reduce((sum, order) => sum + Number(order.total), 0);
  const last = list[0];
  el("home-summary").innerHTML = `
    <div class="stat"><small>Orders placed</small><b>${list.length}</b></div>
    <div class="stat"><small>Total spent</small><b>${peso(spent)}</b></div>
    <div class="stat"><small>Points</small><b>${wallet.data?.points ?? 0}</b></div>
    <div class="stat"><small>Last order</small><b>${last ? new Date(last.created_at).toLocaleDateString() : "—"}</b></div>`;

  await fetchRestaurants();
  renderRecommended();
  renderFavoriteGrid(el("home-favorites"));
}

// Up to 3 dishes that are safe for this customer and match their dietary filter; a new pick each day.
function recommendedDishes(count = 3) {
  const today = new Date().toDateString();
  const hash = (text) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return menuItems
    .filter((item) => !conflicts(item).length && dishMatchesDiets(item.diets || [], selectedDiets))
    .sort((a, b) => hash(a.id + today) - hash(b.id + today))
    .slice(0, count);
}

function renderRecommended() {
  const dishes = recommendedDishes();
  el("home-reco").innerHTML =
    dishes
      .map((item) => {
        const photo = item.image ? `<img class="reco-img" src="${esc(item.image)}" alt="${esc(item.name)}">` : '<div class="reco-img reco-fallback" aria-hidden="true">🍽</div>';
        const restaurantId = item.establishmentId ?? "sample-" + item.restaurant;
        return `<article class="panel reco-card">
          ${photo}
          <b>${esc(item.name)}</b>
          <small>${esc(item.restaurant)} · ${peso(item.price)}</small>
          <small>Checked against your allergy profile</small>
          <button class="ghost" data-open-rest="${esc(restaurantId)}">View menu</button>
        </article>`;
      })
      .join("") || '<p class="note">No safe dishes to recommend yet. Check back when restaurants post their menus.</p>';
}

// ---------- Promos, events and ads (added by employees) ----------
const todayIso = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const formatDay = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const safeLink = (url) => (/^https?:\/\//i.test(url || "") ? url : ""); // only real web links are clickable

function promoDates(promo) {
  if (promo.starts_on && promo.ends_on) return `${formatDay(promo.starts_on)} – ${formatDay(promo.ends_on)}`;
  if (promo.starts_on) return promo.kind === "event" ? formatDay(promo.starts_on) : `From ${formatDay(promo.starts_on)}`;
  if (promo.ends_on) return `Until ${formatDay(promo.ends_on)}`;
  return "";
}

// Live now: switched on, already started (events are shown ahead of time), and not past its last day.
function isPromoLive(promo) {
  const today = todayIso();
  const lastDay = promo.ends_on ?? (promo.kind === "event" ? promo.starts_on : null);
  if (!promo.active || (lastDay && lastDay < today)) return false;
  return promo.kind === "event" || !promo.starts_on || promo.starts_on <= today;
}

async function renderPromotions() {
  const { data } = await db.from("promotions").select("*").order("created_at", { ascending: false });
  const live = (data ?? []).filter(isPromoLive);
  const picture = (promo, cls) => (promo.image_url ? `<img class="${cls}" src="${esc(promo.image_url)}" alt="">` : "");
  const link = (promo) => {
    const href = safeLink(promo.link_url);
    return href ? `<a href="${esc(href)}" target="_blank" rel="noopener">Learn more</a>` : "";
  };
  const dates = (promo) => (promoDates(promo) ? `<small>${esc(promoDates(promo))}</small>` : "");

  const promos = live.filter((p) => p.kind === "promo");
  const events = live.filter((p) => p.kind === "event").sort((a, b) => (a.starts_on || "9").localeCompare(b.starts_on || "9"));
  const ads = live.filter((p) => p.kind === "ad");

  el("home-promos").innerHTML = promos
    .map((p) => `<article class="panel promo-card">${picture(p, "promo-img")}<span class="chip">Promo</span><b>${esc(p.title)}</b><small>${esc(p.details)}</small>${dates(p)}${link(p)}</article>`)
    .join("");
  el("home-events").innerHTML = events
    .map((p) => `<li class="panel">${picture(p, "promo-img")}${dates(p)}<b>${esc(p.title)}</b><span>${esc(p.details)}</span>${link(p)}</li>`)
    .join("");
  el("home-ads").innerHTML = ads
    .map((p) => `<article class="panel ad-card"><span class="ad-label">Ad</span>${picture(p, "promo-img")}<b>${esc(p.title)}</b><small>${esc(p.details)}</small>${link(p)}</article>`)
    .join("");

  el("home-promos-block").hidden = !promos.length;
  el("home-events-block").hidden = !events.length;
  el("home-ads-block").hidden = !ads.length;
}

// ---------- Favorites ----------
function renderFavoriteGrid(container) {
  const favorites = getFavorites();
  const mine = restaurants.filter((r) => favorites.includes(String(r.id)));
  container.innerHTML =
    mine.map((r) => restaurantCardHtml(r, r.products.length)).join("") ||
    '<p class="note">No favorites yet. Tap the heart on a restaurant in Explore Food to save it here.</p>';
}

async function renderFavoritesPage() {
  if (!db) return;
  await fetchRestaurants();
  renderFavoriteGrid(el("favorites-list"));
}

// Home and Favorites share the same clicks: heart toggles, a restaurant opens its menu, a promo button navigates.
function wireRestaurantClicks(container, rerender) {
  container.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      toggleFavorite(fav.dataset.fav);
      rerender();
      return;
    }
    const open = e.target.closest("[data-open-rest]");
    if (open) openRestaurant(open.dataset.openRest);
  });
}
wireRestaurantClicks(el("home-favorites"), () => renderFavoriteGrid(el("home-favorites")));
wireRestaurantClicks(el("favorites-list"), () => renderFavoriteGrid(el("favorites-list")));
wireRestaurantClicks(el("home-reco"), () => {});

// ---------- Settings: change password ----------
el("form-password").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { password, confirm } = formData(e.target);
  if (password !== confirm) return alert("The two passwords do not match.");
  if (!db) return alert("Passwords can only be changed when the site is connected to Supabase.");
  const { error } = await db.auth.updateUser({ password });
  if (error) return alert(error.message);
  e.target.reset();
  alert("Your password was updated.");
});
