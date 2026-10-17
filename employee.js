// Employee dashboard: profile, user accounts, business accounts, and business confirmations.
// Uses db, state and formData() from app.js, and esc() and peso() from foods.js.
// Data and actions go through the employee_* functions in employee-dashboard.sql.
const byId = (id) => document.getElementById(id);
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");
const isLive = (row) => row.status === "active" && row.active !== false; // users have no "active" column
const statusBadge = (row) => `<span class="badge ${isLive(row) ? "ok" : "off"}">${isLive(row) ? "Active" : "Inactive"}</span>`;
const detailItem = (label, value) => `<div><small>${label}</small><b>${esc(value ?? "—")}</b></div>`;

// ---------- Profile ----------
function setEmployeeAvatar(url, name) {
  const preview = byId("emp-avatar-preview");
  const placeholder = byId("emp-avatar-placeholder");
  preview.hidden = !url;
  placeholder.hidden = Boolean(url);
  if (url) preview.src = url;
  else placeholder.textContent = (name || "E").charAt(0).toUpperCase();
}

async function fillEmployeeProfile() {
  const form = byId("form-employee");
  const employee = state.employee || {};
  form.employee_no.value = employee.employee_no || "—";
  form.display_name.value = employee.display_name || "";
  form.branch.value = employee.branch || "";
  const { data } = db ? await db.auth.getUser() : { data: null };
  form.email.value = data?.user?.email || employee.email || "";
  setEmployeeAvatar(employee.avatar_url, employee.display_name);
}

byId("emp-avatar-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
  if (file.size > 1024 * 1024) return alert("Image must be under 1 MB.");
  const reader = new FileReader();
  reader.onload = () => {
    state.employee.avatar_url = reader.result; // saved with the Save button
    setEmployeeAvatar(reader.result, state.employee.display_name);
  };
  reader.readAsDataURL(file);
});

byId("form-employee").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { display_name, branch } = formData(e.target);
  const changes = { display_name: display_name.trim(), branch: branch.trim() };
  if (state.employee.avatar_url) changes.avatar_url = state.employee.avatar_url;
  if (db && state.employee.id !== "demo") {
    const { error } = await db.from("employees").update(changes).eq("id", state.employee.id);
    if (error) return alert(error.message);
  }
  state.employee = { ...state.employee, ...changes };
  alert("Profile saved.");
});

// ---------- Suspend / delete (shared by Users and Businesses) ----------
async function toggleAccount(kind, row, reload) {
  const next = isLive(row) ? "suspended" : "active";
  const name = row.display_name || row.business_name;
  if (!confirm(`${next === "suspended" ? "Suspend" : "Reactivate"} ${name}?`)) return;
  const { error } = await db.rpc("employee_set_status", { p_kind: kind, p_id: row.id, p_status: next });
  if (error) return alert(error.message);
  reload();
}

async function removeAccount(kind, row, reload) {
  const name = row.display_name || row.business_name;
  if (!confirm(`Permanently delete ${name} and all of their data? This cannot be undone.`)) return;
  const { error } = await db.rpc("employee_delete_account", { p_kind: kind, p_id: row.id });
  if (error) return alert(error.message);
  reload();
}

const rowActions = (row) => `<td class="row-actions">
  <button class="link" data-act="view" data-id="${row.id}">View</button>
  <button class="link" data-act="toggle" data-id="${row.id}">${isLive(row) ? "Suspend" : "Reactivate"}</button>
  <button class="link danger" data-act="delete" data-id="${row.id}">Delete</button>
</td>`;

function onRowAction(tbodyId, kind, getRows, showDetail, reload) {
  byId(tbodyId).addEventListener("click", (e) => {
    const button = e.target.closest("[data-act]");
    const row = button && getRows().find((r) => r.id === button.dataset.id);
    if (!row) return;
    if (button.dataset.act === "view") showDetail(row);
    if (button.dataset.act === "toggle") toggleAccount(kind, row, reload);
    if (button.dataset.act === "delete") removeAccount(kind, row, reload);
  });
}

function showDetailPanel(id, html) {
  const panel = byId(id);
  panel.innerHTML = html;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Users ----------
let employeeUsers = [];

async function loadEmployeeUsers() {
  if (!db) return;
  const { data, error } = await db.rpc("employee_users");
  if (error) return alert(error.message);
  employeeUsers = data;
  byId("eu-detail").hidden = true;
  renderEmployeeUsers();
}

function renderEmployeeUsers() {
  const search = byId("eu-search").value.trim().toLowerCase();
  const rows = employeeUsers.filter((u) => `${u.display_name} ${u.email}`.toLowerCase().includes(search));
  const active = employeeUsers.filter(isLive).length;
  byId("eu-total").textContent = employeeUsers.length;
  byId("eu-active").textContent = active;
  byId("eu-inactive").textContent = employeeUsers.length - active;
  byId("eu-rows").innerHTML =
    rows
      .map(
        (u) => `<tr>
          <td><b>${esc(u.display_name)}</b><br><small>${esc(u.email)}</small></td>
          <td>${u.points}</td>
          <td>${u.food_orders + u.card_orders}</td>
          <td>${statusBadge(u)}</td>
          ${rowActions(u)}
        </tr>`
      )
      .join("") || '<tr><td colspan="5">No users found.</td></tr>';
}

function showUserDetail(u) {
  const allergies = (u.allergies || []).map((a) => `<span class="chip">${esc(a)}</span>`).join("") || "None listed";
  showDetailPanel(
    "eu-detail",
    `<h3>${esc(u.display_name)}</h3>
     <div class="detail-grid">
       ${detailItem("Email", u.email)}
       ${detailItem("Gender", u.gender)}
       ${detailItem("Birthday", u.birthday)}
       ${detailItem("Joined", fmtDate(u.created_at))}
       ${detailItem("Points", u.points)}
       ${detailItem("Wallet cash", peso(u.cash))}
       ${detailItem("AllerFoods orders", u.food_orders)}
       ${detailItem("AllerCard orders", u.card_orders)}
     </div>
     <p><b>Allergies</b></p><div class="chips">${allergies}</div>
     <p><b>Emergency notes:</b> ${esc(u.emergency_notes || "—")}</p>`
  );
}

byId("eu-search").addEventListener("input", renderEmployeeUsers);
onRowAction("eu-rows", "user", () => employeeUsers, showUserDetail, loadEmployeeUsers);

// ---------- Businesses ----------
let employeeBusinesses = [];

async function loadEmployeeBusinesses() {
  if (!db) return;
  const { data, error } = await db.rpc("employee_businesses");
  if (error) return alert(error.message);
  employeeBusinesses = data;
  byId("eb-detail").hidden = true;
  renderEmployeeBusinesses();
}

function renderEmployeeBusinesses() {
  const search = byId("eb-search").value.trim().toLowerCase();
  const rows = employeeBusinesses.filter((b) =>
    `${b.business_name} ${b.address} ${b.contact_person}`.toLowerCase().includes(search)
  );
  const active = employeeBusinesses.filter(isLive).length;
  byId("eb-total").textContent = employeeBusinesses.length;
  byId("eb-active").textContent = active;
  byId("eb-inactive").textContent = employeeBusinesses.length - active;
  byId("eb-rows").innerHTML =
    rows
      .map(
        (b) => `<tr>
          <td><b>${esc(b.business_name)}</b><br><small>${esc(b.business_type || "—")}</small></td>
          <td>${esc(b.address || "—")}</td>
          <td>${b.products}</td>
          <td>${peso(b.sales_total)}<br><small>${b.sales_count} orders</small></td>
          <td>${statusBadge(b)}</td>
          ${rowActions(b)}
        </tr>`
      )
      .join("") || '<tr><td colspan="6">No businesses found.</td></tr>';
}

function showBusinessDetail(b) {
  showDetailPanel(
    "eb-detail",
    `<h3>${esc(b.business_name)}</h3>
     <div class="detail-grid">
       ${detailItem("Type", b.business_type)}
       ${detailItem("Address", b.address)}
       ${detailItem("Contact person", b.contact_person)}
       ${detailItem("Email", b.email)}
       ${detailItem("Phone", b.phone)}
       ${detailItem("Products", b.products)}
       ${detailItem("Total sales", peso(b.sales_total))}
       ${detailItem("Recorded sales", b.sales_count)}
       ${detailItem("AllerCard scans", b.scans)}
     </div>
     <p><b>Notes:</b> ${esc(b.notes || "—")}</p>`
  );
}

byId("eb-search").addEventListener("input", renderEmployeeBusinesses);
onRowAction("eb-rows", "business", () => employeeBusinesses, showBusinessDetail, loadEmployeeBusinesses);

// ---------- Confirmation (business applications) ----------
let employeeApplications = [];
let applicationFilter = "pending";
const filterLabels = { pending: "Pending", approved: "Approved", rejected: "Rejected", all: "All" };

async function loadEmployeeConfirmations() {
  if (!db) return;
  const { data, error } = await db.rpc("employee_applications");
  if (error) return alert(error.message);
  employeeApplications = data;
  renderApplications();
}

function applicationOutcome(a) {
  if (a.status === "pending") {
    return `<div class="actions">
      <button class="primary" data-act="approve" data-id="${a.id}">Approve</button>
      <button class="ghost danger-btn" data-act="reject" data-id="${a.id}">Reject</button>
    </div>`;
  }
  if (a.status === "rejected") return '<span class="badge off">Rejected</span>';
  return '<span class="badge ok">Approved</span>';
}

function renderApplications() {
  const countOf = (filter) => employeeApplications.filter((a) => filter === "all" || a.status === filter).length;
  document.querySelectorAll("#ec-filter button").forEach((button) => {
    const filter = button.dataset.filter;
    button.setAttribute("aria-pressed", filter === applicationFilter);
    button.textContent = `${filterLabels[filter]} (${countOf(filter)})`;
  });
  const rows = employeeApplications.filter((a) => applicationFilter === "all" || a.status === applicationFilter);
  byId("ec-list").innerHTML =
    rows
      .map(
        (a) => `<div class="panel product-card">
          <div class="product-head">
            <div><b>${esc(a.business_name)}</b><p class="meta">${esc(a.business_type || "—")} · applied ${fmtDate(a.created_at)}</p></div>
          </div>
          <p class="meta">${esc(a.address || "—")}</p>
          <p class="meta">${esc(a.contact_person || "—")} · ${esc(a.email || "—")} · ${esc(a.phone || "—")}</p>
          ${applicationOutcome(a)}
        </div>`
      )
      .join("") || '<p class="note">No applications here.</p>';
}

byId("ec-filter").addEventListener("click", (e) => {
  const button = e.target.closest("[data-filter]");
  if (!button) return;
  applicationFilter = button.dataset.filter;
  renderApplications();
});

byId("ec-list").addEventListener("click", async (e) => {
  const button = e.target.closest("[data-act]");
  const app = button && employeeApplications.find((a) => String(a.id) === button.dataset.id);
  if (!app) return;
  const approve = button.dataset.act === "approve";
  if (!confirm(`${approve ? "Approve" : "Reject"} ${app.business_name}?`)) return;
  const { error } = await db.rpc("employee_review_application", { p_id: app.id, p_approve: approve });
  if (error) return alert(error.message);
  const decision = approve ? "Approved" : "Rejected";
  const mail = await db.functions.invoke("notify-business", { body: { application_id: app.id } });
  alert(mail.error
    ? `${decision}, but the email could not be sent. Please tell ${app.contact_person} (${app.email}) directly.`
    : `${decision}. ${app.contact_person} was notified by email.`);
  loadEmployeeConfirmations();
});
