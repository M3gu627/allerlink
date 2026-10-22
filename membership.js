// Customer membership (the AllerCard purchase), the Member / plan label in the side menu,
// and the limits that come with a business plan.
// Uses db, state, show(), renderCard(), render2dCard(), fillPartnerProfile() from app.js, esc() from foods.js,
// and PLANS, askPlan(), currentPlan() from plans.js.
const byIdM = (id) => document.getElementById(id);
const isMember = () => Boolean(state.customer?.is_member);

// ---------- AllerCard gate: non-members see the offer and a demo payment form ----------
function renderCardAccess() {
  const member = isMember();
  byIdM("card-gate").hidden = member;
  byIdM("card-content").hidden = !member;
  if (member) render2dCard(state.customer);
}

byIdM("card-gate-plan").innerHTML = planCardHtml("allercard");
createPaymentForm(byIdM("card-pay"), {
  amountLabel: planAmount(PLANS.allercard),
  async onPaid(method) {
    if (db) {
      const { error } = await db.rpc("purchase_allercard", { p_method: method });
      if (error) throw error;
    }
    state.customer = { ...state.customer, is_member: true };
    renderCard(state.customer);
    show("card");
    alert("Payment successful (demo). Welcome, member! Your AllerCard is ready.");
  },
});

// ---------- Side menu label: Member / Non-member for customers, the plan for businesses ----------
function updateSideUser() {
  const box = byIdM("side-user");
  const role = state.role;
  if (!role) {
    box.hidden = true;
    return;
  }
  let name, picture, label, tone, link = "";
  if (role === "customer") {
    name = state.customer?.display_name;
    picture = state.customer?.avatar_url;
    label = isMember() ? "Member" : "Non-member";
    tone = isMember() ? "ok" : "off";
    if (!isMember()) link = '<a href="#" data-go="card">Get AllerCard</a>';
  } else if (role === "establishment") {
    name = state.establishment?.business_name;
    picture = state.establishment?.logo_url;
    label = currentPlan().name;
    tone = "ok";
    link = '<a href="#" data-action="change-plan">Change plan</a>';
  } else {
    name = state.employee?.display_name || "Employee";
    picture = state.employee?.avatar_url;
    label = "Employee";
    tone = "ok";
  }
  const avatar = picture ? `<img src="${esc(picture)}" alt="">` : esc((name || "?").charAt(0).toUpperCase());
  box.innerHTML = `<span class="post-avatar">${avatar}</span>
    <div><b>${esc(name || "")}</b><span class="badge ${tone}">${esc(label)}</span>${link}</div>`;
  box.hidden = false;
}

// ---------- Change a business plan (pick, pay in demo, save) ----------
async function changePlan() {
  const current = state.establishment?.plan ?? "starter";
  const choice = await askPlan({ title: "Change your plan", current });
  if (!choice) return;
  if (db) {
    const { error } = await db.rpc("change_business_plan", { p_plan: choice.plan, p_method: choice.method });
    if (error) return alert(error.message);
  }
  state.establishment = { ...state.establishment, plan: choice.plan };
  updateSideUser();
  fillPartnerProfile();
  alert(`You are now on the ${PLANS[choice.plan].name} plan (demo payment).`);
}
document.addEventListener("click", (e) => {
  if (!e.target.closest('[data-action="change-plan"]')) return;
  e.preventDefault();
  changePlan();
});

// ---------- Plan limits for businesses ----------
function showPlanUsage(dishCount) {
  const plan = currentPlan();
  const note = byIdM("plan-usage");
  if (note) note.textContent = `${plan.name}: ${dishCount} of ${limitText(plan.limits.dishes)} dishes used.`;
}

const dishLimitMessage = () =>
  `Your ${currentPlan().name} plan allows up to ${limitText(currentPlan().limits.dishes)} dishes. Change your plan to add more.`;

// Yearly reports are only on Pro and Enterprise; other ranges stay disabled with a hint.
function applySalesPlan() {
  const allowed = currentPlan().limits.salesRanges;
  document.querySelectorAll("#sales-range [data-range]").forEach((button) => {
    const ok = allowed.includes(button.dataset.range);
    button.disabled = !ok;
    button.title = ok ? "" : "Not included in your plan. Change your plan to unlock it.";
  });
  if (!allowed.includes(salesRange)) {
    salesRange = "daily";
    document.querySelectorAll("#sales-range [data-range]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.range === "daily")));
  }
  byIdM("sales-plan-note").hidden = allowed.length === 3;
}
