// AllerLink prices and offers. Edit this list to change the Plans page, the business sign-up form
// and the plan names shown on the business profile and in the employee screens.
const PLANS = {
  allercard: {
    name: "AllerCard", price: 49, period: "one-time", target: "Individual customers / diners",
    description: "A one-time purchase for consumers to store and share their allergy profiles via a physical QR card.",
  },
  starter: {
    name: "Starter Sub", price: 499, period: "month", target: "Small cafes, coffee shops & kiosks",
    description: "Entry-level subscription providing essential QR-scanning platform access for small-scale food spots.",
  },
  pro: {
    name: "Pro Sub", price: 799, period: "month", target: "Casual restaurants, fast-food outlets & bars",
    description: "Mid-tier plan built for higher customer volumes and faster table-turnover operations.",
  },
  enterprise: {
    name: "Enterprise", price: 1899, period: "month", target: "Hotel chains, resorts & large franchises",
    description: "Premium top-tier subscription offering multi-branch management and priority support.",
  },
};
const BUSINESS_PLANS = ["starter", "pro", "enterprise"];

const planPrice = (plan) => `₱${plan.price.toLocaleString("en-US")}${plan.period === "month" ? " / month" : " one-time"}`;
const planLabel = (key) => (PLANS[key] ? `${PLANS[key].name} (${planPrice(PLANS[key])})` : "—");

function planCardHtml(key, buttonHtml) {
  const plan = PLANS[key];
  return `<article class="panel plan-card">
    <h4>${plan.name}</h4>
    <p class="plan-price"><b>₱${plan.price.toLocaleString("en-US")}</b> <span>${plan.period === "month" ? "/ month" : "one-time"}</span></p>
    <p><small>Best for</small><br>${plan.target}</p>
    <p class="note">${plan.description}</p>
    ${buttonHtml}
  </article>`;
}

// Plans page
document.getElementById("pricing-diners").innerHTML = planCardHtml(
  "allercard",
  '<button class="primary" data-go="privacy">Sign up to get your AllerCard</button>'
);
document.getElementById("pricing-business").innerHTML = BUSINESS_PLANS.map((key) =>
  planCardHtml(key, `<button class="primary" data-choose-plan="${key}">Apply with this plan</button>`)
).join("");

// "Apply with this plan" opens the business application with that plan already ticked.
document.getElementById("pricing-business").addEventListener("click", (e) => {
  const button = e.target.closest("[data-choose-plan]");
  if (!button) return;
  show("partner");
  const radio = document.querySelector(`#plan-options input[value="${button.dataset.choosePlan}"]`);
  if (radio) radio.checked = true;
});

// Plan choice on the business application form
document.getElementById("plan-options").innerHTML = BUSINESS_PLANS.map((key) => {
  const plan = PLANS[key];
  return `<label class="plan-option">
    <input type="radio" name="plan" value="${key}" required>
    <span><b>${plan.name}</b> · ${planPrice(plan)}<small>${plan.target}</small></span>
  </label>`;
}).join("");

// Any element with data-plan-price="allercard" shows that plan's price
document.querySelectorAll("[data-plan-price]").forEach((item) => {
  item.textContent = planPrice(PLANS[item.dataset.planPrice]);
});
