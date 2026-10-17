// Full-screen card viewer + a real Remove control on AllerFoods cart lines.
(function () {
  const layer = document.getElementById("zoom-layer");
  const stage = document.getElementById("zoom-stage");
  const img = document.getElementById("zoom-img");
  const card3dEl = document.getElementById("card3d");
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let mode = null;

  function applyImg() {
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function openImage(canvas) {
    mode = "image";
    scale = 1;
    panX = 0;
    panY = 0;
    img.hidden = false;
    img.src = canvas.toDataURL("image/png");
    applyImg();
    layer.classList.remove("mode-3d");
    layer.hidden = false;
  }

  function open3d() {
    mode = "3d";
    img.hidden = true;
    card3dEl.classList.add("is-fullscreen");
    layer.classList.add("mode-3d");
    layer.hidden = false;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      if (window.card3d && typeof card3d.resize === "function") card3d.resize();
    });
  }

  function closeViewer() {
    layer.hidden = true;
    img.removeAttribute("src");
    layer.classList.remove("mode-3d");
    if (card3dEl) card3dEl.classList.remove("is-fullscreen");
    mode = null;
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  function zoomBy(factor) {
    if (mode === "image") {
      scale = Math.min(5, Math.max(0.5, scale * factor));
      applyImg();
      return;
    }
    const controls = window.card3d && card3d.controls;
    const cam = controls && controls.object;
    if (cam) {
      cam.position.multiplyScalar(factor > 1 ? 0.85 : 1.18);
      controls.update();
    }
  }

  document.getElementById("zoom-close").addEventListener("click", closeViewer);
  document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1.25));
  document.getElementById("zoom-out").addEventListener("click", () => zoomBy(0.8));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !layer.hidden) closeViewer();
  });

  stage.addEventListener("wheel", (e) => {
    if (layer.hidden || mode !== "image") return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 0.9);
  }, { passive: false });

  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (mode !== "image" || e.target.closest("#zoom-bar")) return;
    drag = { x: e.clientX, y: e.clientY, panX, panY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    panX = drag.panX + (e.clientX - drag.x);
    panY = drag.panY + (e.clientY - drag.y);
    applyImg();
  });
  stage.addEventListener("pointerup", () => { drag = null; });

  document.getElementById("card2d").addEventListener("click", (e) => {
    const canvas = e.target.closest("canvas");
    if (canvas) openImage(canvas);
  });

  let down = null;
  card3dEl.addEventListener("pointerdown", (e) => {
    if (card3dEl.classList.contains("is-fullscreen")) return;
    down = { x: e.clientX, y: e.clientY };
  });
  card3dEl.addEventListener("pointerup", (e) => {
    if (!down || card3dEl.classList.contains("is-fullscreen")) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 8) open3d();
  });

  // AllerFoods: "Remove one" only lowers the quantity. Add Remove for the whole line.
  let wiping = null;
  function tickWipe() {
    if (!wiping) return;
    const lines = document.querySelectorAll("#cart-lines li");
    const li = [...lines].find((row) => row.textContent.includes(wiping));
    if (!li) { wiping = null; return; }
    const minus = [...li.querySelectorAll("button, a")].find((el) => /remove one/i.test(el.textContent));
    if (!minus) { wiping = null; return; }
    minus.click();
    setTimeout(tickWipe, 40);
  }

  function decorateCart() {
    document.querySelectorAll("#cart-lines li").forEach((li) => {
      if (li.querySelector("[data-remove-all]")) return;
      const minus = [...li.querySelectorAll("button, a")].find((el) => /remove one/i.test(el.textContent));
      if (!minus) return;
      const name = li.textContent.replace(/remove one/i, "").replace(/\d+\s*×/, "").split("·")[0].trim();
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cart-remove";
      btn.dataset.removeAll = "1";
      btn.textContent = "Remove";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        wiping = name;
        tickWipe();
      });
      minus.after(document.createTextNode(" "));
      minus.after(btn);
    });
  }

  const cart = document.getElementById("cart-lines");
  if (cart) {
    new MutationObserver(decorateCart).observe(cart, { childList: true, subtree: true });
    decorateCart();
  }
})();
