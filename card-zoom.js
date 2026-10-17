// Full-screen AllerCard viewer (2D + 3D) and cart "Remove" helper.
(function () {
  function $(id) { return document.getElementById(id); }

  const layer = $("zoom-layer");
  const stage = $("zoom-stage");
  const img = $("zoom-img");
  const card3dEl = $("card3d");
  const card2dEl = $("card2d");

  if (!layer || !stage || !img) {
    console.warn("card-zoom: missing #zoom-layer markup in index.html");
    return;
  }

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let mode = null;
  let drag = null;

  function applyImg() {
    img.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + scale + ")";
  }

  function openImageFromCanvas(canvas) {
    if (!canvas || !canvas.toDataURL) return;
    mode = "image";
    scale = 1;
    panX = 0;
    panY = 0;
    img.hidden = false;
    try {
      img.src = canvas.toDataURL("image/png");
    } catch (err) {
      console.warn(err);
      return;
    }
    applyImg();
    layer.classList.remove("mode-3d");
    layer.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function open2dAll() {
    const canvases = card2dEl ? card2dEl.querySelectorAll("canvas") : [];
    if (!canvases.length) {
      alert("Flat cards are not ready yet. Open My AllerCard first.");
      return;
    }
    // Prefer the front card (first canvas)
    openImageFromCanvas(canvases[0]);
  }

  function open3d() {
    if (!card3dEl) return;
    mode = "3d";
    img.hidden = true;
    img.removeAttribute("src");
    card3dEl.classList.add("is-fullscreen");
    layer.classList.add("mode-3d");
    layer.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
      if (window.card3d && typeof card3d.resize === "function") card3d.resize();
      // Some viewers size from the container; force another tick
      setTimeout(function () {
        window.dispatchEvent(new Event("resize"));
        if (window.card3d && typeof card3d.resize === "function") card3d.resize();
      }, 50);
    });
  }

  function closeViewer() {
    layer.hidden = true;
    layer.classList.remove("mode-3d");
    img.removeAttribute("src");
    img.hidden = true;
    if (card3dEl) card3dEl.classList.remove("is-fullscreen");
    mode = null;
    document.body.style.overflow = "";
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
      if (window.card3d && typeof card3d.resize === "function") card3d.resize();
    });
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
      if (typeof controls.update === "function") controls.update();
      return;
    }
    // Fallback: scale the 3D container visually
    if (card3dEl && mode === "3d") {
      const current = Number(card3dEl.dataset.zoomScale || "1");
      const next = Math.min(2.5, Math.max(0.6, current * factor));
      card3dEl.dataset.zoomScale = String(next);
      const canvas = card3dEl.querySelector("canvas");
      if (canvas) canvas.style.transform = "scale(" + next + ")";
    }
  }

  $("zoom-close")?.addEventListener("click", closeViewer);
  $("zoom-in")?.addEventListener("click", function () { zoomBy(1.25); });
  $("zoom-out")?.addEventListener("click", function () { zoomBy(0.8); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !layer.hidden) closeViewer();
  });

  stage.addEventListener("wheel", function (e) {
    if (layer.hidden || mode !== "image") return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 0.9);
  }, { passive: false });

  stage.addEventListener("pointerdown", function (e) {
    if (mode !== "image" || e.target.closest("#zoom-bar")) return;
    drag = { x: e.clientX, y: e.clientY, panX: panX, panY: panY };
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener("pointermove", function (e) {
    if (!drag) return;
    panX = drag.panX + (e.clientX - drag.x);
    panY = drag.panY + (e.clientY - drag.y);
    applyImg();
  });
  stage.addEventListener("pointerup", function () { drag = null; });
  stage.addEventListener("pointercancel", function () { drag = null; });

  // Click a flat card canvas to enlarge
  card2dEl?.addEventListener("click", function (e) {
    const canvas = e.target.closest("canvas");
    if (canvas) openImageFromCanvas(canvas);
  });

  // Explicit buttons (reliable on desktop + mobile)
  $("btn-enlarge-3d")?.addEventListener("click", open3d);
  $("btn-enlarge-2d")?.addEventListener("click", open2dAll);

  // 3D: treat a short click (not a drag) as enlarge
  let down = null;
  card3dEl?.addEventListener("pointerdown", function (e) {
    if (card3dEl.classList.contains("is-fullscreen")) return;
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  card3dEl?.addEventListener("pointerup", function (e) {
    if (!down || card3dEl.classList.contains("is-fullscreen")) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = Date.now() - down.t < 400;
    down = null;
    if (moved < 8 && quick) open3d();
  });

  // AllerFoods cart: full Remove control
  let wiping = null;
  function tickWipe() {
    if (!wiping) return;
    const lines = document.querySelectorAll("#cart-lines li");
    const li = Array.from(lines).find(function (row) { return row.textContent.includes(wiping); });
    if (!li) { wiping = null; return; }
    const minus = Array.from(li.querySelectorAll("button, a")).find(function (el) {
      return /remove one/i.test(el.textContent);
    });
    if (!minus) { wiping = null; return; }
    minus.click();
    setTimeout(tickWipe, 40);
  }

  function decorateCart() {
    document.querySelectorAll("#cart-lines li").forEach(function (li) {
      if (li.querySelector("[data-remove-all]")) return;
      const minus = Array.from(li.querySelectorAll("button, a")).find(function (el) {
        return /remove one/i.test(el.textContent);
      });
      if (!minus) return;
      const name = li.textContent.replace(/remove one/i, "").replace(/\d+\s*×/, "").split("·")[0].trim();
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cart-remove";
      btn.dataset.removeAll = "1";
      btn.textContent = "Remove";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        wiping = name;
        tickWipe();
      });
      minus.after(document.createTextNode(" "));
      minus.after(btn);
    });
  }

  const cart = $("cart-lines");
  if (cart) {
    new MutationObserver(decorateCart).observe(cart, { childList: true, subtree: true });
    decorateCart();
  }
})();
