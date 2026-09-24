// ─── MODELO DE TERMOCONTRACCIÓN ────────────────────────────────────────────────
// Modelo simplificado (a ojo) de cómo se cierra la oreja sobre la cara abierta
// del pack (lado A) al pasar por el horno.
//
// - La oreja (margen de film que sobresale del pack en cada cara abierta) se
//   dobla sobre la cara. Su ancho útil se reduce por la contracción TRANSVERSAL.
// - El borde de la oreja tiene que achicarse desde el perímetro de la cara hasta
//   el perímetro del hueco: eso lo limita la contracción LONGITUDINAL del film.
// - El hueco resultante es la silueta de la cara "encogida" hacia adentro una
//   distancia igual a la cobertura de la oreja.

const EPS = 1e-9;

export function polygonArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function polygonPerimeter(poly) {
  let total = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// Silueta de la cara abierta en mm, antihoraria. x = sentido de corte (desde A), y = altura.
export function facePolygon({ ancho, dia, tapa, alt, altCil }) {
  const inset = Math.max(0, (dia - tapa) / 2);
  const cuerpo = Math.min(Math.max(altCil, 0), alt);
  return [
    { x: 0, y: 0 },
    { x: ancho, y: 0 },
    { x: ancho, y: cuerpo },
    { x: ancho - inset, y: alt },
    { x: inset, y: alt },
    { x: 0, y: cuerpo },
  ];
}

// Polígono convexo desplazado hacia adentro una distancia d (recorte por semiplanos).
export function insetPolygon(poly, d) {
  let out = poly.map((p) => ({ ...p }));
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey);
    if (len < EPS) continue;
    const nx = -ey / len;
    const ny = ex / len;
    const side = (v) => nx * (v.x - p.x) + ny * (v.y - p.y) - d;
    const next = [];
    for (let j = 0; j < out.length; j += 1) {
      const a = out[j];
      const b = out[(j + 1) % out.length];
      const fa = side(a);
      const fb = side(b);
      if (fa >= 0) next.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    out = next;
    if (out.length < 3) return [];
  }
  return polygonArea(out) > 1e-6 ? out : [];
}

export function simularOreja({ face, oreja, contraccionMD, contraccionTD }) {
  const perimetroCara = polygonPerimeter(face);
  const areaCara = polygonArea(face);
  const alt = Math.max(...face.map((p) => p.y));
  const sMD = Math.min(Math.max(contraccionMD / 100, 0), 0.99);
  const sTD = Math.min(Math.max(contraccionTD / 100, 0), 0.99);
  const coberturaLibre = Math.max(0, oreja) * (1 - sTD);

  const contraccionBorde = (d) => {
    const hole = insetPolygon(face, d);
    return 1 - (hole.length ? polygonPerimeter(hole) : 0) / perimetroCara;
  };

  let cobertura = coberturaLibre;
  let limitadaPorMD = false;
  if (contraccionBorde(cobertura) > sMD) {
    limitadaPorMD = true;
    let lo = 0;
    let hi = cobertura;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (contraccionBorde(mid) > sMD) hi = mid;
      else lo = mid;
    }
    cobertura = lo;
  }

  const hueco = insetPolygon(face, cobertura);
  const areaHueco = hueco.length ? polygonArea(hueco) : 0;
  const ys = hueco.map((p) => p.y);
  const xs = hueco.map((p) => p.x);
  return {
    oreja: Math.max(0, oreja),
    cobertura,
    coberturaLibre,
    sobrante: Math.max(0, coberturaLibre - cobertura),
    limitadaPorMD,
    hueco,
    areaCara,
    areaHueco,
    ratioHueco: areaCara > 0 ? areaHueco / areaCara : 0,
    huecoAncho: hueco.length ? Math.max(...xs) - Math.min(...xs) : 0,
    huecoAlto: hueco.length ? Math.max(...ys) - Math.min(...ys) : 0,
    orejaInf: hueco.length ? Math.min(...ys) : alt / 2,
    orejaSup: hueco.length ? alt - Math.max(...ys) : alt / 2,
    contraccionBorde: contraccionBorde(cobertura),
    contraccionTD: sTD,
  };
}

// Sobrante de oreja (mm) a partir del cual el film ya no contrae y se arruga.
export const SOBRANTE_EXCESO = 10;

export function evaluarEstructura(sim, { huecoObjetivo, huecoMaximo }) {
  const pct = sim.ratioHueco * 100;
  if (sim.oreja <= 0) return { estado: 'debil', texto: 'Sin oreja' };
  if (pct > huecoMaximo) return { estado: 'debil', texto: 'Débil' };
  if (sim.sobrante > SOBRANTE_EXCESO) return { estado: 'exceso', texto: 'Sobra film' };
  if (pct > huecoObjetivo) return { estado: 'justo', texto: 'Justo' };
  return { estado: 'ok', texto: 'Bien' };
}

const redondearArriba = (valor, paso) => Math.ceil(valor / paso - 1e-9) * paso;

// Barre anchos de oreja y devuelve la curva hueco% vs bobina y el rango recomendado.
export function analizarBobina({ face, anchoPaquete, canales, contraccionMD, contraccionTD, huecoObjetivo, huecoMaximo }) {
  const alt = Math.max(...face.map((p) => p.y));
  const maxOreja = Math.max(alt * 1.4, 60);
  const curva = [];
  let orejaMin = null;
  let orejaRecomendada = null;
  let orejaExceso = null;
  for (let oreja = 0; oreja <= maxOreja + EPS; oreja += 1) {
    const sim = simularOreja({ face, oreja, contraccionMD, contraccionTD });
    const pct = sim.ratioHueco * 100;
    curva.push({ oreja, bobina: (anchoPaquete + 2 * oreja) * canales, hueco: pct });
    if (orejaMin === null && oreja > 0 && pct <= huecoMaximo) orejaMin = oreja;
    if (orejaRecomendada === null && oreja > 0 && pct <= huecoObjetivo) orejaRecomendada = oreja;
    if (orejaExceso === null && sim.sobrante > SOBRANTE_EXCESO) orejaExceso = oreja;
  }
  const bobina = (oreja) => (oreja === null ? null : (anchoPaquete + 2 * oreja) * canales);
  const recomendada = bobina(orejaRecomendada);
  return {
    curva,
    bobinaMin: bobina(orejaMin),
    bobinaRecomendada: recomendada === null ? null : redondearArriba(recomendada, 5 * canales),
    bobinaMax: bobina(orejaExceso),
    orejaMin,
    orejaRecomendada,
    orejaExceso,
  };
}
