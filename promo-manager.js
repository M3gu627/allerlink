// Promotions page shared by employees and businesses, laid out like a social post:
// a composer at the top (headline, text, photo, Post button) and a feed of posts below.
// Employees manage everything (and can post ads). A business manages only its own promos and events,
// and can feature one of its dishes. Everything shows on the customer Home page.
// Uses db, state, formData() and resizeImage() from app.js, esc() from foods.js,
// and promoDates(), todayIso() and formatDay() from customer-home.js.
const PROMO_BUCKET = "promo-images";
const PROMO_KINDS = { promo: "Promo", event: "Event", ad: "Ad (sponsored)" };

function createPromoManager(root, { partner }) {
  const kinds = partner ? ["promo", "event"] : ["promo", "event", "ad"];
  root.innerHTML = `
    <form class="panel composer" data-form>
      <div class="post-author">
        <span class="post-avatar" data-avatar>A</span>
        <div><b data-author>AllerLink</b><small data-heading>Create a post</small></div>
      </div>
      <input name="title" required maxlength="80" placeholder="Headline, e.g. Buy 1 Get 1 burgers this weekend" aria-label="Headline">
      <textarea name="details" required maxlength="600" rows="4" placeholder="What's new? Share a promo, a dish or an event with customers…" aria-label="Post text"></textarea>
      <div class="photo-preview post-preview" data-preview-wrap hidden>
        <img data-preview alt="Photo preview">
        <button type="button" data-image-remove aria-label="Remove photo">×</button>
      </div>
      <div class="composer-tools">
        <label class="tool-btn">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></svg>
          Add photo
          <input type="file" data-image-input accept="image/*" hidden>
        </label>
        <select name="kind" aria-label="Post type">${kinds.map((kind) => `<option value="${kind}">${PROMO_KINDS[kind]}</option>`).join("")}</select>
      </div>
      <details class="composer-more">
        <summary>Dates, link and visibility</summary>
        <div class="composer-more-body">
          ${partner ? '<label>Featured dish (optional) <select name="product_id"><option value="">None</option></select></label>' : ""}
          <label>Start or event date (optional) <input name="starts_on" type="date"></label>
          <label>End date (optional, the post hides itself after this day) <input name="ends_on" type="date"></label>
          <label>Link (optional) <input name="link_url" type="url" placeholder="https://"></label>
          <label class="check"><input type="checkbox" name="active" checked> Show on customer Home</label>
        </div>
      </details>
      <div class="composer-actions">
        <button class="ghost" type="button" data-cancel hidden>Cancel</button>
        <button class="primary" type="submit" data-submit>Post</button>
      </div>
    </form>
    <div class="list-stack" data-list></div>`;

  const q = (selector) => root.querySelector(selector);
  const form = q("[data-form]");
  const fields = form.elements;
  const imageInput = q("[data-image-input]");
  const previewWrap = q("[data-preview-wrap]");
  const preview = q("[data-preview]");

  let rows = [];
  let editing = null; // the post being edited, or null when writing a new one
  let imageUrl = ""; // photo already saved with the post
  let imageBlob = null; // new photo chosen in this form
  const ownerId = () => state.establishment?.id;

  // ---------- Author shown on the composer ----------
  const avatarHtml = (name, logo) =>
    logo ? `<img src="${esc(logo)}" alt="">` : esc((name || "A").charAt(0).toUpperCase());

  function showAuthor() {
    const name = partner ? state.establishment?.business_name : "AllerLink Team";
    q("[data-author]").textContent = name || "Your business";
    q("[data-avatar]").innerHTML = avatarHtml(name, partner ? state.establishment?.logo_url : "");
  }

  // ---------- Photo ----------
  function setPicture(src) {
    preview.src = src;
    previewWrap.hidden = !src;
  }

  function clearPicture() {
    imageUrl = "";
    imageBlob = null;
    imageInput.value = "";
    setPicture("");
  }

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      imageInput.value = "";
      return alert("Please choose an image file.");
    }
    const dataUrl = await resizeImage(file, 1200); // keeps the upload well under 2 MB
    imageBlob = await (await fetch(dataUrl)).blob();
    setPicture(dataUrl);
  });
  q("[data-image-remove]").addEventListener("click", clearPicture);

  async function removeImage(url) {
    const name = url?.split(`/${PROMO_BUCKET}/`)[1];
    if (name) await db.storage.from(PROMO_BUCKET).remove([name]);
  }

  // ---------- Composer ----------
  function resetForm() {
    editing = null;
    form.reset();
    clearPicture();
    q("[data-heading]").textContent = "Create a post";
    q("[data-submit]").textContent = "Post";
    q("[data-cancel]").hidden = true;
  }

  function startEdit(promo) {
    editing = promo;
    fields.kind.value = promo.kind;
    fields.title.value = promo.title;
    fields.details.value = promo.details;
    if (partner) fields.product_id.value = String(promo.product_id ?? "");
    fields.starts_on.value = promo.starts_on || "";
    fields.ends_on.value = promo.ends_on || "";
    fields.link_url.value = promo.link_url || "";
    fields.active.checked = promo.active;
    imageInput.value = "";
    imageBlob = null;
    imageUrl = promo.image_url || ""; // the current photo stays unless it is replaced or removed
    setPicture(imageUrl);
    q("[data-heading]").textContent = "Editing post";
    q("[data-submit]").textContent = "Save changes";
    q("[data-cancel]").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  q("[data-cancel]").addEventListener("click", resetForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
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
      image_url: imageUrl || null,
    };
    if (partner) row.product_id = fields.product_id.value || null;
    if (imageBlob) {
      const path = `${partner ? ownerId() + "/" : ""}${Date.now()}.jpg`; // businesses upload into their own folder
      const { error: uploadError } = await db.storage.from(PROMO_BUCKET).upload(path, imageBlob, { contentType: "image/jpeg" });
      if (uploadError) return alert("The photo could not be uploaded: " + uploadError.message);
      row.image_url = db.storage.from(PROMO_BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const request = editing
      ? db.from("promotions").update(row).eq("id", editing.id)
      : db.from("promotions").insert(partner ? { ...row, establishment_id: ownerId() } : row);
    const { error } = await request;
    if (error) return alert(error.message);
    if (editing?.image_url && editing.image_url !== row.image_url) await removeImage(editing.image_url);
    resetForm();
    load();
  });

  // ---------- Feed ----------
  async function load() {
    showAuthor();
    if (!db) return;
    let query = db.from("promotions").select("*, establishments(business_name, logo_url)").order("created_at", { ascending: false });
    if (partner) query = query.eq("establishment_id", ownerId());
    const { data, error } = await query;
    if (error) return alert(error.message + " — run promotions.sql in Supabase first.");
    rows = data;
    if (partner) await loadDishes();
    renderList();
  }

  async function loadDishes() {
    const { data } = await db.from("partner_products").select("id, name").eq("establishment_id", ownerId()).order("name");
    const chosen = fields.product_id.value;
    fields.product_id.innerHTML =
      '<option value="">None</option>' + (data ?? []).map((dish) => `<option value="${dish.id}">${esc(dish.name)}</option>`).join("");
    fields.product_id.value = chosen;
  }

  function status(promo) {
    const lastDay = promo.ends_on ?? (promo.kind === "event" ? promo.starts_on : null);
    if (lastDay && lastDay < todayIso()) return ["Expired", "off"];
    return promo.active ? ["Live", "ok"] : ["Hidden", "off"];
  }

  function renderList() {
    q("[data-list]").innerHTML =
      rows
        .map((promo) => {
          const [label, tone] = status(promo);
          const dates = promoDates(promo);
          const author = promo.establishments?.business_name ?? "AllerLink Team";
          return `<article class="panel post-card">
            <div class="post-author">
              <span class="post-avatar">${avatarHtml(author, promo.establishments?.logo_url)}</span>
              <div>
                <b>${esc(author)}</b>
                <small>${formatDay(promo.created_at.slice(0, 10))} · <span class="chip">${PROMO_KINDS[promo.kind]}</span> <span class="badge ${tone}">${label}</span></small>
              </div>
            </div>
            <h4>${esc(promo.title)}</h4>
            <p>${esc(promo.details)}</p>
            ${promo.image_url ? `<img class="post-img" src="${esc(promo.image_url)}" alt="">` : ""}
            ${dates ? `<small>${esc(dates)}</small>` : ""}
            ${promo.link_url ? `<small>Link: ${esc(promo.link_url)}</small>` : ""}
            <div class="post-actions">
              <button class="link" data-act="edit" data-id="${promo.id}">Edit</button>
              <button class="link" data-act="toggle" data-id="${promo.id}">${promo.active ? "Hide" : "Show"}</button>
              <button class="link danger" data-act="delete" data-id="${promo.id}">Delete</button>
            </div>
          </article>`;
        })
        .join("") || '<p class="note">No posts yet. Write your first one above.</p>';
  }

  q("[data-list]").addEventListener("click", async (e) => {
    const button = e.target.closest("[data-act]");
    const promo = button && rows.find((row) => String(row.id) === button.dataset.id);
    if (!promo) return;
    if (button.dataset.act === "edit") return startEdit(promo);
    if (button.dataset.act === "toggle") {
      const { error } = await db.from("promotions").update({ active: !promo.active }).eq("id", promo.id);
      if (error) return alert(error.message);
    }
    if (button.dataset.act === "delete") {
      if (!confirm(`Delete “${promo.title}”? This cannot be undone.`)) return;
      const { error } = await db.from("promotions").delete().eq("id", promo.id);
      if (error) return alert(error.message);
      await removeImage(promo.image_url);
      if (editing?.id === promo.id) resetForm();
    }
    load();
  });

  return { load };
}

const employeePromos = createPromoManager(document.getElementById("employee-promos-root"), { partner: false });
const partnerPromos = createPromoManager(document.getElementById("partner-promos-root"), { partner: true });
const loadEmployeePromos = () => employeePromos.load();
const loadPartnerPromos = () => partnerPromos.load();
