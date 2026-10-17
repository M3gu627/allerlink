// 3D AllerCard viewer built with Three.js (loaded from a CDN in index.html).
// The front artwork comes from drawCardFace() in app.js. Drag the card to rotate it.
const card3d = (() => {
  const CARD = { w: 8.56, h: (8.56 * 1240) / 1748, depth: 0.08, radius: 0.35 }; // cm, same ratio as the card artwork
  let profile = null;
  let renderer, scene, camera, controls, front, frameId;

  const container = () => document.getElementById("card3d");

  function roundedRect(w, h, r) {
    const x = -w / 2;
    const y = -h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  function makeMap(canvas) {
    const map = new THREE.CanvasTexture(canvas);
    map.encoding = THREE.sRGBEncoding;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    map.repeat.set(1 / CARD.w, 1 / CARD.h); // shape UVs are in cm, so scale them to 0..1
    map.offset.set(0.5, 0.5);
    return map;
  }

  const glossy = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.4, clearcoat: 0.6 });

  function updateFront(canvas) {
    front.material.map?.dispose();
    front.material.map = makeMap(canvas);
    front.material.needsUpdate = true;
  }

  function build(frontCanvas, backCanvas) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container().replaceChildren(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(35, 1.6, 0.1, 100);
      camera.position.set(3, 2, 14); // slight tilt so it reads as 3D right away

      scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd8c8, 0.6));
      const sun = new THREE.DirectionalLight(0xffffff, 0.45);
      sun.position.set(3, 4, 6);
      scene.add(sun);

      // A thin green body with a front and a back face laid on it.
      const shape = roundedRect(CARD.w, CARD.h, CARD.radius);
      const body = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: CARD.depth, bevelEnabled: false }),
        new THREE.MeshStandardMaterial({ color: 0x1b5e3a })
      );
      body.position.z = -CARD.depth / 2;

      const faceGeometry = new THREE.ShapeGeometry(shape);
      front = new THREE.Mesh(faceGeometry, glossy(null));
      front.position.z = CARD.depth / 2 + 0.001;
      const back = new THREE.Mesh(faceGeometry, glossy(makeMap(backCanvas)));
      back.rotation.y = Math.PI;
      back.position.z = -CARD.depth / 2 - 0.001;
      scene.add(body, front, back);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false; // keep page scrolling normal
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.autoRotate = true; // gentle spin until the user grabs the card
      controls.autoRotateSpeed = 2;
      controls.addEventListener("start", () => (controls.autoRotate = false));
      return true;
    } catch (error) {
      renderer = null; // no WebGL: fall back to the flat card image
      container().replaceChildren(frontCanvas);
      return false;
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container();
    if (!width) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function loop() {
    controls.update();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(loop);
  }

  window.addEventListener("resize", () => renderer && resize());

  return {
    setProfile(newProfile) {
      profile = newProfile;
      if (renderer && profile) drawCardFace(profile).then(updateFront);
    },
    async open() { // call once the card page is visible, so the container has a size
      if (!profile) return;
      const [frontCanvas, backCanvas] = await Promise.all([drawCardFace(profile), drawCardBack()]);
      if (!container().clientWidth) return; // the person already left this page
      if (!renderer && !build(frontCanvas, backCanvas)) return;
      updateFront(frontCanvas);
      resize();
      if (!frameId) loop();
    },
    close() {
      cancelAnimationFrame(frameId);
      frameId = null;
    },
  };
})();
