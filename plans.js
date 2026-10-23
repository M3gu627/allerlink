// AllerLink prices, offers and plan limits. Edit this list to change the Plans page, the sign-up
// pop-up, the labels and the limits. (The prices are repeated in plans.sql for the payment records.)
const PLANS = {
  allercard: {
    name: "AllerCard", price: 49, period: "one-time", target: "Individual customers / diners",
    description: "A one-time purchase for consumers to store and share their allergy profiles via a physical QR card.",
    features: ["Physical QR card", "Store and share your allergy profile", "One-time payment, no monthly fee"],
  },
  starter: {
    name: "Starter Sub", price: 499, period: "month", target: "Small cafes, coffee shops & kiosks",
    description: "Entry-level subscription providing essential QR-scanning platform access for small-scale food spots.",
    features: ["Essential QR-scanning platform access", "Up to 20 dishes on AllerFoods", "Up to 3 live promos or events", "Sales reports: daily and monthly"],
    limits: { dishes: 20, posts: 3, salesRanges: ["daily", "monthly"] },
  },
  pro: {
    name: "Pro Sub", price: 799, period: "month", target: "Casual restaurants, fast-food outlets & bars",
    description: "Mid-tier plan built for higher customer volumes and faster table-turnover operations.",
    features: ["Everything in Starter", "Built for higher customer volumes", "Up to 100 dishes on AllerFoods", "Up to 10 live promos or events", "Sales reports: daily, monthly and yearly"],
    limits: { dishes: 100, posts: 10, salesRanges: ["daily", "monthly", "yearly"] },
  },
  enterprise: {
    name: "Enterprise", price: 1899, period: "month", target: "Hotel chains, resorts & large franchises",
    description: "Premium top-tier subscription offering multi-branch management and priority support.",
    features: ["Everything in Pro", "Multi-branch management", "Priority support", "Unlimited dishes", "Unlimited live promos or events"],
    limits: { dishes: Infinity, posts: Infinity, salesRanges: ["daily", "monthly", "yearly"] },
  },
};
const BUSINESS_PLANS = ["starter", "pro", "enterprise"];
const COMMISSION_RATE = 5; // percent AllerFoods takes from sales made through the platform

const planAmount = (plan) => `₱${plan.price.toLocaleString("en-US")}`;
const planPrice = (plan) => `${planAmount(plan)}${plan.period === "month" ? " / month" : " one-time"}`;
const planLabel = (key) => (PLANS[key] ? `${PLANS[key].name} (${planPrice(PLANS[key])})` : "—");
const limitText = (number) => (Number.isFinite(number) ? number : "unlimited");

// The signed-in business's plan (older accounts without one count as Starter).
const currentPlan = () => PLANS[state.establishment?.plan] ?? PLANS.starter;

function planCardHtml(key, buttonHtml = "", { highlight = false } = {}) {
  const plan = PLANS[key];
  return `<article class="plan-card plan-${key} ${highlight ? "plan-highlight" : ""}">
    <h4>${plan.name}</h4>
    <p class="plan-target">${plan.target}</p>
    <p class="plan-price"><b>${planAmount(plan)}</b> <span>${plan.period === "month" ? "/ month" : "one-time"}</span></p>
    <p class="plan-desc">${plan.description}</p>
    <ul class="plan-features">${plan.features.map((feature) => `<li>${feature}</li>`).join("")}</ul>
    ${buttonHtml}
  </article>`;
}

// ---------- Plans page ----------
let preferredPlan = null; // the plan picked on the Plans page, highlighted later in the sign-up pop-up

document.getElementById("pricing-diners").innerHTML = planCardHtml(
  "allercard",
  '<button class="primary" data-go="privacy">Sign up to get your AllerCard</button>'
);
document.getElementById("pricing-business").innerHTML = BUSINESS_PLANS.map((key) =>
  planCardHtml(key, `<button class="primary" data-choose-plan="${key}">Apply with this plan</button>`)
).join("");

document.getElementById("pricing-business").addEventListener("click", (e) => {
  const button = e.target.closest("[data-choose-plan]");
  if (!button) return;
  preferredPlan = button.dataset.choosePlan;
  show("partner");
});

// Any element with data-commission shows the commission rate
document.querySelectorAll("[data-commission]").forEach((item) => (item.textContent = `${COMMISSION_RATE}%`));

// Any element with data-plan-price="allercard" shows that plan's price
document.querySelectorAll("[data-plan-price]").forEach((item) => {
  item.textContent = planPrice(PLANS[item.dataset.planPrice]);
});

// ---------- Plan pop-up: choose a plan, then pay (demo) ----------
// Resolves to { plan, method } once paid, or null if the person closes the pop-up.
function askPlan({ title = "Choose your plan", current = null } = {}) {
  const dialog = document.getElementById("plan-dialog");
  const body = document.getElementById("plan-dialog-body");
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
      if (dialog.open) dialog.close();
    };
    dialog.addEventListener("close", () => finish(null), { once: true }); // Esc or the × button

    const chooseStep = () => {
      body.innerHTML = `<h3>${title}</h3>
        <p class="note">Pick the plan that fits your business. Prices are per month, and AllerFoods takes a ${COMMISSION_RATE}% commission on sales made through the platform.</p>
        <div class="plan-grid">${BUSINESS_PLANS.map((key) =>
          planCardHtml(key, `<button class="primary" type="button" data-pick="${key}" ${key === current ? "disabled" : ""}>${key === current ? "Current plan" : "Select"}</button>`, { highlight: key === (current ?? preferredPlan) })
        ).join("")}</div>`;
    };

    const payStep = (key) => {
      body.innerHTML = `<button type="button" class="link" data-back>← Back to plans</button>
        <h3>Payment</h3>
        <p><b>${PLANS[key].name}</b> · ${planPrice(PLANS[key])}</p>
        <div id="plan-pay"></div>`;
      createPaymentForm(body.querySelector("#plan-pay"), {
        amountLabel: planAmount(PLANS[key]),
        onPaid: async (method) => finish({ plan: key, method }),
      });
    };

    body.onclick = (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) payStep(pick.dataset.pick);
      if (e.target.closest("[data-back]")) chooseStep();
    };
    chooseStep();
    dialog.showModal();
  });
}

document.querySelector("#plan-dialog .dialog-close").addEventListener("click", () => document.getElementById("plan-dialog").close());
