import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const COLOR_MAPEO = '#e61c24';
const COLOR_SS = '#059669';
const COLOR_SOLAPE = '#f97316';
const COLOR_OREJA = '#7c3aed';
// Holgura del film antes del horno (el tubo queda un poco más grande que el pack).
const HOLGURA_ANTES = 0.06;

function disposeScene(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    }
  });
}

function createLabelSprite(text, accent = COLOR_MAPEO) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(255,255,255,0.94)';
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 22);
  context.fill();
  context.stroke();
  context.fillStyle = '#172033';
  context.font = 'bold 40px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.55, 0.39, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function overlayLine(points, color, { dashed = false, loop = false } = {}) {
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.04, depthTest: false })
    : new THREE.LineBasicMaterial({ color, depthTest: false });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = loop ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 12;
  return line;
}

function overlayDot(position, color, radius = 0.045) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 16),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  dot.position.copy(position);
  dot.renderOrder = 14;
  return dot;
}

// Cota: línea con extremos marcados y etiqueta.
function dimension(group, from, to, color, text, labelOffset) {
  group.add(overlayLine([from, to], color));
  group.add(overlayDot(from, color, 0.035));
  group.add(overlayDot(to, color, 0.035));
  const label = createLabelSprite(text, color);
  label.position.copy(from).add(to).multiplyScalar(0.5).add(labelOffset);
  group.add(label);
}

// Perfil A-F en mm, centrado en x, recorrido desde el centro del fondo hacia A.
function buildLoop({ ancho, dia, tapa, alt, altCil }) {
  const inset = Math.max(0, (dia - tapa) / 2);
  const cuerpo = Math.min(Math.max(altCil, 0), alt);
  const pts = [
    { x: 0, y: 0 },
    { x: -ancho / 2, y: 0 },
    { x: -ancho / 2, y: cuerpo },
    { x: -ancho / 2 + inset, y: alt },
    { x: ancho / 2 - inset, y: alt },
    { x: ancho / 2, y: cuerpo },
    { x: ancho / 2, y: 0 },
    { x: 0, y: 0 },
  ];
  const arcs = [0];
  for (let i = 1; i < pts.length; i += 1) {
    arcs.push(arcs[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, arcs, length: arcs[arcs.length - 1] };
}

function pointOnLoop(loop, position) {
  const L = loop.length;
  const pos = ((position % L) + L) % L;
  for (let i = 1; i < loop.pts.length; i += 1) {
    if (pos <= loop.arcs[i] + 1e-9) {
      const span = loop.arcs[i] - loop.arcs[i - 1];
      const t = span > 1e-9 ? (pos - loop.arcs[i - 1]) / span : 0;
      const a = loop.pts[i - 1];
      const b = loop.pts[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return { ...loop.pts[0] };
}

// Punto donde el rayo desde el centro del hueco hacia P toca el borde del hueco.
function rayToPolygon(center, point, poly) {
  if (!poly.length) return center;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const ax = a.x - center.x;
    const ay = a.y - center.y;
    const t = (ax * ey - ay * ex) / denom;
    const u = (ax * dy - ay * dx) / denom;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  if (!Number.isFinite(best) || best > 1) return point;
  return { x: center.x + dx * best, y: center.y + dy * best };
}

// Textura del film completo (Inicio→Final × ancho del arte). El recorte marca la zona
// impresa: se deja en su posición real y lo que queda afuera es film transparente.
function createFilmTexture(imageUrl, crop, encuadre, invertido, onReady) {
  const image = new Image();
  image.onload = () => {
    const pct = (value) => Math.max(0, Math.min(45, value ?? 0)) / 100;
    const left = pct(crop?.izquierda);
    const right = pct(crop?.derecha);
    const top = pct(crop?.superior);
    const bottom = pct(crop?.inferior);
    // Encuadre: bordes de la imagen que no son film (reglas, cotas del plano).
    const fx = image.width * pct(encuadre?.izquierda);
    const fy = image.height * pct(encuadre?.superior);
    const fw = image.width * Math.max(0.1, 1 - pct(encuadre?.izquierda) - pct(encuadre?.derecha));
    const fh = image.height * Math.max(0.1, 1 - pct(encuadre?.superior) - pct(encuadre?.inferior));
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(4096, Math.max(1024, Math.round(fw)));
    canvas.height = Math.max(256, Math.round((canvas.width * fh) / fw));
    const context = canvas.getContext('2d');
    context.save();
    if (invertido) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(image, fx, fy, fw, fh, 0, 0, canvas.width, canvas.height);
    context.restore();
    const W = canvas.width;
    const H = canvas.height;
    const x0 = Math.round(W * left);
    const x1 = Math.round(W * (1 - right));
    const y0 = Math.round(H * top);
    const y1 = Math.round(H * (1 - bottom));
    // Fuera de la zona impresa (y un borde de 1 px) queda transparente.
    context.clearRect(0, 0, W, Math.max(1, y0));
    context.clearRect(0, Math.min(H - 1, y1), W, H);
    context.clearRect(0, 0, Math.max(1, x0), H);
    context.clearRect(Math.min(W - 1, x1), 0, W, H);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    onReady(texture);
  };
  image.src = imageUrl;
}

// Lleva una posición del film (mm desde Inicio) a la posición equivalente del plano,
// tramo por tramo: Inicio-A, A-B, … F-Final.
function mapearAlPlano(arc, knotsGeo, knotsPlano) {
  if (!knotsGeo || !knotsPlano || knotsGeo.length !== knotsPlano.length) return arc;
  const n = knotsGeo.length;
  if (arc <= knotsGeo[0]) return knotsPlano[0] + (arc - knotsGeo[0]);
  for (let i = 1; i < n; i += 1) {
    if (arc <= knotsGeo[i]) {
      const span = knotsGeo[i] - knotsGeo[i - 1];
      const t = span > 1e-9 ? (arc - knotsGeo[i - 1]) / span : 0;
      return knotsPlano[i - 1] + t * (knotsPlano[i] - knotsPlano[i - 1]);
    }
  }
  return knotsPlano[n - 1] + (arc - knotsGeo[n - 1]);
}

// Malla del film: recorrido del corte (arco) × ancho de bobina (cuerpo + orejas).
function createFilm({ loop, corte, solape, profundidad, oreja, hueco, scale, arte }) {
  const P = loop.length;
  const inicio = P - solape / 2;

  const arcSet = new Set();
  for (let a = 0; a < corte; a += 4) arcSet.add(Math.round(a * 1000) / 1000);
  arcSet.add(Math.round(corte * 1000) / 1000);
  loop.arcs.forEach((c) => {
    for (let k = -1; k <= 2; k += 1) {
      const a = c + k * P - inicio;
      if (a >= 0 && a <= corte) arcSet.add(Math.round(a * 1000) / 1000);
    }
  });
  const arcs = [...arcSet].sort((a, b) => a - b);

  // Posición final (pegada al pack). El tramo final del solape va por fuera (1 mm abajo).
  const tight = arcs.map((a) => {
    const p = pointOnLoop(loop, inicio + a);
    return a > P ? { x: p.x, y: p.y - 1 } : p;
  });

  const centroHueco = hueco.length
    ? hueco.reduce((acc, p) => ({ x: acc.x + p.x / hueco.length, y: acc.y + p.y / hueco.length }), { x: 0, y: 0 })
    : loop.pts.reduce((acc, p) => ({ x: acc.x + p.x / loop.pts.length, y: acc.y + p.y / loop.pts.length }), { x: 0, y: 0 });
  const bordeHueco = tight.map((p) => rayToPolygon(centroHueco, p, hueco));

  const halfD = profundidad / 2;
  const pasosOreja = oreja > 0 ? 10 : 0;
  const ws = [];
  for (let i = pasosOreja; i >= 1; i -= 1) ws.push(-(halfD + (oreja * i) / pasosOreja));
  ws.push(-halfD, halfD);
  for (let i = 1; i <= pasosOreja; i += 1) ws.push(halfD + (oreja * i) / pasosOreja);

  const nA = arcs.length;
  const nW = ws.length;
  const positions = new Float32Array(nA * nW * 3);
  const uvs = new Float32Array(nA * nW * 2);
  const artLength = Math.max(Number(arte?.largo ?? corte), 1);
  const artWidth = Math.max(Number(arte?.ancho ?? profundidad + 2 * oreja), 1);
  const offset = Number(arte?.offset ?? 0);
  for (let i = 0; i < nA; i += 1) {
    for (let j = 0; j < nW; j += 1) {
      const k = i * nW + j;
      uvs[k * 2] = (mapearAlPlano(arcs[i], arte?.knotsGeo, arte?.knotsPlano) + offset) / artLength;
      // Signo negativo: el arte se lee derecho visto desde afuera del pack.
      uvs[k * 2 + 1] = 0.5 - ws[j] / artWidth;
    }
  }
  const indices = [];
  for (let i = 0; i < nA - 1; i += 1) {
    for (let j = 0; j < nW - 1; j += 1) {
      const a = i * nW + j;
      const b = a + 1;
      const c = a + nW;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const edgePositions = [new Float32Array(nA * 3), new Float32Array(nA * 3)];
  const edges = edgePositions.map((array) => {
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
    return edgeGeometry;
  });

  const lerp = (a, b, t) => a + (b - a) * t;
  const update = (t) => {
    for (let i = 0; i < nA; i += 1) {
      const p = tight[i];
      const bx = p.x * (1 + HOLGURA_ANTES);
      const by = p.y * (1 + HOLGURA_ANTES);
      const q = bordeHueco[i];
      for (let j = 0; j < nW; j += 1) {
        const w = ws[j];
        let x;
        let y;
        let z;
        if (Math.abs(w) <= halfD + 1e-9) {
          x = lerp(bx, p.x, t);
          y = lerp(by, p.y, t);
          z = w;
        } else {
          const sign = Math.sign(w);
          const f = (Math.abs(w) - halfD) / oreja;
          x = lerp(bx, p.x + (q.x - p.x) * f, t);
          y = lerp(by, p.y + (q.y - p.y) * f, t);
          z = sign * lerp(Math.abs(w), halfD + 1 + f * 1.5, t);
        }
        const k = (i * nW + j) * 3;
        positions[k] = x * scale;
        positions[k + 1] = y * scale;
        positions[k + 2] = z * scale;
      }
      [0, nW - 1].forEach((j, e) => {
        const k = (i * nW + j) * 3;
        edgePositions[e][i * 3] = positions[k];
        edgePositions[e][i * 3 + 1] = positions[k + 1];
        edgePositions[e][i * 3 + 2] = positions[k + 2];
      });
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    edges.forEach((edge) => {
      edge.attributes.position.needsUpdate = true;
      edge.computeBoundingSphere();
    });
  };

  return { geometry, edges, update };
}

export default function Pack3D({ geometry, resetToken = 0, contraccion = 1, capas, vista }) {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const camaraRef = useRef(null); // conserva la cámara cuando el modelo se regenera

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !geometry) return undefined;
    const width = Math.max(mount.clientWidth, 320);
    const height = Math.max(mount.clientHeight, 420);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf4fb');
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.replaceChildren(renderer.domElement);

    const renderedDiameter = 0.78;
    const scale = renderedDiameter / geometry.dia;
    const totalHeight = geometry.alt * scale;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.95;
    const setView = (name = 'iso') => {
      const views = {
        iso: [7.3, 5.4, 8.4],
        frente: [0, totalHeight / 2, 9.5],
        abajo: [4.5, -5.5, 5.5],
      };
      camera.position.set(...(views[name] ?? views.iso));
      controls.target.set(0, totalHeight / 2, 0);
      controls.update();
    };
    if (camaraRef.current) {
      camera.position.copy(camaraRef.current.position);
      controls.target.copy(camaraRef.current.target);
      controls.update();
    } else {
      setView('iso');
    }

    scene.add(new THREE.HemisphereLight(0xffffff, 0x718296, 2.4));
    const mainLight = new THREE.DirectionalLight(0xffffff, 3.2);
    mainLight.position.set(5, 9, 6);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0xdfe7f0, roughness: 0.92, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(16, 16, 0x98a9ba, 0xcbd6e2);
    grid.position.y = -0.015;
    scene.add(grid);

    const countX = geometry.botellasCorte;
    const countZ = geometry.botellasBobina;
    const shoulderStart = Math.min(geometry.altCil, geometry.alt) * scale;
    const bodyRadius = renderedDiameter / 2;
    const capRadius = Math.max(0.05, (geometry.tapa * scale) / 2);
    const upperHeight = Math.max(totalHeight - shoulderStart, totalHeight * 0.12);
    const capHeight = Math.min(totalHeight * 0.055, upperHeight * 0.2);
    const neckHeight = Math.min(totalHeight * 0.08, upperHeight * 0.23);
    const shoulderHeight = Math.max(upperHeight - neckHeight - capHeight, totalHeight * 0.06);
    const spacing = renderedDiameter;

    const pack = new THREE.Group();
    pack.position.y = 0.03;
    scene.add(pack);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xc7e0ef, transparent: true, opacity: 0.84, roughness: 0.18, transmission: 0.18 });
    const liquid = new THREE.MeshStandardMaterial({ color: 0x2d110b, roughness: 0.4 });
    const labelMaterial = new THREE.MeshStandardMaterial({ color: 0xe51c2a, roughness: 0.48 });
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0xe31b23, roughness: 0.5 });

    for (let x = 0; x < countX; x += 1) {
      for (let z = 0; z < countZ; z += 1) {
        const bottle = new THREE.Group();
        bottle.position.set(x * spacing - ((countX - 1) * spacing) / 2, 0, z * spacing - ((countZ - 1) * spacing) / 2);
        const liquidMesh = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.83, bodyRadius * 0.87, shoulderStart * 0.9, 28), liquid);
        liquidMesh.position.y = shoulderStart * 0.45;
        bottle.add(liquidMesh);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.985, bodyRadius * 0.985, shoulderStart, 32), glass);
        body.position.y = shoulderStart / 2;
        body.castShadow = true;
        bottle.add(body);
        const label = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.995, bodyRadius * 0.995, shoulderStart * 0.27, 32, 1, true), labelMaterial);
        label.position.y = shoulderStart * 0.58;
        bottle.add(label);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(capRadius * 1.28, bodyRadius * 0.985, shoulderHeight, 32), glass);
        shoulder.position.y = shoulderStart + shoulderHeight / 2;
        bottle.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(capRadius, capRadius * 1.1, neckHeight, 24), glass);
        neck.position.y = shoulderStart + shoulderHeight + neckHeight / 2;
        bottle.add(neck);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(capRadius, capRadius, capHeight, 24), capMaterial);
        cap.position.y = totalHeight - capHeight / 2;
        bottle.add(cap);
        pack.add(bottle);
      }
    }

    // ── FILM ──
    const ancho = geometry.anchoCara;
    const profundidad = geometry.profundidad;
    const oreja = Math.max(0, geometry.oreja);
    const solape = Math.max(Number(geometry.solape ?? 0), -ancho * 0.9);
    const loop = buildLoop({ ancho, dia: geometry.dia, tapa: geometry.tapa, alt: geometry.alt, altCil: geometry.altCil });
    const hueco = (geometry.hueco ?? []).map((p) => ({ x: p.x - ancho / 2, y: p.y }));
    const conArte = geometry.tipoFilm === 'arte' && geometry.arte?.imagen;
    const film = createFilm({
      loop,
      corte: Math.max(Number(geometry.largoCorte ?? loop.length), 1),
      solape,
      profundidad,
      oreja,
      hueco,
      scale,
      arte: conArte ? geometry.arte : null,
    });
    const filmMesh = new THREE.Mesh(film.geometry, new THREE.MeshPhysicalMaterial({
      color: 0x2396df,
      transparent: true,
      opacity: 0.3,
      roughness: 0.18,
      transmission: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    filmMesh.renderOrder = 3;
    pack.add(filmMesh);
    film.edges.forEach((edge) => {
      const line = new THREE.Line(edge, new THREE.LineBasicMaterial({ color: 0x0878c4, transparent: true, opacity: 0.9 }));
      line.renderOrder = 4;
      pack.add(line);
    });
    if (conArte) {
      createFilmTexture(geometry.arte.imagen, geometry.arte.recorte, geometry.arte.encuadre, Boolean(geometry.arte.invertido), (texture) => {
        const previous = filmMesh.material;
        filmMesh.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
        previous.dispose();
      });
    }

    const zFront = (profundidad / 2) * scale + 0.03;
    const toWorld = (p, z = zFront) => new THREE.Vector3(p.x * scale, p.y * scale, z);

    // ── CAPA: MAPEO DEL DISEÑO ──
    const capaMapeo = new THREE.Group();
    capaMapeo.add(overlayLine(loop.pts.map((p) => toWorld(p)), COLOR_MAPEO));
    const locations = { A: loop.pts[1], B: loop.pts[2], C: loop.pts[3], D: loop.pts[4], E: loop.pts[5], F: loop.pts[6] };
    Object.entries(locations).forEach(([key, p]) => {
      const position = toWorld(p);
      capaMapeo.add(overlayDot(position, COLOR_MAPEO, 0.05));
      const label = createLabelSprite(`${key}  ${Number(geometry.puntos?.[key] ?? 0).toFixed(1)} mm`);
      const horizontal = ['A', 'B', 'C'].includes(key) ? -0.92 : 0.92;
      const vertical = key === 'A' || key === 'F' ? 0.18 : key === 'C' || key === 'D' ? 0.28 : 0;
      label.position.set(position.x + horizontal, position.y + vertical, zFront + 0.04);
      capaMapeo.add(label);
    });
    capaMapeo.add(overlayDot(toWorld({ x: 0, y: 0 }), COLOR_SS, 0.06));
    const ssLabel = createLabelSprite('S/SS', COLOR_SS);
    ssLabel.scale.set(0.8, 0.2, 1);
    ssLabel.position.set(0, 0.55, zFront + 0.05);
    capaMapeo.add(ssLabel);
    pack.add(capaMapeo);

    // ── CAPA: SOLAPE ──
    const capaSolape = new THREE.Group();
    if (solape > 0) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(solape * scale, profundidad * scale),
        new THREE.MeshBasicMaterial({ color: COLOR_SOLAPE, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, -0.012, 0);
      strip.renderOrder = 9;
      capaSolape.add(strip);
      const outline = overlayLine([
        new THREE.Vector3(-solape * scale / 2, -0.012, -profundidad * scale / 2),
        new THREE.Vector3(solape * scale / 2, -0.012, -profundidad * scale / 2),
        new THREE.Vector3(solape * scale / 2, -0.012, profundidad * scale / 2),
        new THREE.Vector3(-solape * scale / 2, -0.012, profundidad * scale / 2),
      ], COLOR_SOLAPE, { loop: true });
      capaSolape.add(outline);
    }
    // Cota del solape en la cara trasera para no pisar las cotas del lado A frontal.
    dimension(
      capaSolape,
      new THREE.Vector3(-solape * scale / 2, -0.012, -zFront - 0.12),
      new THREE.Vector3(solape * scale / 2, -0.012, -zFront - 0.12),
      COLOR_SOLAPE,
      `Solape ${solape.toFixed(1)} mm`,
      new THREE.Vector3(0, 0.3, -0.35)
    );
    pack.add(capaSolape);

    // ── CAPA: OREJAS (sobre la cara del lado A) ──
    const capaOrejas = new THREE.Group();
    const alt = geometry.alt;
    const orejaInf = Number(geometry.orejaInf ?? 0);
    const orejaSup = Number(geometry.orejaSup ?? 0);
    const xCota = hueco.length ? hueco.reduce((sum, p) => sum + p.x, 0) / hueco.length : 0;
    const zCota = zFront + 0.06;
    dimension(capaOrejas, toWorld({ x: xCota, y: 0 }, zCota), toWorld({ x: xCota, y: orejaInf }, zCota), COLOR_OREJA,
      `Oreja inf ${orejaInf.toFixed(1)} mm`, new THREE.Vector3(0, -0.45, 0.1));
    dimension(capaOrejas, toWorld({ x: xCota, y: alt - orejaSup }, zCota), toWorld({ x: xCota, y: alt }, zCota), COLOR_OREJA,
      `Oreja sup ${orejaSup.toFixed(1)} mm`, new THREE.Vector3(-0.25, 0.6, 0.04));
    if (hueco.length) {
      capaOrejas.add(overlayLine(hueco.map((p) => toWorld(p, zCota)), COLOR_OREJA, { dashed: true, loop: true }));
    }
    if (oreja > 0) {
      const xLado = (-ancho / 2) * scale - 0.06;
      dimension(capaOrejas,
        new THREE.Vector3(xLado, 0.01, (profundidad / 2) * scale),
        new THREE.Vector3(xLado, 0.01, (profundidad / 2 + oreja) * scale),
        COLOR_OREJA,
        `Oreja ${oreja.toFixed(1)} mm`,
        new THREE.Vector3(-0.85, 0.2, 0));
    }
    pack.add(capaOrejas);

    controlsRef.current = {
      setView,
      setContraccion: (t) => film.update(Math.min(Math.max(t, 0), 1)),
      setCapas: ({ mapeo = true, solape: verSolape = true, orejas = true } = {}) => {
        capaMapeo.visible = mapeo;
        capaSolape.visible = verSolape;
        capaOrejas.visible = orejas;
      },
    };

    let frame;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = Math.max(mount.clientWidth, 320);
      const nextHeight = Math.max(mount.clientHeight, 420);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      camaraRef.current = { position: camera.position.clone(), target: controls.target.clone() };
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      controlsRef.current = null;
      mount.replaceChildren();
    };
  }, [geometry]);

  useEffect(() => {
    controlsRef.current?.setContraccion(contraccion);
  }, [geometry, contraccion]);

  useEffect(() => {
    controlsRef.current?.setCapas(capas);
  }, [geometry, capas]);

  useEffect(() => {
    if (resetToken > 0) controlsRef.current?.setView(vista);
  }, [resetToken, vista]);

  return <div ref={mountRef} className="pack-3d-canvas" aria-label="Visualizador 3D del pack con film, orejas y solape" />;
}
