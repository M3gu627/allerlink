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
const state = { customer: null, scanner: null, role: null }; // role: "customer" or "establishment"

const viewHistory = []; // pages visited before the current one, for the Back button
let currentView = "home";
const backButton = document.getElementById("btn-back");

const layout = document.getElementById("layout");
const sideNav = document.getElementById("sidenav");
// Pages that show the dashboard side menu, per account type.
const sideNavViews = {
  customer: ["card", "foods", "wallet", "delivery", "done"],
  establishment: ["dashboard"],
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
  const isAdmin = kind === "admin";
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

function fillEditForm() {
  const profile = state.customer;
  // Membership number derived from qr_token (matches the style shown on the card)
  const token = profile.qr_token || profile.id || "";
  const short = token.replace(/-/g, "").slice(0, 8).toUpperCase();
  editForm.membership_no.value = short ? `AP-2026-${short.slice(0, 4)}` : "";

  editForm.display_name.value = profile.display_name;
  editForm.birthday.value = profile.birthday;
  editForm.age.value = ageFrom(profile.birthday);

  // Locked dates – shown for reference (actual printed dates come from the card renderer)
  const today = new Date();
  const issue = profile.created_at ? new Date(profile.created_at) : today;
  const valid = new Date(issue);
  valid.setMonth(valid.getMonth() + 3); // 3-month AllerPass package
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
  editForm.issue_date.value = fmt(issue);
  editForm.valid_until.value = fmt(valid);

  editForm.allergies.value = profile.allergies.join(", ");
  editForm.emergency_notes.value = profile.emergency_notes ?? "";
}

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formData(editForm);
  // Ignore locked / display-only fields
  const { age, membership_no, issue_date, valid_until, allergies, ...rest } = data;
  const changes = { ...rest, allergies: parseAllergies(allergies) };
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

// Restore session on page load so the user stays signed in until they sign out.
async function restoreSession() {
  if (!db) return;
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

  setSignedIn(true);
  const userId = session.user.id;

  // Establishment account
  const { data: establishment } = await db.from("establishments").select("active").eq("id", userId).maybeSingle();
  if (establishment) {
    if (!establishment.active) return; // not approved yet
    state.role = "establishment";
    show("dashboard", { reset: true });
    return;
  }

  // Customer account
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profile) {
    state.customer = profile;
    state.role = "customer";
    renderCard(profile);
    show("card", { reset: true });
  }
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return show("dashboard", { reset: true }); // demo mode has no accounts
  const { email, password } = formData(e.target);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  setSignedIn(true);
  const userId = data.user.id;

  // Establishment account: open the dashboard (with the scanner) once approved.
  const { data: establishment } = await db.from("establishments").select("active").eq("id", userId).maybeSingle();
  if (establishment) {
    if (!establishment.active) return alert("Your establishment account has not been approved yet.");
    state.role = "establishment";
    return show("dashboard", { reset: true });
  }

  // Customer account: show their own AllerCard QR again.
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profile) {
    state.customer = profile;
    state.role = "customer";
    renderCard(profile);
    return show("card", { reset: true });
  }
  alert("This account has no dashboard yet.");
});

signOutButton.addEventListener("click", async () => {
  await db?.auth.signOut();
  document.getElementById("result").hidden = true;
  state.role = null;
  state.customer = null;
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
