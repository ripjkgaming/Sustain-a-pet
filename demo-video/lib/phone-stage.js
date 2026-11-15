/* 3D phone stage: renders the supplied iPhone GLB with Three.js and pins the real
 * screen-recording element onto the model's Display surface with a projective CSS
 * matrix3d computed from the 4 projected display corners every frame.
 * Pose comes from a keyframe list (time-driven, deterministic). No clocks, no rAF.
 *
 * PhoneStage.mount({ canvas, screen, glass, glb, keys })
 *   keys: [{ t, x, y, z, rx, ry, rz, ease }]  seconds in this composition, metres/degrees
 */
(function () {
  const DISPLAY = { hx: 0.03377008, hz: 0.07282908, y: 0.0034536 };
  const W = 1920, H = 1080;
  const easeFns = {
    linear: (u) => u,
    inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    out: (u) => 1 - Math.pow(1 - u, 4),
    in: (u) => u * u * u,
    expo: (u) => (u === 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  };

  function poseAt(keys, t) {
    if (t <= keys[0].t) return keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b.t) {
        const u = (easeFns[b.ease || 'inOut'])((t - a.t) / Math.max(1e-6, b.t - a.t));
        const o = {};
        for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) o[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * u;
        return o;
      }
    }
    return keys[keys.length - 1];
  }

  // Projective transform mapping the unit square to quad p0..p3 (tl, tr, br, bl).
  function squareToQuad(p) {
    const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    return [x1 - x0 + g * x1, y1 - y0 + g * y1, g, x3 - x0 + h * x3, y3 - y0 + h * y3, h, x0, y0, 1];
  }

  function mount(opts) {
    const { THREE, GLTFLoader, RoomEnvironment } = window;
    const { canvas, screen, glass, glb, keys } = opts;
    const sw = screen.offsetWidth, sh = screen.offsetHeight;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(-0.4, 0.6, 0.8); scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe8ff, 2.6); rim.position.set(0.7, 0.3, -0.6); scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const camera = new THREE.PerspectiveCamera(24, W / H, 0.01, 10);
    camera.position.set(0, 0, 0.62);
    camera.lookAt(0, 0, 0);

    const rig = new THREE.Group();
    const model = new THREE.Group();
    rig.add(model); scene.add(rig);
    let display = null;

    const ready = new Promise((resolve, reject) => {
      new GLTFLoader().load(glb, (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (/prop-lilies/.test(o.name)) o.visible = false;
          if (o.isMesh) {
            const m = o.material;
            if (m && m.name === 'Display') { display = o; o.material = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.2, metalness: 0 }); }
            if (m && m.name === 'Aluminum') m.roughness = Math.max(m.roughness ?? 0.4, 0.42);
          }
        });
        model.add(root);
        // centre and orient in rig space: clear any pose applied before the model loaded
        rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
        scene.updateMatrixWorld(true);
        // Orient so the display faces +Z (camera) and the phone's top points +Y.
        const dn = new THREE.Vector3(0, 1, 0).transformDirection(display.matrixWorld);
        const top = new THREE.Vector3(0, 0, -1).transformDirection(display.matrixWorld);
        const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(top, dn), top, dn);
        model.quaternion.setFromRotationMatrix(basis.invert());
        scene.updateMatrixWorld(true);
        const c = new THREE.Vector3(0, 0, 0).applyMatrix4(display.matrixWorld);
        model.position.sub(c); // display centre at rig origin
        scene.updateMatrixWorld(true);
        resolve();
      }, undefined, reject);
    });

    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // tl, tr, br, bl (x right, z down)
    const v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();

    function render(t) {
      const p = poseAt(keys, t);
      rig.position.set(p.x, p.y, p.z);
      rig.rotation.set(THREE.MathUtils.degToRad(p.rx), THREE.MathUtils.degToRad(p.ry), THREE.MathUtils.degToRad(p.rz), 'YXZ');
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
      if (!display) return;
      const pts = corners.map(([cx, cz]) => {
        v.set(cx * DISPLAY.hx, DISPLAY.y + 0.0002, cz * DISPLAY.hz).applyMatrix4(display.matrixWorld).project(camera);
        return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
      });
      n.set(0, 1, 0).transformDirection(display.matrixWorld);
      c.set(0, 0, 0).applyMatrix4(display.matrixWorld);
      const facing = n.dot(camera.position.clone().sub(c).normalize());
      const m = squareToQuad(pts);
      const s = [m[0] / sw, m[1] / sw, 0, m[2] / sw, m[3] / sh, m[4] / sh, 0, m[5] / sh, 0, 0, 1, 0, m[6], m[7], 0, m[8]];
      const css = `matrix3d(${s.map((x) => +x.toFixed(9)).join(',')})`;
      const vis = facing > 0.05 ? '1' : '0';
      screen.style.transform = css; screen.style.opacity = vis;
      if (glass) { glass.style.transform = css; glass.style.opacity = vis; glass.style.setProperty('--sheen', `${(40 + p.ry * 2.4 + p.rx * 1.2).toFixed(2)}%`); }
    }
    return { ready, render };
  }
  window.PhoneStage = { mount };
})();
