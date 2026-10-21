// Dietary tags a business can put on a dish, and the filter customers use in AllerFoods.
const DIETS = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "pescatarian", label: "Pescatarian" },
  { key: "halal", label: "Halal" },
];

// A stricter tag also satisfies the looser one: vegan dishes are vegetarian and pescatarian too.
const DIET_MATCHES = {
  vegetarian: ["vegetarian", "vegan"],
  pescatarian: ["pescatarian", "vegetarian", "vegan"],
  vegan: ["vegan"],
  halal: ["halal"],
};

const dietLabel = (key) => DIETS.find((diet) => diet.key === key)?.label ?? key;

// True when a dish's tags satisfy every diet the customer picked.
const dishMatchesDiets = (dishDiets, selected) =>
  selected.every((diet) => DIET_MATCHES[diet].some((tag) => dishDiets.includes(tag)));
