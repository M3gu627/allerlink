// ---------- Config ----------
// Leave empty to run in demo mode (data stays in this browser's localStorage).
const SUPABASE_URL = "https://nrfcdviqtwqailhescmu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZmNkdmlxdHdxYWlsaGVzY211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDA5OTYsImV4cCI6MjEwNzcxNjk5Nn0.wj0Sy4Bf1svrIT153YmJit2kAlhpy_ewDd1OtioHIiU"; // the public "anon" key, never the service key

const db = SUPABASE_URL ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ---------- Tiny demo store (used only when Supabase is not configured) ----------
const demo = {
  read: (key) => JSON.parse(localStorage.getItem(key) || "[]"),
  push(key, row) { localStorage.setItem(key, JSON.stringify([...this.read(key), row])); },
};

// ---------- Navigation ----------
const state = { customer: null, establishment: null, scanner: null, role: null }; // role: "customer" or "establishment"
let loginKind = "customer"; // which login button was used

const viewHistory = []; // pages visited before the current one, for the Back button
let currentView = "home";
const backButton = document.getElementById("btn-back");

const layout = document.getElementById("layout");
const sideNav = document.getElementById("sidenav");
// Pages that show the dashboard side menu, per account type.
const sideNavViews = {
  customer: ["card", "foods", "wallet", "delivery", "done"],
  establishment: ["partner-home", "partner-products", "partner-sales", "dashboard"],
};
const customerViews = ["card", "foods", "wallet"]; // need a signed-in customer

function show(view, { isBack = false, reset = false } = {}) {
  if (view === "home" && state.role) view = state.role === "customer" ? "card" : "dashboard"; // signed-in users stay in their dashboard
  if (customerViews.includes(view) && !state.customer) {
    setLoginKind("customer"); // signed-out visitors are sent to log in first
    view = "login";
  }
  if (!isBack && view !== currentView) viewHistory.push(currentView);
  if (view === "home" || reset) viewHistory.length = 0; // Home, sign out, and landing pages start a fresh trail
  currentView = view;
  document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== view));
  if (view === "card") {
    fillEditForm();
    render2dCard(state.customer);
    loadHistory();
  }
  if (view === "foods") loadFoods();
  if (view === "wallet") loadWallet();
  if (view === "partner-home") fillPartnerProfile();
  if (view === "partner-products") renderProducts();
  if (view === "partner-sales") renderPartnerSales();

  const showSide = Boolean(sideNavViews[state.role]?.includes(view));
  layout.classList.toggle("with-side", showSide);
  sideNav.hidden = !showSide;
  sideNav.querySelectorAll("[data-role]").forEach((group) => (group.hidden = group.dataset.role !== state.role));
  sideNav.querySelectorAll("[data-go]").forEach((item) => {
    if (item.dataset.go === view) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  backButton.hidden = viewHistory.length === 0 || showSide; // the side menu replaces Back
  if (view === "card") card3d.open(); // after the layout is set, so the viewer has a size
  else card3d.close();
  window.scrollTo(0, 0);
}

backButton.addEventListener("click", () => show(viewHistory.pop(), { isBack: true }));

document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-go]");
  if (!target) return;
  e.preventDefault();
  if (target.dataset.kind) setLoginKind(target.dataset.kind);
  show(target.dataset.go);
});

// The log in page is shared; the entry point decides its wording and sign-up link.
function setLoginKind(kind) {
  loginKind = kind === "admin" ? "admin" : "customer";
  const isAdmin = loginKind === "admin";
  document.getElementById("login-title").textContent = isAdmin ? "Admin log in" : "Customer log in";
  const link = document.getElementById("signup-link");
  link.textContent = isAdmin ? "Partner with AllerLink" : "Sign up";
  link.dataset.go = isAdmin ? "partner" : "privacy";
}

const formData = (form) => Object.fromEntries(new FormData(form));

// ---------- Customer flow ----------
document.getElementById("btn-consent").addEventListener("click", () => {
  if (!document.getElementById("consent-customer").checked) {
    return alert("Please tick the consent box to continue.");
  }
  show("profile");
});

const profileForm = document.getElementById("form-profile");

const ageFrom = (date) => Math.floor((Date.now() - new Date(date)) / (365.25 * 24 * 3600 * 1000));

profileForm.birthday.addEventListener("change", () => (profileForm.age.value = ageFrom(profileForm.birthday.value)));

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseAllergies = (text) => text.split(",").map((a) => a.trim()).filter(Boolean);

function setSignupStatus(status) {
  document.getElementById("signup-loading").hidden = status !== "loading";
  document.getElementById("signup-success").hidden = status !== "success";
}

// Returns an error object, or null when the account was created.
async function createAccount(profile, password) {
  if (!db) {
    demo.push("profiles", profile);
    return null;
  }
  const { data, error } = await db.auth.signUp({ email: profile.email, password });
  if (error) return error;
  const { error: insertError } = await db.from("profiles").insert({ ...profile, id: data.user.id });
  await db.auth.signOut(); // they sign in themselves on the next screen
  return insertError;
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { password, age, allergies, ...rest } = formData(profileForm);
  const profile = {
    ...rest,
    allergies: parseAllergies(allergies),
    qr_token: crypto.randomUUID(), // random ID only: no allergy data goes inside the QR
  };

  show("signup-done", { reset: true });
  setSignupStatus("loading");
  const [error] = await Promise.all([createAccount(profile, password), pause(1200)]);
  if (error) {
    show("profile", { isBack: true });
    return alert(error.message);
  }
  setSignupStatus("success");
});

function renderCard(profile) {
  card3d.setProfile(profile);
}

// Flat copies of the card (front and back), shown under the 3D model.
async function render2dCard(profile) {
  const [front, back] = await Promise.all([drawCardFace(profile), drawCardBack()]);
  document.getElementById("card2d").replaceChildren(front, back);
}

document.getElementById("btn-download").addEventListener("click", async () => {
  const canvas = await drawCardFace(state.customer);
  const link = document.createElement("a");
  link.download = "AllerCard.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

const editForm = document.getElementById("form-edit");
editForm.birthday.addEventListener("change", () => (editForm.age.value = ageFrom(editForm.birthday.value)));

// Profile picture picker
const avatarInput = document.getElementById("avatar-input");
const avatarPreview = document.getElementById("avatar-preview");
const avatarPlaceholder = document.getElementById("avatar-placeholder");

avatarInput?.addEventListener("change", () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
  if (file.size > 2 * 1024 * 1024) return alert("Image must be under 2 MB.");

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    avatarPreview.src = dataUrl;
    avatarPreview.hidden = false;
    avatarPlaceholder.hidden = true;
    // Keep it in state so Save can persist it (base64 for now / demo)
    if (state.customer) state.customer.avatar_url = dataUrl;
  };
  reader.readAsDataURL(file);
});


function fillEditForm() {
  const profile = state.customer;
  // Membership number derived from qr_token (matches the style shown on the card)
  const token = profile.qr_token || profile.id || "";
  const short = token.replace(/-/g, "").slice(0, 8).toUpperCase();
  editForm.membership_no.value = short ? `AP-2026-${short.slice(0, 4)}` : "";

  editForm.display_name.value = profile.display_name || "";
  editForm.gender.value = profile.gender || "";
  editForm.birthday.value = profile.birthday || "";
  editForm.age.value = profile.birthday ? ageFrom(profile.birthday) : "";

  // Locked dates – shown for reference (actual printed dates come from the card renderer)
  const today = new Date();
  const issue = profile.created_at ? new Date(profile.created_at) : today;
  const valid = new Date(issue);
  valid.setMonth(valid.getMonth() + 3); // 3-month AllerPass package
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
  editForm.issue_date.value = fmt(issue);
  editForm.valid_until.value = fmt(valid);

  editForm.allergies.value = (profile.allergies || []).join(", ");
  editForm.emergency_notes.value = profile.emergency_notes ?? "";

  // Avatar
  const preview = document.getElementById("avatar-preview");
  const placeholder = document.getElementById("avatar-placeholder");
  if (profile.avatar_url) {
    preview.src = profile.avatar_url;
    preview.hidden = false;
    placeholder.hidden = true;
  } else {
    preview.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = (profile.display_name || "?").charAt(0).toUpperCase();
  }
}

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formData(editForm);
  // Ignore locked / display-only fields
  const { age, membership_no, issue_date, valid_until, allergies, ...rest } = data;
  const changes = { ...rest, allergies: parseAllergies(allergies) };
  // Keep any locally chosen avatar
  if (state.customer?.avatar_url) changes.avatar_url = state.customer.avatar_url;
  const { error } = await db.from("profiles").update(changes).eq("id", state.customer.id);
  if (error) return alert(error.message);
  state.customer = { ...state.customer, ...changes };
  renderCard(state.customer);
  render2dCard(state.customer);
  alert("Your information was updated.");
});

document.getElementById("form-delivery").addEventListener("submit", async (e) => {
  e.preventDefault();
  const order = { ...formData(e.target), qr_token: state.customer?.qr_token, status: "pending" };
  if (db) {
    const { error } = await db.from("orders").insert(order);
    if (error) return alert(error.message);
  } else {
    demo.push("orders", order);
  }
  show("done");
});

// ---------- Establishment application ----------
document.getElementById("form-partner").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { consent, ...application } = formData(e.target);
  if (db) {
    const { error } = await db.from("applications").insert(application);
    if (error) return alert(error.message);
  } else {
    demo.push("applications", application);
  }
  show("partner-done");
});

// ---------- Sign in (one form for everyone, routed by role) ----------
const signOutButton = document.getElementById("btn-signout");
const setSignedIn = (signedIn) => {
  signOutButton.hidden = !signedIn;
  // Signed-in users only see Sign out up here; everything else is in the side menu.
  document.querySelectorAll("header nav [data-go]").forEach((button) => (button.hidden = signedIn));
};

async function loadEstablishment(userId) {
  // Prefer full row; fall back to active-only if extra columns are missing.
  let { data, error } = await db.from("establishments").select("*").eq("id", userId).maybeSingle();
  if (error) {
    const fallback = await db.from("establishments").select("id, active").eq("id", userId).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return data;
}

async function enterEstablishment(userId) {
  const establishment = await loadEstablishment(userId);
  if (!establishment) return false;
  if (!establishment.active) {
    alert("Your establishment account has not been approved yet.");
    await db.auth.signOut();
    setSignedIn(false);
    return true; // handled
  }
  state.establishment = establishment;
  state.role = "establishment";
  state.customer = null;
  setSignedIn(true);
  show("partner-home", { reset: true });
  updateStats();
  return true;
}

async function enterCustomer(userId) {
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) return false;
  state.customer = profile;
  state.role = "customer";
  state.establishment = null;
  setSignedIn(true);
  renderCard(profile);
  show("card", { reset: true });
  return true;
}

// Restore session on page load so the user stays signed in until they sign out.
async function restoreSession() {
  if (!db) return;
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;
  const userId = session.user.id;
  try {
    if (await enterEstablishment(userId)) return;
    await enterCustomer(userId);
  } catch (err) {
    console.warn(err);
  }
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) {
    // Demo mode: Admin opens partner desk, Customer opens card-style flow.
    if (loginKind === "admin") {
      state.role = "establishment";
      state.establishment = {
        id: "demo",
        active: true,
        business_name: "Demo Café",
        business_type: "Café",
        address: "Bustos, Bulacan",
        contact_person: "Demo Owner",
        email: "demo@partner.test",
        phone: "0917 000 0000",
        notes: "",
      };
      setSignedIn(true);
      return show("partner-home", { reset: true });
    }
    return show("card", { reset: true });
  }
  const { email, password } = formData(e.target);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  const userId = data.user.id;

  try {
    if (loginKind === "admin") {
      const ok = await enterEstablishment(userId);
      if (!ok) {
        await db.auth.signOut();
        setSignedIn(false);
        return alert("No approved business account for this login. Use Admin after your partner application is approved, or create an establishments row with active = true.");
      }
      return;
    }
    // Customer login prefers the guest profile.
    if (await enterCustomer(userId)) return;
    // If they only have a business account, send them there.
    if (await enterEstablishment(userId)) return;
    await db.auth.signOut();
    setSignedIn(false);
    alert("This account has no dashboard yet.");
  } catch (err) {
    alert(err.message || String(err));
  }
});

signOutButton.addEventListener("click", async () => {
  await db?.auth.signOut();
  document.getElementById("result").hidden = true;
  state.role = null;
  state.customer = null;
  state.establishment = null;
  resetCart();
  setSignedIn(false);
  show("home");
});

// ---------- Scanner (inside the establishment dashboard) ----------
async function lookup(token) {
  let profile;
  if (db) {
    // Server-side function checks the staff account is approved, logs the scan, returns minimal data.
    const { data, error } = await db.rpc("scan_card", { card_token: token });
    if (error) return alert("Scan failed: " + error.message);
    profile = data;
  } else {
    profile = demo.read("profiles").find((p) => p.qr_token === token);
    if (profile) demo.push("scans", { token, at: Date.now() });
  }
  if (!profile) return alert("Card not recognised.");
  showResult(profile);
  updateStats();
}

function showResult(profile) {
  document.getElementById("result-name").textContent = profile.display_name;
  document.getElementById("result-allergies").innerHTML =
    profile.allergies.map((a) => `<li>${a.replace(/</g, "&lt;")}</li>`).join("");
  document.getElementById("result").hidden = false;
}

document.getElementById("btn-close").addEventListener("click", () => {
  document.getElementById("result").hidden = true; // access ends with the session
  document.getElementById("result-allergies").innerHTML = "";
});

document.getElementById("btn-scan").addEventListener("click", async () => {
  state.scanner = new Html5Qrcode("reader");
  await state.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, async (text) => {
    await state.scanner.stop();
    lookup(text);
  });
});

document.getElementById("btn-manual").addEventListener("click", () => {
  lookup(document.getElementById("manual-token").value.trim());
});

async function updateStats() {
  let total = 0;
  if (db) {
    const { data } = await db.rpc("scan_count"); // counts only, no allergy details
    total = data ?? 0;
  } else {
    total = demo.read("scans").length;
  }
  document.getElementById("stat-total").textContent = total;
}

updateStats();

restoreSession();


// ---------- Partner desk: profile, products, sales ----------
const partnerStoreKey = (kind) => {
  const id = state.establishment?.id || "demo";
  return `allerlink-partner-${kind}-${id}`;
};
const readPartnerList = (kind) => {
  try { return JSON.parse(localStorage.getItem(partnerStoreKey(kind)) || "[]"); }
  catch { return []; }
};
const writePartnerList = (kind, rows) => localStorage.setItem(partnerStoreKey(kind), JSON.stringify(rows));
const pesoFmt = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function fillPartnerProfile() {
  const est = state.establishment || {};
  const form = document.getElementById("form-partner-profile");
  if (!form) return;
  form.business_name.value = est.business_name || "";
  form.business_type.value = est.business_type || "Restaurant";
  form.address.value = est.address || "";
  form.contact_person.value = est.contact_person || "";
  form.email.value = est.email || "";
  form.phone.value = est.phone || "";
  form.notes.value = est.notes || "";
  document.getElementById("partner-status").textContent = est.active ? "Active" : "Pending";
  document.getElementById("partner-scan-count").textContent =
    document.getElementById("stat-total")?.textContent || "0";
}

document.getElementById("form-partner-profile")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = formData(e.target);
  const msg = document.getElementById("partner-profile-msg");
  state.establishment = { ...(state.establishment || {}), ...payload };
  if (!db || state.establishment.id === "demo") {
    writePartnerList("profile", [state.establishment]);
    msg.textContent = "Profile saved on this device.";
    return;
  }
  const { error } = await db.from("establishments").update(payload).eq("id", state.establishment.id);
  msg.textContent = error
    ? (error.message + " — if columns are missing, run partner-dashboard.sql")
    : "Profile saved.";
});

async function loadProducts() {
  if (db && state.establishment?.id && state.establishment.id !== "demo") {
    const { data, error } = await db
      .from("partner_products")
      .select("*")
      .eq("establishment_id", state.establishment.id)
      .order("id", { ascending: false });
    if (!error && data) return data;
  }
  return readPartnerList("products");
}

async function renderProducts() {
  const list = document.getElementById("product-list");
  if (!list) return;
  const products = await loadProducts();
  list.replaceChildren();
  if (!products.length) {
    list.innerHTML = '<p class="note">No products yet. Add your first dish above.</p>';
    return;
  }
  for (const p of products) {
    const card = document.createElement("article");
    card.className = "panel product-card";
    const allergens = Array.isArray(p.allergens) ? p.allergens.join(", ") : (p.allergens || "");
    card.innerHTML = `
      <div class="product-head">
        <div>
          <strong></strong>
          <p class="meta"></p>
          <p class="meta"></p>
        </div>
        <button type="button" class="ghost danger-btn">Remove</button>
      </div>`;
    card.querySelector("strong").textContent = `${p.name} · ${pesoFmt(p.price)}`;
    card.querySelectorAll(".meta")[0].textContent = p.ingredients ? `Ingredients: ${p.ingredients}` : "No ingredients listed";
    card.querySelectorAll(".meta")[1].textContent = allergens ? `Allergens: ${allergens}` : "Allergens: none listed";
    card.querySelector("button").addEventListener("click", async () => {
      if (!confirm(`Remove “${p.name}”?`)) return;
      if (db && state.establishment?.id && state.establishment.id !== "demo" && p.id && !String(p.id).startsWith("local-")) {
        const { error } = await db.from("partner_products").delete().eq("id", p.id);
        if (error) return alert(error.message);
      } else {
        writePartnerList("products", (await loadProducts()).filter((row) => row.id !== p.id));
      }
      renderProducts();
    });
    list.append(card);
  }
}

document.getElementById("form-product")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  const allergens = String(body.allergens || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const row = {
    name: body.name,
    price: Number(body.price),
    ingredients: body.ingredients || "",
    allergens,
  };
  if (db && state.establishment?.id && state.establishment.id !== "demo") {
    const { error } = await db.from("partner_products").insert({
      ...row,
      establishment_id: state.establishment.id,
    });
    if (error) {
      // Fall back to local if table is missing
      row.id = "local-" + crypto.randomUUID();
      writePartnerList("products", [row, ...readPartnerList("products")]);
      alert(error.message + " — saved on this device for now. Run partner-dashboard.sql to store in Supabase.");
    }
  } else {
    row.id = "local-" + crypto.randomUUID();
    writePartnerList("products", [row, ...readPartnerList("products")]);
  }
  e.target.reset();
  renderProducts();
});

let salesRange = "daily";

function startOfRange(range, now = new Date()) {
  const d = new Date(now);
  if (range === "yearly") { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d; }
  if (range === "monthly") { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadSalesRows() {
  let rows = readPartnerList("sales");
  if (db && state.establishment?.id && state.establishment.id !== "demo") {
    const { data, error } = await db
      .from("partner_sales")
      .select("*")
      .eq("establishment_id", state.establishment.id)
      .order("created_at", { ascending: false });
    if (!error && data) {
      rows = data.map((r) => ({
        id: r.id,
        note: r.note || "Sale",
        amount: Number(r.amount),
        created_at: r.created_at,
      }));
    }
  }
  return rows;
}

async function renderPartnerSales() {
  const rows = await loadSalesRows();
  const from = startOfRange(salesRange).getTime();
  const filtered = rows.filter((r) => new Date(r.created_at || r.at || 0).getTime() >= from);
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  document.getElementById("sales-label").textContent =
    salesRange === "daily" ? "Today" : salesRange === "monthly" ? "This month" : "This year";
  document.getElementById("sales-total").textContent = pesoFmt(total);
  document.getElementById("sales-count").textContent = String(filtered.length);
  document.getElementById("sales-avg").textContent = pesoFmt(filtered.length ? total / filtered.length : 0);
  const body = document.getElementById("sales-rows");
  body.replaceChildren();
  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="3" class="note">No sales in this range yet.</td>';
    body.append(tr);
    return;
  }
  for (const r of filtered) {
    const tr = document.createElement("tr");
    const when = new Date(r.created_at || r.at || Date.now());
    tr.innerHTML = "<td></td><td></td><td></td>";
    tr.children[0].textContent = when.toLocaleString();
    tr.children[1].textContent = r.note || "Sale";
    tr.children[2].textContent = pesoFmt(r.amount);
    body.append(tr);
  }
}

document.getElementById("sales-range")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-range]");
  if (!btn) return;
  salesRange = btn.dataset.range;
  document.querySelectorAll("#sales-range [data-range]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b === btn));
  });
  renderPartnerSales();
});

document.getElementById("form-manual-sale")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  const row = {
    note: body.note,
    amount: Number(body.amount),
    created_at: new Date().toISOString(),
  };
  if (db && state.establishment?.id && state.establishment.id !== "demo") {
    const { error } = await db.from("partner_sales").insert({
      establishment_id: state.establishment.id,
      note: row.note,
      amount: row.amount,
    });
    if (error) {
      row.id = "local-" + crypto.randomUUID();
      writePartnerList("sales", [row, ...readPartnerList("sales")]);
      alert(error.message + " — saved on this device for now. Run partner-dashboard.sql for cloud storage.");
    }
  } else {
    row.id = "local-" + crypto.randomUUID();
    writePartnerList("sales", [row, ...readPartnerList("sales")]);
  }
  e.target.reset();
  renderPartnerSales();
});

