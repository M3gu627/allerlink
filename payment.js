// Demo-only payment form. No real payment is made. Nothing typed here is stored or sent anywhere;
// only the payment method name ("card", "gcash" or "maya") is handed to onPaid().
function createPaymentForm(root, { amountLabel, onPaid }) {
  root.innerHTML = `
    <form class="pay-form">
      <p class="pay-demo"><b>Demo payment.</b> No real money is charged. Please do not enter real card details.</p>
      <div class="pay-methods">
        <label class="pay-method"><input type="radio" name="method" value="card" checked> Credit / debit card</label>
        <label class="pay-method"><input type="radio" name="method" value="gcash"> GCash</label>
        <label class="pay-method"><input type="radio" name="method" value="maya"> Maya</label>
      </div>
      <div class="pay-group" data-card>
        <label>Name on card <input name="holder" required autocomplete="off"></label>
        <label>Card number <input name="number" required inputmode="numeric" pattern="[0-9 ]{13,23}" maxlength="23" placeholder="1234 5678 9012 3456" autocomplete="off"></label>
        <div class="pay-row">
          <label>Expiry <input name="expiry" required pattern="(0[1-9]|1[0-2])/[0-9]{2}" maxlength="5" placeholder="MM/YY" autocomplete="off"></label>
          <label>CVV <input name="cvv" required inputmode="numeric" pattern="[0-9]{3,4}" maxlength="4" placeholder="123" autocomplete="off"></label>
        </div>
      </div>
      <div class="pay-group" data-wallet hidden>
        <label>Mobile number <input name="mobile" inputmode="numeric" pattern="09[0-9]{9}" maxlength="11" placeholder="09XXXXXXXXX" autocomplete="off" disabled></label>
      </div>
      <button class="primary" type="submit">Pay ${amountLabel}</button>
    </form>`;

  const form = root.querySelector("form");
  const fields = form.elements;
  const cardGroup = form.querySelector("[data-card]");
  const walletGroup = form.querySelector("[data-wallet]");
  const button = form.querySelector("button[type=submit]");

  // Show only the fields for the chosen method; hidden fields are disabled so they never block the form.
  function syncMethod() {
    const card = fields.method.value === "card";
    cardGroup.hidden = !card;
    walletGroup.hidden = card;
    cardGroup.querySelectorAll("input").forEach((input) => (input.disabled = !card));
    fields.mobile.disabled = card;
    fields.mobile.required = !card;
  }
  form.querySelectorAll("input[name=method]").forEach((radio) => radio.addEventListener("change", syncMethod));

  fields.number.addEventListener("input", () => {
    fields.number.value = fields.number.value.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  });
  fields.expiry.addEventListener("input", () => {
    const digits = fields.expiry.value.replace(/\D/g, "").slice(0, 4);
    fields.expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });

  const expired = (text) => {
    const [month, year] = text.split("/").map(Number);
    return new Date(2000 + year, month, 1) <= new Date(); // a card is good through the end of its month
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const method = fields.method.value;
    if (method === "card" && expired(fields.expiry.value)) return alert("This card has expired.");
    button.disabled = true;
    button.textContent = "Processing payment…";
    await new Promise((resolve) => setTimeout(resolve, 1200)); // pretend to talk to a payment provider
    try {
      await onPaid(method);
    } catch (error) {
      alert(error.message || String(error));
    }
    form.reset(); // never keep what was typed
    syncMethod();
    button.disabled = false;
    button.textContent = `Pay ${amountLabel}`;
  });

  syncMethod();
}
