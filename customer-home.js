// Customer Home, Favorites and Settings pages.
// Uses db, state, show() from app.js, and esc(), peso(), fetchRestaurants(), restaurants, menuItems,
// conflicts(), selectedDiets, restaurantCardHtml(), openRestaurant() from foods.js.
const el = (id) => document.getElementById(id);

// ---------- Home ----------
async function loadCustomerHome() {
  const firstName = (state.customer?.display_name || "").trim().split(" ")[0];
  el("home-welcome").textContent = firstName ? `Welcome back, ${firstName}!` : "Welcome back!";
  renderHomeExtras();
  if (!db) return;

  const [orders, wallet] = await Promise.all([
    db.from("food_orders").select("total, created_at").order("created_at", { ascending: false }),
    db.rpc("get_wallet"),
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

// Promos, events and ads come from promos.js
function renderHomeExtras() {
  el("home-promos").innerHTML = HOME_PROMOS.map(
    (promo) => `<article class="panel promo-card">
      <span class="chip">${esc(promo.tag)}</span>
      <b>${esc(promo.title)}</b>
      <small>${esc(promo.text)}</small>
      ${promo.go ? `<button class="ghost" data-go="${esc(promo.go)}">${esc(promo.cta)}</button>` : ""}
    </article>`
  ).join("");
  el("home-events").innerHTML = HOME_EVENTS.map(
    (event) => `<li class="panel"><small>${esc(event.when)}</small><b>${esc(event.title)}</b><span>${esc(event.text)}</span></li>`
  ).join("");
  el("home-ads").innerHTML = HOME_ADS.map(
    (ad) => `<article class="panel ad-card">
      <span class="ad-label">Ad</span>
      <b>${esc(ad.title)}</b>
      <small>${esc(ad.text)}</small>
      <a href="${esc(ad.href)}">${esc(ad.cta)}</a>
    </article>`
  ).join("");
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
