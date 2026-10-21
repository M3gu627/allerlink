// Employee "Promotions" page: add, edit, hide and delete the promos, events and ads shown on customer Home.
// Uses db, formData() and resizeImage() from app.js, esc() from foods.js, byId() from employee.js,
// and promoDates() and todayIso() from customer-home.js.
const PROMO_BUCKET = "promo-images";
const PROMO_KINDS = { promo: "Promo", event: "Event", ad: "Ad" };

let promoRows = [];
let editingPromo = null; // the promotion being edited, or null when adding a new one
let promoImageUrl = ""; // picture already saved with the promotion
let promoImageBlob = null; // new picture chosen in this form

const promoForm = byId("form-promo");
const promoPreview = byId("promo-image-preview");
const promoPreviewWrap = byId("promo-image-wrap");
const promoImageInput = byId("promo-image-input");

function setPromoPicture(src) {
  promoPreview.src = src;
  promoPreviewWrap.hidden = !src;
}

function clearPromoPicture() {
  promoImageUrl = "";
  promoImageBlob = null;
  promoImageInput.value = "";
  setPromoPicture("");
}

promoImageInput.addEventListener("change", async () => {
  const file = promoImageInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    promoImageInput.value = "";
    return alert("Please choose an image file.");
  }
  const dataUrl = await resizeImage(file, 1200); // keeps the upload well under 2 MB
  promoImageBlob = await (await fetch(dataUrl)).blob();
  setPromoPicture(dataUrl);
});

byId("promo-image-remove").addEventListener("click", clearPromoPicture);

function resetPromoForm() {
  editingPromo = null;
  promoForm.reset();
  clearPromoPicture();
  byId("promo-form-heading").textContent = "Add promotion";
  byId("promo-submit").textContent = "Add promotion";
  byId("promo-cancel").hidden = true;
}

function startEditPromo(promo) {
  editingPromo = promo;
  const fields = promoForm.elements;
  fields.kind.value = promo.kind;
  fields.title.value = promo.title;
  fields.details.value = promo.details;
  fields.starts_on.value = promo.starts_on || "";
  fields.ends_on.value = promo.ends_on || "";
  fields.link_url.value = promo.link_url || "";
  fields.active.checked = promo.active;
  promoImageInput.value = "";
  promoImageBlob = null;
  promoImageUrl = promo.image_url || ""; // the current picture stays unless it is replaced or removed
  setPromoPicture(promoImageUrl);
  byId("promo-form-heading").textContent = "Edit promotion";
  byId("promo-submit").textContent = "Save changes";
  byId("promo-cancel").hidden = false;
  promoForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

byId("promo-cancel").addEventListener("click", resetPromoForm);

async function removePromoImage(url) {
  const name = url?.split(`/${PROMO_BUCKET}/`)[1];
  if (name) await db.storage.from(PROMO_BUCKET).remove([name]);
}

promoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fields = promoForm.elements;
  const link = fields.link_url.value.trim();
  if (link && !/^https?:\/\//i.test(link)) return alert("The link must start with http:// or https://");
  if (fields.starts_on.value && fields.ends_on.value && fields.ends_on.value < fields.starts_on.value) {
    return alert("The end date cannot be before the start date.");
  }
  const row = {
    kind: fields.kind.value,
    title: fields.title.value.trim(),
    details: fields.details.value.trim(),
    starts_on: fields.starts_on.value || null,
    ends_on: fields.ends_on.value || null,
    link_url: link || null,
    active: fields.active.checked,
    image_url: promoImageUrl || null,
  };
  if (promoImageBlob) {
    const path = `${Date.now()}.jpg`;
    const { error: uploadError } = await db.storage.from(PROMO_BUCKET).upload(path, promoImageBlob, { contentType: "image/jpeg" });
    if (uploadError) return alert("The picture could not be uploaded: " + uploadError.message);
    row.image_url = db.storage.from(PROMO_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const request = editingPromo
    ? db.from("promotions").update(row).eq("id", editingPromo.id)
    : db.from("promotions").insert(row);
  const { error } = await request;
  if (error) return alert(error.message);
  if (editingPromo?.image_url && editingPromo.image_url !== row.image_url) await removePromoImage(editingPromo.image_url);
  resetPromoForm();
  loadEmployeePromos();
});

// ---------- List ----------
async function loadEmployeePromos() {
  if (!db) return;
  const { data, error } = await db.from("promotions").select("*").order("created_at", { ascending: false });
  if (error) return alert(error.message + " — run promotions.sql in Supabase first.");
  promoRows = data;
  renderPromoList();
}

function promoStatus(promo) {
  const lastDay = promo.ends_on ?? (promo.kind === "event" ? promo.starts_on : null);
  if (lastDay && lastDay < todayIso()) return ["Expired", "off"];
  return promo.active ? ["Live", "ok"] : ["Hidden", "off"];
}

function renderPromoList() {
  byId("promo-list").innerHTML =
    promoRows
      .map((promo) => {
        const [label, tone] = promoStatus(promo);
        const dates = promoDates(promo);
        return `<div class="panel product-card">
          <div class="product-head">
            ${promo.image_url ? `<img class="promo-thumb" src="${esc(promo.image_url)}" alt="">` : ""}
            <div class="product-text">
              <b>${esc(promo.title)}</b>
              <span class="chip">${PROMO_KINDS[promo.kind]}</span>
              <span class="badge ${tone}">${label}</span>
              <p class="meta">${esc(promo.details)}</p>
              ${dates ? `<p class="meta">${esc(dates)}</p>` : ""}
              ${promo.link_url ? `<p class="meta">Link: ${esc(promo.link_url)}</p>` : ""}
            </div>
            <div class="product-actions">
              <button class="ghost" data-act="edit" data-id="${promo.id}">Edit</button>
              <button class="ghost" data-act="toggle" data-id="${promo.id}">${promo.active ? "Hide" : "Show"}</button>
              <button class="ghost danger-btn" data-act="delete" data-id="${promo.id}">Delete</button>
            </div>
          </div>
        </div>`;
      })
      .join("") || '<p class="note">No promotions yet. Add your first one above.</p>';
}

byId("promo-list").addEventListener("click", async (e) => {
  const button = e.target.closest("[data-act]");
  const promo = button && promoRows.find((row) => String(row.id) === button.dataset.id);
  if (!promo) return;
  if (button.dataset.act === "edit") return startEditPromo(promo);
  if (button.dataset.act === "toggle") {
    const { error } = await db.from("promotions").update({ active: !promo.active }).eq("id", promo.id);
    if (error) return alert(error.message);
  }
  if (button.dataset.act === "delete") {
    if (!confirm(`Delete “${promo.title}”? This cannot be undone.`)) return;
    const { error } = await db.from("promotions").delete().eq("id", promo.id);
    if (error) return alert(error.message);
    await removePromoImage(promo.image_url);
    if (editingPromo?.id === promo.id) resetPromoForm();
  }
  loadEmployeePromos();
});
