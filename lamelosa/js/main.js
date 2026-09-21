/* LA MELOSA — escena 3D + scroll narrativo
   Idea: la boina se abre, se despiece, y la tortilla se da la vuelta. */
(() => {
  /* siempre empieza por arriba, también al recargar o volver atrás */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) scrollTo(0, 0);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- scroll suave + GSAP ---------- */
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  let lenis = null;
  if (hasGsap && !reduce && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const el = id.length > 1 && $(id);
    if (!el) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(el, { offset: id === '#anatomia' ? 0 : -8 });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }));

  /* ---------- nav + cta móvil ---------- */
  const nav = $('#nav'), sticky = $('.sticky-cta');
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('solid', y > 40);
    sticky.classList.toggle('on', y > innerHeight * 1.1);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- estado de la escena (0..1) ---------- */
  const stage = $('#anatomia');
  const steps = [$('.step--1'), $('.step--2'), $('.step--3'), $('.step--4')];
  let target = 0;

  function setSteps(p) {
    if (reduce) return;
    const on = [p < 0.11, p >= 0.13 && p < 0.55, p >= 0.65 && p < 0.77, p >= 0.9];
    steps.forEach((s, i) => {
      s.classList.toggle('on', on[i]);
      s.setAttribute('aria-hidden', on[i] ? 'false' : 'true');
    });
    const hint = $('.stage__hint'); if (hint) hint.style.opacity = p > 0.04 ? 0 : 1;
  }

  if (hasGsap && !reduce) {
    ScrollTrigger.create({
      trigger: stage, start: 'top top', end: 'bottom bottom',
      onUpdate: self => { target = self.progress; setSteps(target); }
    });
  }

  /* ---------- THREE ---------- */
  const scene3d = (() => {
    if (typeof THREE === 'undefined') return null;
    const ASSETS = window.MELOSA_ASSETS || {};
    const canvas = $('#gl');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    document.documentElement.classList.add('gl');
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0, 9.5);

    /* ---- iluminación de estudio: entorno con softboxes para reflejos reales ---- */
    (() => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#3b2a18'); g.addColorStop(.5, '#170f09'); g.addColorStop(1, '#0a0605');
      x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
      const sb = (px, py, w, h, col, blur) => { x.shadowColor = col; x.shadowBlur = blur; x.fillStyle = col; x.fillRect(px, py, w, h); };
      sb(110, 80, 230, 120, '#e8d2ad', 70); sb(590, 50, 320, 90, '#e6bd85', 70);
      sb(830, 230, 110, 210, '#ff7d2e', 60); sb(380, 300, 210, 60, '#ffe6bd', 50);
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(t).texture;
      pm.dispose(); t.dispose();
    })();
    scene.add(new THREE.AmbientLight(0xffe0b0, 0.12));
    const key = new THREE.DirectionalLight(0xffe2b8, 1.1); key.position.set(3, 6, 5);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
    scene.add(key);
    /* suelo que solo recoge la sombra (asienta el objeto) */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2.35; ground.receiveShadow = true; scene.add(ground);
    const rim = new THREE.DirectionalLight(0xff6a2a, 1.0); rim.position.set(-5, 2, -3); scene.add(rim);

    /* ---- texturas procedurales ---- */
    const sRGB = t => { t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
    const speckle = (ctx, w, h, n, cols, rMax) => {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
        ctx.globalAlpha = 0.25 + Math.random() * 0.5;
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * rMax, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const heightCanvas = (n, w = 512) => {
      const c = document.createElement('canvas'); c.width = c.height = w;
      const x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, w, w);
      speckle(x, w, w, n, ['#404040', '#c0c0c0', '#707070', '#a0a0a0'], 5); return c;
    };
    const noiseTex = (n, w = 256) => {
      const c = document.createElement('canvas'); c.width = c.height = w;
      const x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, w, w);
      speckle(x, w, w, n, ['#303030', '#d0d0d0', '#606060'], 2.4);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    };
    const normalFrom = (src, strength = 2, repeat = false) => {
      const w = src.width, h = src.height, s = src.getContext('2d').getImageData(0, 0, w, h).data;
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const ox = out.getContext('2d'), id = ox.createImageData(w, h), d = id.data;
      const lum = (x, y) => { x = (x + w) % w; y = (y + h) % h; const i = (y * w + x) * 4; return (s[i] * 0.3 + s[i + 1] * 0.59 + s[i + 2] * 0.11) / 255; };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let nx = -(lum(x + 1, y) - lum(x - 1, y)) * strength, ny = (lum(x, y + 1) - lum(x, y - 1)) * strength, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
      ox.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(out); t.anisotropy = 8;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    const bunCanvas = (base, dark) => {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, dark); g.addColorStop(0.35, base); g.addColorStop(0.75, '#efc677'); g.addColorStop(1, '#f2d597');
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
      speckle(x, 512, 512, 1800, [dark, '#fff2c8', base], 3);
      const t = sRGB(new THREE.CanvasTexture(c)); t.wrapS = THREE.RepeatWrapping; return t;
    };
    const sideC = document.createElement('canvas'); sideC.width = 1024; sideC.height = 128;
    const sideX = sideC.getContext('2d');
    (() => {
      const g = sideX.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#9a5a12'); g.addColorStop(.25, '#dfa23a'); g.addColorStop(.6, '#efc25a'); g.addColorStop(1, '#a8631a');
      sideX.fillStyle = g; sideX.fillRect(0, 0, 1024, 128);
      speckle(sideX, 1024, 128, 1400, ['#7a4308', '#fbe08a'], 3);
    })();
    const sideTex = sRGB(new THREE.CanvasTexture(sideC)); sideTex.wrapS = THREE.RepeatWrapping; sideTex.repeat.set(2, 1);
    const sideImg = new Image();
    sideImg.onload = () => {
      /* borde real de la tortilla: se tila dos veces con espejo para que no se note la costura */
      const w = 512;
      sideX.save(); sideX.drawImage(sideImg, 0, 0, w, 128); sideX.translate(1024, 0); sideX.scale(-1, 1); sideX.drawImage(sideImg, 0, 0, w, 128); sideX.restore();
      sideTex.needsUpdate = true;
      tortSide.normalMap = normalFrom(sideC, 3, true); tortSide.normalScale = new THREE.Vector2(0.9, 0.9); tortSide.needsUpdate = true;
    };
    sideImg.src = ASSETS.side || 'img/ig-tortilla-side.jpg';
    const sideCanvas = () => sideTex;
    const capC = document.createElement('canvas'); capC.width = capC.height = 512;
    const capX = capC.getContext('2d');
    (() => {
      const g = capX.createRadialGradient(256, 256, 40, 256, 256, 256);
      g.addColorStop(0, '#f0c453'); g.addColorStop(.7, '#d9982f'); g.addColorStop(1, '#a8631a');
      capX.fillStyle = g; capX.fillRect(0, 0, 512, 512);
      speckle(capX, 512, 512, 1600, ['#8a4d0c', '#fbe08a', '#c47a1c'], 5);
    })();
    const capTex = sRGB(new THREE.CanvasTexture(capC));
    const capImg = new Image();
    capImg.onload = () => {
      const W = capImg.naturalWidth, H = capImg.naturalHeight;
      if (ASSETS.cap) capX.drawImage(capImg, 0, 0, W, H, 0, 0, 512, 512);
      else capX.drawImage(capImg, W * 0.33, H * 0.315, W * 0.6, H * 0.25, 0, 0, 512, 512);
      capTex.needsUpdate = true;
      tortCap.normalMap = normalFrom(capC, 3.5); tortCap.normalScale = new THREE.Vector2(1, 1); tortCap.needsUpdate = true;
    };
    capImg.src = ASSETS.cap || 'img/ig-tortilla-top.jpg';

    /* ---- materiales ---- */
    const bump = noiseTex(1400);
    const softNormal = normalFrom(heightCanvas(2200), 2.2, true);
    const bunMat = new THREE.MeshStandardMaterial({ map: bunCanvas('#e8b15b', '#a86a1c'), normalMap: softNormal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.62, side: THREE.DoubleSide });
    const topMat = new THREE.MeshPhysicalMaterial({ map: bunCanvas('#dd9a3c', '#8a4d0c'), normalMap: softNormal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.46, clearcoat: 0.4, clearcoatRoughness: 0.4, envMapIntensity: 0.75, side: THREE.DoubleSide });
    const sauceMat = new THREE.MeshPhysicalMaterial({ color: 0xcf3a14, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
    const cheeseMat = new THREE.MeshPhysicalMaterial({ color: 0xf7a300, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.55, side: THREE.DoubleSide });
    const tortSide = new THREE.MeshStandardMaterial({ map: sideCanvas(), normalMap: softNormal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.78, emissive: 0x4a2c08, emissiveIntensity: 0.55 });
    const tortCap = new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.5 });
    const sesameMat = new THREE.MeshStandardMaterial({ color: 0xe6d3a8, roughness: 0.75, envMapIntensity: 0.4 });

    const wobble = (geo, amp, k) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
        const f = 1 + amp * Math.sin(a * k) + amp * 0.6 * Math.sin(a * (k + 3) + 1.3);
        p.setX(i, x * f); p.setZ(i, z * f);
      }
      geo.computeVertexNormals(); return geo;
    };
    const lathe = pts => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 96);

    const bottomBun = new THREE.Mesh(lathe([[0, 0], [1.02, 0], [1.1, .05], [1.12, .16], [1.04, .26], [0, .26]]), bunMat);
    const sauce = new THREE.Mesh(wobble(new THREE.CylinderGeometry(1.0, 1.0, 0.07, 96, 1), 0.05, 5), sauceMat);
    const tort = new THREE.Group();
    tort.add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.31, 128, 1), [tortSide, tortCap, tortCap]));
    [1, -1].forEach(sg => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 20, 128), tortSide);
      ring.rotation.x = Math.PI / 2; ring.position.y = sg * 0.155; tort.add(ring);
    });
    const cheese = new THREE.Group();
    (() => {
      const g = new THREE.PlaneGeometry(1.75, 1.75, 72, 72); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 4);
      const p = g.attributes.position;
      for (let n = 0; n < p.count; n++) {
        const x = p.getX(n), z = p.getZ(n), r = Math.hypot(x, z), a = Math.atan2(z, x);
        const e = Math.max(0, (r - 0.6) / 0.55);
        const wob = 1 + 0.06 * Math.sin(a * 7) * e;
        p.setY(n, -0.2 * e * e * wob + 0.01 * Math.sin(a * 3 + r * 6));
      }
      g.computeVertexNormals();
      cheese.add(new THREE.Mesh(g, cheeseMat));
    })();
    const dome = [[0, 0], [1.08, 0], [1.16, .06], [1.16, .14]];
    for (let i = 1; i <= 26; i++) { const a = (i / 26) * Math.PI / 2; dome.push([1.16 * Math.cos(a), .14 + .62 * Math.sin(a)]); }
    const topBun = new THREE.Mesh(lathe(dome), topMat);
    /* sésamo sobre la cúpula */
    (() => {
      const N = 90, im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.038, 10, 8), sesameMat, N);
      const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
      for (let i = 0; i < N; i++) {
        const t = 0.25 + Math.random() * 1.15, ph = Math.random() * Math.PI * 2;
        const r = 1.16 * Math.cos(t), y = 0.14 + 0.62 * Math.sin(t);
        d.position.set(Math.cos(ph) * r, y + 0.01, Math.sin(ph) * r);
        n.set(Math.cos(t) / 1.16 * Math.cos(ph), Math.sin(t) / 0.62, Math.cos(t) / 1.16 * Math.sin(ph)).normalize();
        d.quaternion.setFromUnitVectors(up, n); d.rotateY(Math.random() * 3);
        d.scale.set(1.5, 0.55, 0.9); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      }
      topBun.add(im);
    })();

    const layers = [
      { m: bottomBun, y: 0, mid: 0.13 },
      { m: sauce, y: 0.295, mid: 0 },
      { m: tort, y: 0.51, mid: 0 },
      { m: cheese, y: 0.715, mid: 0 },
      { m: topBun, y: 0.74, mid: 0.36 }
    ];
    const rig = new THREE.Group();      // pose, escala y giro global
    const boina = new THREE.Group();    // la hamburguesa (vuelta, entrada en la caja)
    layers.forEach(l => boina.add(l.m));
    rig.add(boina); scene.add(rig);
    const MID = 0.74;

    /* ---- caja de hamburguesa con el logo ---- */
    const logoImg = new Image();
    const lidC = document.createElement('canvas'); lidC.width = lidC.height = 1024;
    const lx = lidC.getContext('2d');
    const paintLid = () => {
      lx.fillStyle = '#17130f'; lx.fillRect(0, 0, 1024, 1024);
      lx.strokeStyle = '#F7B928'; lx.lineWidth = 8; lx.strokeRect(46, 46, 932, 932);
      lx.globalAlpha = 0.1;
      for (let i = 0; i < 40; i++) { lx.fillStyle = '#F3E7CC'; lx.beginPath(); lx.ellipse(80 + Math.random() * 860, 80 + Math.random() * 860, 22, 17, Math.random() * 3, 0, 7); lx.fill(); }
      lx.globalAlpha = 1;
      if (logoImg.complete && logoImg.naturalWidth) {
        const w = 780, h = w * logoImg.naturalHeight / logoImg.naturalWidth;
        lx.drawImage(logoImg, (1024 - w) / 2, (1024 - h) / 2 - 20, w, h);
      }
      lx.fillStyle = '#F3E7CC'; lx.textAlign = 'center'; lx.font = '700 40px Helvetica, Arial, sans-serif';
      lx.fillText('TORTILLA ES CASA · ES COMPARTIR', 512, 860);
    };
    paintLid();
    const lidTex = sRGB(new THREE.CanvasTexture(lidC));
    const decalTex = sRGB(new THREE.CanvasTexture(document.createElement('canvas')));
    logoImg.onload = () => {
      paintLid(); lidTex.needsUpdate = true;
      const dc = document.createElement('canvas'); dc.width = 1200; dc.height = 485;
      dc.getContext('2d').drawImage(logoImg, 0, 0, 1200, 485);
      decalTex.image = dc; decalTex.needsUpdate = true;
    };
    logoImg.src = ASSETS.logo || 'img/logo-melosa.png';

    const inkMat = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.62, bumpMap: bump, bumpScale: 0.03, envMapIntensity: 0.3 });
    const cardMat = new THREE.MeshStandardMaterial({ color: 0xf7b928, roughness: 0.85, envMapIntensity: 0.5 });
    const lidTopMat = new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.78, metalness: 0, envMapIntensity: 0.35 });
    const BW = 3.0, BD = 3.0, T = 0.07, BH = 0.95, LH = 0.85;
    const put = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    const box = new THREE.Group();
    put(box, new THREE.BoxGeometry(BW, T, BD), inkMat, 0, -0.7 + T / 2, 0);
    put(box, new THREE.BoxGeometry(BW, BH, T), inkMat, 0, -0.7 + BH / 2, BD / 2 - T / 2);
    put(box, new THREE.BoxGeometry(BW, BH, T), inkMat, 0, -0.7 + BH / 2, -BD / 2 + T / 2);
    put(box, new THREE.BoxGeometry(T, BH, BD - 2 * T), inkMat, -BW / 2 + T / 2, -0.7 + BH / 2, 0);
    put(box, new THREE.BoxGeometry(T, BH, BD - 2 * T), inkMat, BW / 2 - T / 2, -0.7 + BH / 2, 0);
    put(box, new THREE.CylinderGeometry(1.3, 1.3, 0.012, 64), cardMat, 0, -0.7 + T + 0.006, 0);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.69), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true }));
    decal.position.set(0, -0.22, BD / 2 + 0.003); box.add(decal);
    const lid = new THREE.Group(); lid.position.set(0, 0.25, -BD / 2);
    put(lid, new THREE.BoxGeometry(BW, T, BD), [inkMat, inkMat, lidTopMat, inkMat, inkMat, inkMat], 0, LH - T / 2, BD / 2);
    put(lid, new THREE.BoxGeometry(BW, LH, T), inkMat, 0, LH / 2, BD - T / 2);
    put(lid, new THREE.BoxGeometry(BW, LH, T), inkMat, 0, LH / 2, T / 2);
    put(lid, new THREE.BoxGeometry(T, LH, BD - 2 * T), inkMat, -BW / 2 + T / 2, LH / 2, BD / 2);
    put(lid, new THREE.BoxGeometry(T, LH, BD - 2 * T), inkMat, BW / 2 - T / 2, LH / 2, BD / 2);
    box.add(lid); rig.add(box); box.visible = false;

    rig.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    /* ---- vapor ---- */
    const steam = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,240,215,.9)'); g.addColorStop(1, 'rgba(255,240,215,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      const N = 34, pos = new Float32Array(N * 3), seed = [];
      for (let i = 0; i < N; i++) { seed.push({ x: (Math.random() - .5) * 1.4, z: (Math.random() - .5) * 1.0, p: Math.random() }); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.7, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a8 });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; rig.add(pts);
      return { geo, mat, seed, pos, N };
    })();

    /* ---- viewport ---- */
    let W = 0, H = 0, portrait = false, dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(devicePixelRatio || 1, W < 700 ? 1.5 : 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      portrait = W / H < 0.85;
    };
    resize(); addEventListener('resize', resize);

    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    addEventListener('pointermove', e => {
      mouse.x = (e.clientX / innerWidth) * 2 - 1;
      mouse.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });

    const tags = $$('.tag');
    const v3 = new THREE.Vector3();
    let visible = true, P = 0, t0 = performance.now(), last = t0;
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(stage);

    const frame = now => {
      if (!visible && !reduce) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      P += (target - P) * (1 - Math.exp(-dt * 6));
      if (reduce) P = 0;

      const e1 = sstep(0.12, 0.30, P), e2 = sstep(0.56, 0.64, P);
      const E = e1 * (1 - e2);                        // despiece
      const O = (1 - sstep(0.04, 0.16, P)) * (1 - e2); // tapa abierta (hero)
      const F = sstep(0.64, 0.76, P);                 // vuelta
      const boxS = sstep(0.72, 0.80, P);              // aparece la caja
      const lift = sstep(0.70, 0.78, P);
      const B = sstep(0.78, 0.88, P);                 // la boina entra
      const C = sstep(0.88, 0.95, P);                 // se cierra la tapa
      const intro = reduce ? 1 : 1 - Math.pow(1 - clamp(t / 1.4, 0, 1), 3);

      /* rig: pose global */
      const heroS = portrait ? 0.74 : 1.2, expS = portrait ? 0.55 : 0.7, endS = portrait ? 0.56 : 0.86;
      const s = lerp(lerp(heroS, expS, E), endS, e2 * (1 - E)) * intro;
      rig.scale.setScalar(Math.max(0.001, s));
      const sideX = portrait ? 0 : lerp(lerp(2.15, 0, e1), 1.9, e2);
      const baseY = portrait ? lerp(-0.5, -0.55, E) : -0.5 * E;
      rig.position.set(sideX, portrait ? lerp(baseY, 0.95, e2) : baseY, 0);

      mouse.sx += (mouse.x - mouse.sx) * 0.06; mouse.sy += (mouse.y - mouse.sy) * 0.06;
      let tilt = lerp(0.9, 0.3, E); tilt = lerp(tilt, 1.02, C);
      rig.rotation.x = tilt + mouse.sy * 0.12 * (1 - E);
      rig.rotation.y = Math.sin(t * 0.5) * 0.5 * (1 - E * 0.8) * (1 - C * 0.75) + mouse.sx * 0.35 * (1 - E) + (reduce ? -0.4 : 0);
      rig.rotation.z = lerp(0.12, 0, Math.max(E, e2));

      /* hamburguesa: vuelta, elevación y entrada en la caja */
      boina.rotation.x = F * Math.PI * 2;
      const hop = Math.sin(F * Math.PI) * 1.1;
      boina.position.set(0, hop + lerp(lift * 2.3, -0.1, B), 0);
      boina.scale.setScalar(lerp(1, 0.7, B));

      /* capas */
      const gap = portrait ? 0.7 : 0.9;
      layers.forEach((l, i) => {
        l.m.position.y = l.y - MID + (i - 2) * gap * E;
        l.m.position.x = 0; l.m.rotation.z = 0;
      });
      topBun.position.y += (portrait ? 0.8 : 1.0) * O;
      topBun.position.x = (portrait ? 0.2 : 0.5) * O;
      topBun.rotation.z = -0.45 * O;
      topBun.rotation.x = 0.25 * O;

      /* caja */
      box.visible = boxS > 0.005;
      box.scale.setScalar(Math.max(0.001, boxS));
      box.position.y = -0.2 - (1 - boxS) * 0.6;
      lid.rotation.x = lerp(-1.95, 0, C);

      /* vapor (solo con la hamburguesa recién hecha) */
      const sv = (1 - sstep(0.06, 0.2, P)) * intro;
      steam.mat.opacity = 0.2 * sv;
      if (sv > 0.01) {
        for (let i = 0; i < steam.N; i++) {
          const sd = steam.seed[i]; sd.p = (sd.p + dt * 0.14) % 1;
          steam.pos[i * 3] = sd.x + Math.sin(t + i) * 0.12;
          steam.pos[i * 3 + 1] = 1.7 + sd.p * 1.6;
          steam.pos[i * 3 + 2] = sd.z;
        }
        steam.geo.attributes.position.needsUpdate = true;
      }

      /* etiquetas ancladas a cada capa */
      const tagsOn = E > 0.35;
      if (tagsOn || tags[0]._on) {
        rig.updateMatrixWorld(true);
        tags.forEach(tg => {
          const l = layers[+tg.dataset.layer];
          v3.set(0, l.mid, 0); l.m.localToWorld(v3); v3.project(camera);
          tg.style.top = ((-v3.y * 0.5 + 0.5) * H) + 'px';
        });
        tags[0]._on = tagsOn;
      }

      key.position.x = 3 + mouse.sx * 2;
      renderer.render(scene, camera);
    };

    if (reduce) { frame(performance.now() + 100); addEventListener('resize', () => frame(performance.now() + 100)); }
    else if (hasGsap) gsap.ticker.add(() => frame(performance.now()));
    else (function loop(n) { frame(n); requestAnimationFrame(loop); })(0);
    return { renderer };
  })();

  if (!hasGsap) return;

  /* ---------- manifiesto: tira que avanza con el scroll ---------- */
  const mq = $('#marquee');
  if (mq) {
    const p = mq.firstElementChild;
    for (let i = 0; i < 2; i++) { const c = p.cloneNode(true); c.setAttribute('aria-hidden', 'true'); mq.appendChild(c); }
    if (!reduce) gsap.fromTo(mq, { xPercent: 0 }, { xPercent: -33.3, ease: 'none', scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: 0.5 } });
  }

  /* ---------- boinas: recorrido horizontal (solo escritorio) ---------- */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    const sec = $('.boinas'), vp = $('#hz'), track = $('.boinas__track');
    sec.classList.add('is-pinned');
    const dist = () => Math.max(0, track.scrollWidth - vp.clientWidth);
    const tw = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: vp, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 }
    });
    return () => { sec.classList.remove('is-pinned'); tw.kill(); gsap.set(track, { clearProps: 'all' }); };
  });

  /* ---------- carta: foto que sigue al cursor ---------- */
  const peek = $('#peek');
  if (peek && matchMedia('(hover:hover) and (min-width:900px)').matches) {
    const pi = peek.querySelector('img');
    const qx = gsap.quickTo(peek, 'left', { duration: 0.35, ease: 'power3' });
    const qy = gsap.quickTo(peek, 'top', { duration: 0.35, ease: 'power3' });
    $$('#menu-list > li').forEach(li => {
      li.addEventListener('mouseenter', () => { pi.src = li.dataset.img; peek.classList.add('on'); });
      li.addEventListener('mouseleave', () => peek.classList.remove('on'));
      li.addEventListener('mousemove', e => { qx(e.clientX + 60); qy(e.clientY); });
    });
  }

  /* ---------- casa: parallax de fotos ---------- */
  if (!reduce) {
    $$('.casa .p, .melosa__photos img').forEach(el => {
      const sp = parseFloat(el.dataset.speed || 0.1);
      gsap.fromTo(el, { y: -sp * 500 }, { y: sp * 500, ease: 'none', scrollTrigger: { trigger: el.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    $$('.boinas__head h2,.ademas h2,.donde h2,.casa__quote p,.melosa h2').forEach(h => {
      gsap.from(h, { y: 60, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 85%' } });
    });
    $$('#menu-list > li').forEach(li => gsap.from(li, { opacity: 0, y: 30, duration: 0.7, ease: 'expo.out', scrollTrigger: { trigger: li, start: 'top 92%' } }));
  }

  addEventListener('load', () => { if (!location.hash) scrollTo(0, 0); ScrollTrigger.refresh(); });
})();
