// Dietary tags a business can put on a dish, and the dropdown customers use to filter AllerFoods.
// `also` lists stricter tags that satisfy this one, for example a vegan dish is also vegetarian.
const DIETS = [
  { key: "vegetarian", label: "Vegetarian", group: "Lifestyle", also: ["vegan"] },
  { key: "vegan", label: "Vegan", group: "Lifestyle" },
  { key: "pescatarian", label: "Pescatarian", group: "Lifestyle", also: ["vegetarian", "vegan"] },

  { key: "halal", label: "Halal", group: "Religious" },
  { key: "kosher", label: "Kosher", group: "Religious" },

  { key: "gluten-free", label: "Gluten-free", group: "Free from" },
  { key: "dairy-free", label: "Dairy-free", group: "Free from", also: ["vegan"] },
  { key: "lactose-free", label: "Lactose-free", group: "Free from", also: ["dairy-free", "vegan"] },
  { key: "egg-free", label: "Egg-free", group: "Free from", also: ["vegan"] },
  { key: "nut-free", label: "Nut-free", group: "Free from" },
  { key: "peanut-free", label: "Peanut-free", group: "Free from", also: ["nut-free"] },
  { key: "soy-free", label: "Soy-free", group: "Free from" },
  { key: "sesame-free", label: "Sesame-free", group: "Free from" },
  { key: "fish-free", label: "Fish-free", group: "Free from" },
  { key: "shellfish-free", label: "Shellfish-free", group: "Free from" },

  { key: "low-sugar", label: "Low sugar", group: "Nutrition", also: ["sugar-free"] },
  { key: "sugar-free", label: "Sugar-free", group: "Nutrition" },
  { key: "low-carb", label: "Low carb", group: "Nutrition", also: ["keto"] },
  { key: "keto", label: "Keto", group: "Nutrition" },
  { key: "low-fat", label: "Low fat", group: "Nutrition" },
  { key: "low-sodium", label: "Low sodium", group: "Nutrition" },
  { key: "high-protein", label: "High protein", group: "Nutrition" },
  { key: "paleo", label: "Paleo", group: "Nutrition" },
];

// diet key -> every dish tag that satisfies it
const DIET_MATCHES = Object.fromEntries(DIETS.map((diet) => [diet.key, [diet.key, ...(diet.also || [])]]));

const dietLabel = (key) => DIETS.find((diet) => diet.key === key)?.label ?? key;

// True when a dish's tags satisfy every diet the customer picked.
const dishMatchesDiets = (dishDiets, selected) =>
  selected.every((diet) => DIET_MATCHES[diet].some((tag) => dishDiets.includes(tag)));

// A dropdown with a search box and grouped checkboxes; the picked diets show as removable chips.
// Options: label (button text), selected (starting keys), withAll (adds an "All" row that clears the
// filter), note (small text under the search box), onChange(list) (called after every change).
function createDietPicker(root, { label, selected = [], withAll = false, note = "", onChange = () => {} }) {
  let chosen = selected.filter((key) => DIET_MATCHES[key]);
  root.classList.add("diet-picker");
  root.innerHTML = `
    <details class="diet-dropdown">
      <summary></summary>
      <div class="diet-panel">
        <input type="search" class="diet-search" placeholder="Search dietary options" aria-label="Search dietary options">
        ${note ? `<small class="note">${note}</small>` : ""}
        <div class="diet-list"></div>
      </div>
    </details>
    <div class="diet-chips"></div>`;

  const details = root.querySelector("details");
  const summary = root.querySelector("summary");
  const search = root.querySelector(".diet-search");
  const list = root.querySelector(".diet-list");
  const chips = root.querySelector(".diet-chips");

  function renderList() {
    const query = search.value.trim().toLowerCase();
    const matches = DIETS.filter((diet) => !query || diet.label.toLowerCase().includes(query));
    let html = "";
    if (withAll && !query) {
      html += `<label class="check diet-all"><input type="checkbox" data-all ${chosen.length ? "" : "checked"}> <b>All</b> (no filter)</label>`;
    }
    for (const group of [...new Set(matches.map((diet) => diet.group))]) {
      html += `<p class="diet-group">${group}</p>`;
      html += matches
        .filter((diet) => diet.group === group)
        .map(
          (diet) => `<label class="check"><input type="checkbox" data-diet="${diet.key}" ${chosen.includes(diet.key) ? "checked" : ""}> ${diet.label}</label>`
        )
        .join("");
    }
    list.innerHTML = html || '<p class="note">No matching options.</p>';
  }

  function renderSummary() {
    summary.textContent = chosen.length ? `${label} (${chosen.length})` : label;
    chips.innerHTML = chosen
      .map(
        (key) => `<span class="chip">${dietLabel(key)} <button type="button" class="chip-remove" data-remove="${key}" aria-label="Remove ${dietLabel(key)}">×</button></span>`
      )
      .join("");
  }

  function update() {
    renderList();
    renderSummary();
    onChange([...chosen]);
  }

  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-all]")) chosen = [];
    else if (e.target.dataset.diet) {
      const key = e.target.dataset.diet;
      chosen = chosen.includes(key) ? chosen.filter((diet) => diet !== key) : [...chosen, key];
    } else return;
    update();
  });
  root.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove]");
    if (!remove) return;
    chosen = chosen.filter((diet) => diet !== remove.dataset.remove);
    update();
  });
  search.addEventListener("input", renderList);
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) details.open = false; // close when clicking elsewhere
  });

  renderList();
  renderSummary();
  return {
    get: () => [...chosen],
    set(keys) { // fill from saved values without calling onChange
      chosen = keys.filter((key) => DIET_MATCHES[key]);
      renderList();
      renderSummary();
    },
  };
}
