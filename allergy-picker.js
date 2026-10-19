// Allergy dropdown used by the sign-up form and the profile form.
// Tick common allergens, or tick "Others", type an allergy and press Add (once per allergy).
// The result is kept in a hidden input named "allergies" as a list the rest of the app already understands.
const COMMON_ALLERGENS = [
  ["peanuts", "Peanuts"],
  ["tree nuts", "Tree nuts"],
  ["dairy", "Dairy (milk)"],
  ["eggs", "Eggs"],
  ["shellfish", "Shellfish (shrimp, crab, ...)"],
  ["fish", "Fish"],
  ["soy", "Soy"],
  ["gluten", "Gluten (wheat)"],
  ["sesame", "Sesame"],
];

function createAllergyPicker(root) {
  root.innerHTML = `
    <details class="allergy-dropdown">
      <summary>Select allergies</summary>
      <div class="allergy-options">
        ${COMMON_ALLERGENS.map(
          ([value, label]) => `<label class="check"><input type="checkbox" value="${value}"> ${label}</label>`
        ).join("")}
        <label class="check"><input type="checkbox" data-other> Others</label>
        <div class="allergy-other" data-other-area hidden>
          <div class="allergy-add">
            <input type="text" data-other-text placeholder="Type an allergy, e.g. mango" aria-label="Other allergy">
            <button type="button" class="ghost" data-add>Add</button>
          </div>
          <div class="chips" data-chips></div>
        </div>
      </div>
    </details>
    <input type="hidden" name="allergies">`;

  const summary = root.querySelector("summary");
  const boxes = [...root.querySelectorAll("input[type=checkbox]:not([data-other])")];
  const otherBox = root.querySelector("[data-other]");
  const otherArea = root.querySelector("[data-other-area]");
  const otherText = root.querySelector("[data-other-text]");
  const chips = root.querySelector("[data-chips]");
  const hidden = root.querySelector("input[type=hidden]");
  let others = []; // allergies added by hand

  const clean = (text) => text.trim().toLowerCase();

  function get() {
    const picked = boxes.filter((box) => box.checked).map((box) => box.value);
    return [...new Set([...picked, ...(otherBox.checked ? others : [])])];
  }

  function refresh() {
    const list = get();
    otherArea.hidden = !otherBox.checked;
    hidden.value = list.join(", ");
    summary.textContent = list.length ? list.join(", ") : "Select allergies";
    chips.replaceChildren(
      ...others.map((name) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = name + " ";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "chip-remove";
        remove.dataset.remove = name;
        remove.setAttribute("aria-label", `Remove ${name}`);
        remove.textContent = "×";
        chip.append(remove);
        return chip;
      })
    );
  }

  function addOther() {
    const name = clean(otherText.value);
    otherText.value = "";
    otherText.focus();
    if (!name) return;
    const common = boxes.find((box) => box.value === name);
    if (common) common.checked = true; // already in the list above
    else if (!others.includes(name)) others.push(name);
    refresh();
  }

  // Fill the dropdown from a saved list; anything not in the common list becomes an added allergy.
  function set(list) {
    const wanted = list.map(clean).filter(Boolean);
    boxes.forEach((box) => (box.checked = wanted.includes(box.value)));
    others = wanted.filter((item) => !boxes.some((box) => box.value === item));
    otherBox.checked = others.length > 0;
    refresh();
  }

  root.addEventListener("input", refresh);
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-add]")) addOther();
    const remove = e.target.closest("[data-remove]");
    if (remove) {
      others = others.filter((name) => name !== remove.dataset.remove);
      refresh();
    }
  });
  otherText.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter adds the allergy instead of submitting the form
    addOther();
  });
  otherBox.addEventListener("change", () => otherBox.checked && otherText.focus());
  refresh();
  return { get, set };
}
