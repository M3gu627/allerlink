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
const state = { customer: null, scanner: null };

function show(view) {
  document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== view));
  window.scrollTo(0, 0);
}

document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-go]");
  if (!target) return;
  e.preventDefault();
  show(target.dataset.go);
});

const formData = (form) => Object.fromEntries(new FormData(form));

// ---------- Customer flow ----------
document.getElementById("btn-consent").addEventListener("click", () => {
  if (!document.getElementById("consent-customer").checked) {
    return alert("Please tick the consent box to continue.");
  }
  show("profile");
});

const profileForm = document.getElementById("form-profile");

profileForm.birthday.addEventListener("change", () => {
  const born = new Date(profileForm.birthday.value);
  profileForm.age.value = Math.floor((Date.now() - born) / (365.25 * 24 * 3600 * 1000));
});

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { password, age, allergies, ...rest } = formData(profileForm);
  const profile = {
    ...rest,
    allergies: allergies.split(",").map((a) => a.trim()).filter(Boolean),
    qr_token: crypto.randomUUID(), // random ID only: no allergy data goes inside the QR
  };

  if (db) {
    const { data, error } = await db.auth.signUp({ email: profile.email, password });
    if (error) return alert(error.message);
    const { error: insertError } = await db.from("profiles").insert({ ...profile, id: data.user.id });
    if (insertError) return alert(insertError.message);
    setSignedIn(true);
  } else {
    demo.push("profiles", profile);
  }

  state.customer = profile;
  renderCard(profile);
  document.getElementById("order-box").hidden = false; // new customers can still order
  show("card");
});

function renderCard(profile) {
  document.getElementById("card-name").textContent = profile.display_name;
  document.getElementById("card-id").textContent = "ID: " + profile.qr_token;
  const qr = document.getElementById("qr");
  qr.innerHTML = "";
  new QRCode(qr, { text: profile.qr_token, width: 120, height: 120 });
}

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
const setSignedIn = (signedIn) => (signOutButton.hidden = !signedIn);

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return show("dashboard"); // demo mode has no accounts
  const { email, password } = formData(e.target);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  setSignedIn(true);
  const userId = data.user.id;

  // Establishment account: open the dashboard (with the scanner) once approved.
  const { data: establishment } = await db.from("establishments").select("active").eq("id", userId).maybeSingle();
  if (establishment) {
    if (!establishment.active) return alert("Your establishment account has not been approved yet.");
    return show("dashboard");
  }

  // Customer account: show their own AllerCard QR again.
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profile) {
    renderCard(profile);
    document.getElementById("order-box").hidden = true; // returning customers only view their QR
    return show("card");
  }
  alert("This account has no dashboard yet.");
});

signOutButton.addEventListener("click", async () => {
  await db?.auth.signOut();
  document.getElementById("result").hidden = true;
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
