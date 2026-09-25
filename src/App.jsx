import React, { useState, useEffect, useMemo } from 'react';
import Pack3D from './Pack3D';
import BobinaOptima from './BobinaOptima';
import ArtePreview from './ArtePreview';
import ZoomableSvg from './ZoomableSvg';
import NumberInput from './NumberInput';
import { facePolygon, simularOreja, evaluarEstructura, analizarBobina } from './shrinkModel';

// ─── SMALL COMPONENTS ──────────────────────────────────────────────────────────

function SectionHeader({ num, label }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2"
         style={{ borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
      <span className="text-[9px] font-mono font-black text-white bg-[#E61C24] px-1.5 py-0.5 leading-none">
        {num}
      </span>
      <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-[3px]">{label}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[8px] font-mono font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
      {children}
    </div>
  );
}

const inp = "w-full bg-white border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-[#E61C24] rounded-none transition-colors";
const inpRed = "w-full bg-red-50 border border-[#E61C24] px-2 py-1.5 text-sm font-mono font-bold text-[#CC0000] focus:outline-none rounded-none";
const inpAmber = "w-full bg-amber-50 border border-amber-400 px-2 py-1.5 text-sm font-mono font-bold text-amber-800 focus:outline-none rounded-none";

// ─── TOGGLE BUTTON PAIR ────────────────────────────────────────────────────────
function Toggle({ value, onChange, options }) {
  return (
    <div className="flex" style={{ border: '1px solid #d1d5db' }}>
      {options.map(({ val, label }) => (
        <button key={val} onClick={() => onChange(val)}
          className="flex-1 py-1.5 text-[10px] font-mono font-bold transition-colors"
          style={{
            background: value === val ? '#111111' : '#ffffff',
            color:      value === val ? '#ffffff' : '#6b7280',
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── VALIDATION ────────────────────────────────────────────────────────────────
function validate(f) {
  const warns = [];
  if (f.altCil > f.alt) warns.push('La altura del cuerpo recto no puede superar la altura total.');
  if (f.tapa >= f.dia) warns.push('El diámetro de tapa debe ser menor al diámetro de botella.');
  if (f.ladoA < 1 || f.ladoB < 1) warns.push('La disposición mínima es 1 × 1.');
  if (f.micron < 30) warns.push('El espesor es menor a 30 µm.');
  if (!f.entraEnCanal) warns.push(`El paquete requiere ${f.anchoPaquete.toFixed(1)} mm por canal y solo hay ${f.canal.toFixed(1)} mm.`);
  if (f.solape < 0) warns.push(`El largo de corte no cierra el perfil: faltan ${Math.abs(f.solape).toFixed(1)} mm de solape.`);
  if (f.entraEnCanal && f.estructura.estado === 'debil') warns.push(`Oreja insuficiente: el hueco del lado A queda en ${(f.ratioHueco * 100).toFixed(0)}% de la cara.`);
  return warns;
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {

  // ── INPUTS ── (default: BNQ 500 ×12 / 4×3, termo cristal)
  const [ladoA,    setLadoA]    = useState(3);      // lado CORTO (top del perfil)
  const [ladoB,    setLadoB]    = useState(4);      // lado LARGO (vertical, ancho bobina)
  const [dia,      setDia]      = useState(70.5);   // Ø botella cuerpo (mm)
  const [alt,      setAlt]      = useState(210);    // altura total botella (mm)
  const [altCil,   setAltCil]   = useState(105); // altura hasta el hombro (mm)
  const [tapa,     setTapa]     = useState(26.2);   // Ø tapa superior (mm)
  const [micron,   setMicron]   = useState(50);     // espesor film (µm)
  const [canales,  setCanales]  = useState(1);      // canales del horno
  const [modoBobina, setModoBobina] = useState('auto');   // auto = bobina óptima calculada
  const [bobinaManual, setBobinaManual] = useState(415);  // ancho de bobina manual (mm)
  const [rapport,      setRapport]      = useState(880);  // largo de corte manual (mm)
  const [modoCorte, setModoCorte] = useState('auto');
  const [solapeDeseado, setSolapeDeseado] = useState(50); // solape S/SS en el fondo (mm)
  const [contraccionMD, setContraccionMD] = useState(50); // % contracción longitudinal del film
  const [contraccionTD, setContraccionTD] = useState(20); // % contracción transversal del film
  const [huecoObjetivo, setHuecoObjetivo] = useState(35); // % de la cara lado A
  const [huecoMaximo, setHuecoMaximo] = useState(55);     // % de la cara lado A
  const [orientacion, setOrientacion] = useState('normal');
  const [tipoFilm, setTipoFilm] = useState('cristal');
  const [producto, setProducto] = useState('BNQ 500 ×12');
  const [cliente,  setCliente]  = useState('');

  // UI
  const [configs,  setConfigs]  = useState([]);
  const [cfgName,  setCfgName]  = useState('');
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [geometry3D, setGeometry3D] = useState(null);
  const [reset3DToken, setReset3DToken] = useState(0);
  const [contraccion3D, setContraccion3D] = useState(100);
  const [capas3D, setCapas3D] = useState({ mapeo: true, solape: true, orejas: true });
  const [vista3D, setVista3D] = useState('iso');
  const [arteImagen, setArteImagen] = useState(null);
  const [arteNombre, setArteNombre] = useState('');
  const [arteLargo, setArteLargo] = useState(1049);
  const [arteAncho, setArteAncho] = useState(320);
  const [arteOffset, setArteOffset] = useState(0);
  const [arteInvertido, setArteInvertido] = useState(false);
  const [arteRecorte, setArteRecorte] = useState({ izquierda: 11.4, derecha: 11.4, superior: 11.5, inferior: 12 });
  const [arteEncuadre, setArteEncuadre] = useState({ izquierda: 0, derecha: 0, superior: 0, inferior: 0 });
  const [arteMapeo, setArteMapeo] = useState('calculado'); // calculado | plano
  const [arteTramos, setArteTramos] = useState(null);      // tramos del plano: Inicio-A … F-Final (mm)

  // ── CÁLCULOS ──
  // La orientación define qué cantidad queda sobre el ancho de bobina.
  const botellasCorte = orientacion === 'normal' ? ladoA : ladoB;
  const botellasBobina = orientacion === 'normal' ? ladoB : ladoA;
  const largoPaquete = botellasCorte * dia;
  const anchoPaquete = botellasBobina * dia;

  // ── BOBINA: automática (óptima según la camada) o manual ──
  const cara = useMemo(
    () => facePolygon({ ancho: largoPaquete, dia, tapa, alt, altCil }),
    [largoPaquete, dia, tapa, alt, altCil]
  );
  const analisisBobina = useMemo(
    () => analizarBobina({ face: cara, anchoPaquete, canales, contraccionMD, contraccionTD, huecoObjetivo, huecoMaximo }),
    [cara, anchoPaquete, canales, contraccionMD, contraccionTD, huecoObjetivo, huecoMaximo]
  );
  const bobinaAuto = analisisBobina.bobinaRecomendada ?? analisisBobina.bobinaMin ?? bobinaManual;
  const folienbreite = modoBobina === 'auto' ? bobinaAuto : bobinaManual;
  const elegirBobina = (valor) => {
    setBobinaManual(Math.round(valor * 10) / 10);
    setModoBobina('manual');
  };

  const canal = folienbreite / canales;
  const margenBruto = (canal - anchoPaquete) / 2;
  const entraEnCanal = margenBruto >= 0;
  const oreja = Math.max(0, margenBruto);
  const deficitCanal = Math.max(0, anchoPaquete - canal);
  const anchoBobinaMinimo = anchoPaquete * canales;

  // El film recorre el pack en el sentido de corte: fondo = largo del pack (lado A).
  const anchoTop = (botellasCorte - 1) * dia + tapa;
  const desplazamientoHombro = Math.max(0, (dia - tapa) / 2);
  const alturaHombro = Math.max(0, alt - altCil);
  const longitudHombro = Math.sqrt(alturaHombro ** 2 + desplazamientoHombro ** 2);
  const perfilGeometrico = largoPaquete + 2 * altCil + 2 * longitudHombro + anchoTop;
  const largoCorteCalculado = perfilGeometrico + solapeDeseado;
  const corte = modoCorte === 'auto' ? largoCorteCalculado : rapport;
  const diferenciaCorte = corte - perfilGeometrico; // solape efectivo S/SS
  const ajustePorExtremo = diferenciaCorte / 2;

  // Mapeo desde el inicio del film: el solape queda centrado en el fondo (S/SS).
  const ptA = largoPaquete / 2 + ajustePorExtremo;
  const ptB = ptA + altCil;
  const ptC = ptB + longitudHombro;
  const ptD = ptC + anchoTop;
  const ptE = ptD + longitudHombro;
  const ptF = ptE + altCil;
  const pts = { A: ptA, B: ptB, C: ptC, D: ptD, E: ptE, F: ptF };

  // ── ARTE: posiciones Inicio-A-B-C-D-E-F-Final en el film (calculadas) y en el plano ──
  const knotsGeo = [0, ptA, ptB, ptC, ptD, ptE, ptF, corte];
  const tramosCalculados = knotsGeo.slice(1).map((k, i) => k - knotsGeo[i]);
  const usarPlano = arteMapeo === 'plano' && arteTramos;
  const arteLargoEfectivo = usarPlano ? arteTramos.reduce((a, b) => a + b, 0) : arteLargo;
  const knotsPlano = usarPlano
    ? arteTramos.reduce((acc, tramo) => [...acc, acc[acc.length - 1] + tramo], [0])
    : knotsGeo.map((k) => (corte > 0 ? (k * arteLargo) / corte : k));
  const elegirMapeoArte = (modo) => {
    if (modo === 'plano' && !arteTramos) setArteTramos(tramosCalculados.map((t) => Math.round(t * 10) / 10));
    setArteMapeo(modo);
  };

  // Alias usados por los planos SVG existentes.
  const ladoLargo = anchoPaquete;
  const ladoTop = largoPaquete;
  const packT = anchoPaquete;
  const packL = largoPaquete;
  const bobTotal = folienbreite;
  const perimetro = perfilGeometrico;
  const solape = diferenciaCorte;
  const solapeLado = ajustePorExtremo;

  // ── TERMOCONTRACCIÓN Y ESTRUCTURA (cara abierta = lado A) ──
  const criterio = { huecoObjetivo, huecoMaximo };
  const simActual = useMemo(
    () => simularOreja({ face: cara, oreja, contraccionMD, contraccionTD }),
    [cara, oreja, contraccionMD, contraccionTD]
  );
  const estructura = evaluarEstructura(simActual, criterio);
  // Comparativa del pack actual con distintos anchos de bobina.
  const comparativaBobinas = useMemo(() => {
    const base = anchoPaquete * canales;
    const { bobinaMin, bobinaMax, bobinaRecomendada } = analisisBobina;
    let paso = 10 * canales;
    const desde = Math.max(base, (bobinaMin ?? base) - 2 * paso);
    const hasta = Math.max(bobinaMax ?? (bobinaRecomendada ?? base) + 150, folienbreite) + 2 * paso;
    while ((hasta - desde) / paso > 14) paso *= 2;
    const valores = new Set();
    for (let v = Math.ceil(desde / paso) * paso; v <= hasta; v += paso) valores.add(v);
    [folienbreite, bobinaRecomendada, bobinaMin, bobinaMax].forEach((v) => {
      if (v !== null && v !== undefined) valores.add(Math.round(v * 10) / 10);
    });
    return [...valores].sort((a, b) => a - b).map((bobina) => {
      const orejaFila = (bobina / canales - anchoPaquete) / 2;
      const sim = simularOreja({ face: cara, oreja: Math.max(0, orejaFila), contraccionMD, contraccionTD });
      const etiquetas = [];
      if (Math.abs(bobina - folienbreite) < 0.05) etiquetas.push('actual');
      if (bobina === bobinaRecomendada) etiquetas.push('recomendada');
      if (bobina === bobinaMin) etiquetas.push('mínima');
      if (bobina === bobinaMax) etiquetas.push('sobra film');
      return {
        bobina,
        etiquetas,
        entra: orejaFila >= 0,
        oreja: orejaFila,
        sim,
        estructura: evaluarEstructura(sim, { huecoObjetivo, huecoMaximo }),
      };
    });
  }, [analisisBobina, anchoPaquete, canales, cara, folienbreite, contraccionMD, contraccionTD, huecoObjetivo, huecoMaximo]);

  const warnings = validate({ altCil, alt, tapa, dia, ladoA, ladoB, micron, entraEnCanal, anchoPaquete, canal, solape: diferenciaCorte, estructura, ratioHueco: simActual.ratioHueco });

  // El 3D se genera con el botón; se avisa cuando los datos cambiaron desde la última vez.
  const geometryValida = ladoA >= 1 && ladoB >= 1 && dia > 0 && alt > 0 && altCil >= 0 && altCil <= alt && tapa > 0 && tapa < dia;
  const geometriaActual = useMemo(() => {
    if (!geometryValida) return null;
    return {
      ladoA, ladoB, dia, alt, altCil, tapa, canales, orientacion, tipoFilm,
      botellasCorte, botellasBobina,
      anchoCara: largoPaquete,
      profundidad: anchoPaquete,
      puntos: pts,
      largoCorte: corte,
      anchoBobina: folienbreite,
      solape: diferenciaCorte,
      oreja,
      hueco: simActual.hueco,
      orejaSup: simActual.orejaSup,
      orejaInf: simActual.orejaInf,
      arte: tipoFilm === 'arte' && arteImagen ? {
        imagen: arteImagen,
        nombre: arteNombre,
        largo: arteLargoEfectivo,
        ancho: arteAncho,
        knotsGeo,
        knotsPlano,
        offset: arteOffset,
        invertido: arteInvertido,
        recorte: arteRecorte,
        encuadre: arteEncuadre,
      } : null,
    };
    // pts no va en las dependencias: se recalcula de los mismos datos (disposición y corte).
  }, [geometryValida, ladoA, ladoB, dia, alt, altCil, tapa, canales, orientacion, tipoFilm, corte, folienbreite, oreja, simActual, arteImagen, arteNombre, arteLargoEfectivo, arteAncho, arteOffset, arteInvertido, arteRecorte, arteEncuadre, arteMapeo, arteTramos]);

  const cambios3DPendientes = Boolean(geometriaActual && geometry3D && geometriaActual !== geometry3D);
  const actualizar3D = () => {
    if (geometriaActual) setGeometry3D(geometriaActual);
  };

  // ── CONFIG PERSISTENCE ──
  const applyConfig = (p) => {
    setLadoA(p.ladoA ?? p.N ?? p.botL ?? 3);
    setLadoB(p.ladoB ?? p.M ?? p.botT ?? 4);
    setDia(p.dia);       setAlt(p.alt);     setAltCil(p.altCil);
    setTapa(p.tapa);     setMicron(p.micron); setCanales(p.canales);
    setBobinaManual(p.folienbreite ?? p.bobinaM ?? p.bobina ?? 415);
    setModoBobina(p.modoBobina ?? 'manual');
    setRapport(p.rapport ?? p.pasoArte ?? p.paso ?? 880);
    setTipoFilm(p.tipoFilm ?? p.tf ?? 'cristal');
    setModoCorte(p.modoCorte ?? 'auto');
    setOrientacion(p.orientacion ?? 'normal');
    setSolapeDeseado(p.solape ?? 50);
    setArteMapeo(p.arteMapeo ?? 'calculado');
    setArteTramos(p.arteTramos ?? null);
    setContraccionMD(p.contraccionMD ?? 50);
    setContraccionTD(p.contraccionTD ?? 20);
    setHuecoObjetivo(p.huecoObjetivo ?? 35);
    setHuecoMaximo(p.huecoMaximo ?? 55);
  };

  const saveConfig = () => {
    if (!cfgName.trim()) return;
    const c = {
      n: cfgName, t: new Date().toLocaleDateString('es-AR'),
      ladoA, ladoB, dia, alt, altCil, tapa, micron, canales,
      folienbreite, rapport, tipoFilm, modoCorte, orientacion,
      arteMapeo, arteTramos,
      modoBobina, solape: solapeDeseado, contraccionMD, contraccionTD, huecoObjetivo, huecoMaximo,
    };
    const nc = [...configs, c];
    setConfigs(nc);
    setCfgName(''); setShowSave(false);
  };

  const deleteCfg = (i) => {
    const nc = configs.filter((_, j) => j !== i);
    setConfigs(nc);
  };

  const handleArteFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setArteImagen(String(reader.result));
      setArteNombre(file.name);
    };
    reader.readAsDataURL(file);
  };

  // ── SVG PLAN VIEW ──
  const ML = 95, MR = 90, MT = 50, MB = 60;
  const packXStart = (corte - ladoTop) / 2;
  const today = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });


  // Perfil lateral: A y F en los bordes del pack (interno), S/SS en el centro del fondo
  // El solape es el tramo extra que va FUERA de A y F (hacia el centro, por debajo)
  const sideFilmParts = [
    `M ${ladoTop / 2} ${alt}`,          // S/SS: centro del fondo
    `L 0 ${alt}`,                        // borde izquierdo del pack (= punto A)
    `L 0 ${alt - altCil}`,               // sube lateral hasta hombro (= punto B)
  ];
  for (let i = 0; i < botellasCorte; i++) {
    const neckLeft  = i * dia + (dia - tapa) / 2;
    const neckRight = i * dia + (dia + tapa) / 2;
    sideFilmParts.push(`L ${neckLeft} 0`);   // punto C (i=0)
    sideFilmParts.push(`L ${neckRight} 0`);
  }
  sideFilmParts.push(`L ${ladoTop} ${alt - altCil}`);   // punto E
  sideFilmParts.push(`L ${ladoTop} ${alt}`);             // punto F: borde derecho
  sideFilmParts.push(`L ${ladoTop / 2} ${alt}`);         // vuelve al S/SS
  const sideFilmPath = sideFilmParts.join(' ');

  // Tramos de solape (se dibujan separados, punteados, desde A y F hacia el centro)
  const solapeVisible = Math.max(0, Math.min(solape, ladoTop));
  const solapePath = `M ${ladoTop/2 - solapeVisible/2} ${alt + 5} L ${ladoTop/2 + solapeVisible/2} ${alt + 5}`;

  const sidePoints = [
    ['A', 0,                                    alt,          -1],
    ['B', 0,                                    alt - altCil, -1],
    ['C', (dia - tapa) / 2,                     0,            -1],
    ['D', (botellasCorte - 1) * dia + (dia + tapa) / 2, 0,             1],
    ['E', ladoTop,                              alt - altCil,  1],
    ['F', ladoTop,                              alt,           1],
  ];

  // ── RENDER ──
  return (
    <div className="app-shell min-h-screen p-4">
      <div className="max-w-[1500px] mx-auto">

        {/* ══ DRAWING SHEET ══════════════════════════════════════════════════════ */}
        <div className="print-sheet bg-white">

          {/* ── HEADER ── */}
          <div className="no-print" style={{ borderBottom: '2px solid #111' }}>
            <div className="flex items-stretch flex-wrap">

              {/* Logo Coca-Cola style */}
              <div className="flex items-center gap-0" style={{ borderRight: '2px solid #111' }}>
                <div className="px-5 py-3" style={{ background: '#E61C24' }}>
                  <div className="text-2xl font-black text-white leading-none tracking-tight">LAB</div>
                  <div className="text-2xl font-black text-white leading-none tracking-tight">TERMO</div>
                </div>
                <div className="px-4 py-3 bg-white">
                  <div className="text-[8px] font-mono text-gray-400 uppercase tracking-[4px]">Film</div>
                  <div className="text-[8px] font-mono text-gray-400 uppercase tracking-[4px]">Termocontraíble</div>
                  <div className="text-[8px] font-mono text-gray-400 uppercase tracking-[4px]">Calculador</div>
                </div>
              </div>

              {/* Save/Load */}
              <div className="px-4 py-2 flex flex-col justify-center" style={{ borderRight: '1px solid #e5e5e5' }}>
                <div className="text-[8px] font-mono text-gray-400 uppercase tracking-wider mb-1.5">Configuraciones</div>
                <div className="flex gap-1">
                  <button onClick={() => { setShowSave(!showSave); setShowLoad(false); }}
                    className="px-2.5 py-1 text-[10px] font-mono font-bold transition-colors"
                    style={{ border: '1px solid #16a34a', color: '#16a34a', background: '#fff' }}>
                    + Guardar
                  </button>
                  <button onClick={() => { setShowLoad(!showLoad); setShowSave(false); }}
                    className="px-2.5 py-1 text-[10px] font-mono font-bold transition-colors"
                    style={{ border: '1px solid #2563eb', color: '#2563eb', background: '#fff' }}>
                    Cargar ({configs.length})
                  </button>
                </div>
              </div>

              {/* Print */}
              <div className="px-4 py-2 flex items-center ml-auto">
                <button onClick={() => window.print()}
                  className="px-4 py-2 text-[10px] font-mono font-bold text-white transition-colors"
                  style={{ background: '#111', border: '1px solid #111' }}>
                  ▤ IMPRIMIR / PDF
                </button>
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="px-4 py-2 flex gap-3 items-center flex-wrap"
                   style={{ background: '#fff7ed', borderTop: '1px solid #fed7aa' }}>
                <span className="text-[9px] font-mono font-black text-amber-700 uppercase tracking-wider">⚠ Advertencias:</span>
                {warnings.map((w, i) => (
                  <span key={i} className="text-[9px] font-mono text-amber-700 border border-amber-300 px-2 py-0.5 bg-white">{w}</span>
                ))}
              </div>
            )}

            {/* Save dialog */}
            {showSave && (
              <div className="px-4 py-2 flex gap-2 items-center flex-wrap"
                   style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
                <span className="text-[10px] font-mono text-gray-600">Nombre:</span>
                <input value={cfgName} onChange={e => setCfgName(e.target.value)}
                  placeholder="ej: CC 3×2 PET Córdoba"
                  onKeyDown={e => e.key === 'Enter' && saveConfig()}
                  className="border border-gray-400 px-2 py-1 text-sm font-mono w-64 focus:outline-none" />
                <button onClick={saveConfig}
                  className="px-3 py-1 text-white text-[10px] font-mono font-bold"
                  style={{ background: '#16a34a' }}>Guardar</button>
                <button onClick={() => setShowSave(false)}
                  className="px-3 py-1 text-white text-[10px] font-mono"
                  style={{ background: '#9ca3af' }}>×</button>
              </div>
            )}

            {/* Load dialog */}
            {showLoad && (
              <div className="px-4 py-2" style={{ background: '#eff6ff', borderTop: '1px solid #bfdbfe' }}>
                {configs.length === 0
                  ? <span className="text-[10px] font-mono text-gray-500">Sin configuraciones guardadas.</span>
                  : <div className="flex flex-wrap gap-2">
                      {configs.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white px-2 py-1"
                             style={{ border: '1px solid #bfdbfe' }}>
                          <button onClick={() => { applyConfig(c); setShowLoad(false); }}
                            className="text-[10px] font-mono text-blue-700 hover:text-blue-900">
                            {c.n} <span className="text-gray-400 text-[9px]">({c.t})</span>
                          </button>
                          <button onClick={() => deleteCfg(i)}
                            className="text-red-400 hover:text-red-600 text-xs leading-none">✕</button>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}
          </div>

          {/* ── BODY ── */}
          <div className="workspace-grid">

            {/* ─────────── LEFT — INPUTS ─────────── */}
            <div style={{ borderRight: '2px solid #111', background: '#fafafa' }}>

              {/* 01 DISPOSICIÓN */}
              <div style={{ borderBottom: '1px solid #e5e5e5' }}>
                <SectionHeader num="01" label="Disposición" />
                <div className="p-3 space-y-2.5">
                  <Field label="Orientación del paquete sobre la bobina">
                    <Toggle value={orientacion} onChange={setOrientacion} options={[
                      { val:'normal', label:'LADO B SOBRE BOBINA' },
                      { val:'girada', label:'LADO A SOBRE BOBINA' },
                    ]} />
                    <div className="orientation-help">
                      Ancho usado: {botellasBobina} × {dia.toFixed(1)} = {anchoPaquete.toFixed(1)} mm
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Botellas del lado A">
                      <NumberInput min="1" max="30" value={ladoA} onChange={setLadoA} className={inp} />
                    </Field>
                    <Field label="Botellas del lado B">
                      <NumberInput min="1" max="30" value={ladoB} onChange={setLadoB} className={inp} />
                    </Field>
                  </div>
                  <Field label="Diámetro de botella (mm)">
                    <NumberInput step="0.1" min="1" max="400" value={dia} onChange={setDia} className={inp} />
                    <div className="text-[7px] font-mono text-gray-400 mt-0.5 leading-tight">
                      diámetro mayor = distancia entre centros
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Altura total (mm)">
                      <NumberInput step="0.1" min="1" max="1500" value={alt} onChange={setAlt} className={inp} />
                    </Field>
                    <Field label="Altura del cuerpo recto (mm)">
                      <NumberInput step="0.1" min="0" max="1500" value={altCil}
                        onChange={setAltCil}
                        className={altCil > alt ? `${inp} border-red-500 bg-red-50` : inp} />
                    </Field>
                  </div>
                  <Field label="Diámetro de tapa (mm)">
                    <NumberInput step="0.1" min="1" max="400" value={tapa} onChange={setTapa} className={inpRed} />
                  </Field>
                </div>
              </div>

              {/* 02 BOBINA */}
              <div style={{ borderBottom: '1px solid #e5e5e5' }}>
                <SectionHeader num="02" label="Datos de Bobina" />
                <div className="p-3 space-y-2.5">
                  <Field label="Ancho de bobina">
                    <Toggle value={modoBobina} onChange={(modo) => {
                      if (modo === 'manual' && modoBobina === 'auto') setBobinaManual(folienbreite);
                      setModoBobina(modo);
                    }} options={[
                      { val:'auto', label:'ÓPTIMA (AUTO)' },
                      { val:'manual', label:'MANUAL' },
                    ]} />
                  </Field>
                  {modoBobina === 'manual' ? (
                    <Field label="Ancho total de bobina (mm)">
                      <NumberInput step="0.5" min="1" max="5000" value={bobinaManual} onChange={setBobinaManual} className={inpAmber} />
                    </Field>
                  ) : (
                    <div className="calculated-hint">
                      Bobina óptima: <strong>{folienbreite.toFixed(0)} mm</strong>
                      <span>
                        {analisisBobina.bobinaRecomendada === null
                          ? 'No alcanza el hueco objetivo: se usa la bobina mínima aceptable.'
                          : `Oreja ${oreja.toFixed(1)} mm por lado · hueco ${(simActual.ratioHueco * 100).toFixed(1)}% de la cara`}
                      </span>
                    </div>
                  )}
                  <Field label="Cálculo del largo de corte">
                    <Toggle value={modoCorte} onChange={setModoCorte} options={[
                      { val:'auto', label:'AUTOMÁTICO' },
                      { val:'manual', label:'MANUAL' },
                    ]} />
                  </Field>
                  {modoCorte === 'manual' ? (
                    <>
                      <Field label="Largo de corte manual (mm)">
                        <NumberInput step="0.5" min="1" max="10000" value={rapport} onChange={setRapport} className={inpAmber} />
                      </Field>
                      <div className="calculated-hint">Solape resultante: <strong>{diferenciaCorte.toFixed(1)} mm</strong><span>Perfil geométrico: {perfilGeometrico.toFixed(1)} mm</span></div>
                    </>
                  ) : (
                    <>
                      <Field label="Solape S/SS (mm)">
                        <NumberInput step="1" min="0" max="500" value={solapeDeseado} onChange={setSolapeDeseado} className={inpAmber} />
                      </Field>
                      <div className="calculated-hint">Calculado: <strong>{largoCorteCalculado.toFixed(1)} mm</strong><span>Perfil {perfilGeometrico.toFixed(1)} mm + solape {solapeDeseado.toFixed(1)} mm</span></div>
                    </>
                  )}
                  <Field label="Horno">
                    <select value={canales} onChange={setCanales} className={inp}>
                      <option value={1}>Monocanal</option>
                      <option value={2}>Doble Canal</option>
                    </select>
                  </Field>
                </div>
              </div>

              {/* 03 MATERIAL */}
              <div style={{ borderBottom: '1px solid #e5e5e5' }}>
                <SectionHeader num="03" label="Material" />
                <div className="p-3 space-y-2.5">
                  <Toggle
                    value={tipoFilm}
                    onChange={setTipoFilm}
                    options={[{ val:'cristal', label:'CRISTAL' }, { val:'arte', label:'CON ARTE' }]}
                  />
                  <Field label="Espesor Film (µm)">
                    <NumberInput min="1" max="500" value={micron} onChange={setMicron} className={inp} />
                  </Field>
                  {tipoFilm === 'arte' && (
                    <div className="art-config-card">
                      <div className="art-config-title">
                        <strong>Arte del film</strong>
                        <span>La imagen es el plano completo del film (Inicio→Final). Cada tramo del plano se proyecta sobre su tramo del pack.</span>
                      </div>

                      <label className="art-upload-button">
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleArteFile} />
                        <span>{arteImagen ? 'Cambiar imagen' : 'Cargar imagen del arte'}</span>
                      </label>

                      {arteNombre && <div className="art-file-name">{arteNombre}</div>}

                      <div className="art-dimensions-grid">
                        <Field label="Largo del arte (mm)">
                          {usarPlano
                            ? <input type="number" value={arteLargoEfectivo.toFixed(1)} readOnly className={`${inp} bg-gray-100`} title="Suma de los tramos del plano" />
                            : <NumberInput step="0.5" min="1" max="10000" value={arteLargo} onChange={setArteLargo} className={inp} />}
                        </Field>
                        <Field label="Ancho del arte (mm)">
                          <NumberInput step="0.5" min="1" max="5000" value={arteAncho} onChange={setArteAncho} className={inp} />
                        </Field>
                      </div>

                      <Field label="Mapeo del arte">
                        <Toggle value={arteMapeo} onChange={elegirMapeoArte} options={[
                          { val:'calculado', label:'CALCULADO' },
                          { val:'plano', label:'SEGÚN PLANO' },
                        ]} />
                      </Field>
                      {usarPlano && (
                        <div className="art-plano-card">
                          <div className="art-plano-title">
                            <strong>Tramos del plano (mm)</strong>
                            <button type="button" onClick={() => setArteTramos(tramosCalculados.map((t) => Math.round(t * 10) / 10))}>Copiar calculados</button>
                          </div>
                          <div className="art-plano-grid">
                            {['Inicio–A', 'A–B', 'B–C', 'C–D', 'D–E', 'E–F', 'F–Final'].map((label, i) => (
                              <label key={label}>
                                <span>{label}</span>
                                <NumberInput step="0.5" min="0" max="5000" value={arteTramos[i]}
                                  onChange={(valor) => setArteTramos((actual) => actual.map((v, j) => (j === i ? valor : v)))} />
                                <small>calc. {tramosCalculados[i].toFixed(1)}</small>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <Field label="Desplazamiento horizontal (mm)">
                        <NumberInput step="1" min="-5000" max="5000" value={arteOffset} onChange={setArteOffset} className={inp} />
                      </Field>

                      <Toggle
                        value={arteInvertido ? 'si' : 'no'}
                        onChange={(value) => setArteInvertido(value === 'si')}
                        options={[{ val:'no', label:'SENTIDO NORMAL' }, { val:'si', label:'INVERTIR ARTE' }]}
                      />

                      <details className="art-crop-details">
                        <summary>Encuadre: bordes de la imagen que no son film</summary>
                        <div className="art-crop-grid">
                          {[['izquierda', 'Izquierda'], ['derecha', 'Derecha'], ['superior', 'Superior'], ['inferior', 'Inferior']].map(([key, label]) => (
                            <label key={key}>
                              <span>{label}</span>
                              <div>
                                <NumberInput min="0" max="45" step="0.1" value={arteEncuadre[key]}
                                  onChange={(valor) => setArteEncuadre((current) => ({ ...current, [key]: valor }))} />
                                <b>%</b>
                              </div>
                            </label>
                          ))}
                        </div>
                        <div className="orientation-help">Recortá reglas y cotas hasta que la imagen sea exactamente el film (Inicio→Final).</div>
                      </details>

                      <details className="art-crop-details">
                        <summary>Zona impresa del plano (recorte)</summary>
                        <div className="art-crop-grid">
                          {[
                            ['izquierda', 'Izquierda'],
                            ['derecha', 'Derecha'],
                            ['superior', 'Superior'],
                            ['inferior', 'Inferior'],
                          ].map(([key, label]) => (
                            <label key={key}>
                              <span>{label}</span>
                              <div>
                                <NumberInput
                                  min="0"
                                  max="45"
                                  step="0.5"
                                  value={arteRecorte[key]}
                                  onChange={(valor) => setArteRecorte((current) => ({ ...current, [key]: valor }))}
                                />
                                <b>%</b>
                              </div>
                            </label>
                          ))}
                        </div>
                      </details>

                      <div className={`art-match-status ${Math.abs(arteLargoEfectivo - corte) <= 1 ? 'ok' : 'warning'}`}>
                        <strong>{Math.abs(arteLargoEfectivo - corte) <= 1 ? 'Largo compatible' : 'Revisar largo del arte'}</strong>
                        <span>Arte: {arteLargoEfectivo.toFixed(1)} mm · Corte: {corte.toFixed(1)} mm · Diferencia: {(arteLargoEfectivo - corte).toFixed(1)} mm</span>
                      </div>
                      <div className={`art-match-status ${Math.abs(arteAncho - canal) <= 1 ? 'ok' : 'warning'}`}>
                        <strong>{Math.abs(arteAncho - canal) <= 1 ? 'Ancho compatible' : 'Revisar ancho del arte'}</strong>
                        <span>Arte: {arteAncho.toFixed(1)} mm · {canales > 1 ? 'Canal' : 'Bobina'}: {canal.toFixed(1)} mm · Diferencia: {(arteAncho - canal).toFixed(1)} mm</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 04 TERMOCONTRACCIÓN */}
              <div style={{ borderBottom: '1px solid #e5e5e5' }}>
                <SectionHeader num="04" label="Termocontracción" />
                <div className="p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Contracción long. (%)">
                      <NumberInput step="1" min="0" max="95" value={contraccionMD} onChange={setContraccionMD} className={inp} />
                    </Field>
                    <Field label="Contracción transv. (%)">
                      <NumberInput step="1" min="0" max="95" value={contraccionTD} onChange={setContraccionTD} className={inp} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Hueco objetivo (% cara)">
                      <NumberInput step="1" min="0" max="100" value={huecoObjetivo} onChange={setHuecoObjetivo} className={inp} />
                    </Field>
                    <Field label="Hueco máximo (% cara)">
                      <NumberInput step="1" min="0" max="100" value={huecoMaximo} onChange={setHuecoMaximo} className={inp} />
                    </Field>
                  </div>
                  <div className="orientation-help">
                    Valores a ojo hasta tener la ficha técnica del film. El hueco se mide sobre la cara abierta del lado A.
                  </div>
                </div>
              </div>
            </div>

            {/* ─────────── RIGHT — DRAWING ─────────── */}
            <div className="p-4 space-y-4 bg-white">

              {/* ── HERO NUMBERS ── */}
              <div className="results-grid">
                {[
                  {
                    label: 'ANCHO DE BOBINA',
                    value: folienbreite.toFixed(1),
                    sub:   canales > 1 ? `${canales} canales × ${canal.toFixed(1)} mm` : 'Monocanal',
                    accent: true,
                  },
                  {
                    label: 'LARGO DE CORTE',
                    value: corte.toFixed(1),
                    sub:   `${modoCorte === 'auto' ? 'Automático' : 'Manual'} · Perfil ${perfilGeometrico.toFixed(1)} mm`,
                    accent: false,
                  },
                  {
                    label: entraEnCanal ? 'MARGEN POR LADO' : 'DÉFICIT POR CANAL',
                    value: (entraEnCanal ? oreja : deficitCanal).toFixed(1),
                    sub: entraEnCanal ? 'Espacio libre por lado' : `Bobina mínima ${anchoBobinaMinimo.toFixed(1)} mm`,
                    accent: false,
                    green: true,
                  },
                  {
                    label: 'SOLAPE S/SS',
                    value: diferenciaCorte.toFixed(1),
                    sub:   `${ajustePorExtremo.toFixed(1)} mm por extremo`,
                    accent: false,
                    blue: true,
                  },
                ].map(({ label, value, sub, accent, green, blue }, i) => (
                  <div key={label} className={`result-card ${accent ? 'result-card-primary' : ''} ${green ? 'result-card-green' : ''} ${blue ? 'result-card-blue' : ''}`}>
                    <div className="result-label">{label}</div>
                    <div className="result-value">{value}</div>
                    <div>
                      <div className="result-detail">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`channel-status ${entraEnCanal ? 'channel-status-ok' : 'channel-status-error'}`}>
                <strong>{entraEnCanal ? 'Configuración compatible' : 'Configuración incompatible'}</strong>
                <span>{entraEnCanal ? `${canal.toFixed(1)} mm por canal · margen ${oreja.toFixed(1)} mm por lado` : `${canal.toFixed(1)} mm por canal · se necesitan ${anchoBobinaMinimo.toFixed(1)} mm de bobina total`}</span>
              </div>

              <BobinaOptima
                analisis={analisisBobina}
                sim={simActual}
                estructura={estructura}
                folienbreite={folienbreite}
                canales={canales}
                huecoObjetivo={huecoObjetivo}
                huecoMaximo={huecoMaximo}
                contraccionMD={contraccionMD}
                comparativa={comparativaBobinas}
                modoBobina={modoBobina}
                onElegirBobina={elegirBobina}
                onModoAuto={() => setModoBobina('auto')}
              />

              {/* ── PLAN VIEW SVG ── */}
              <div style={{ border: '1px solid #d1d5db' }}>
                <div className="px-3 py-1.5 flex justify-between items-center"
                     style={{ borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
                  <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-[3px]">
                    VISTA SUPERIOR — {canales === 1 ? 'Monocanal' : 'Doble Canal'} — Sentido horizontal
                  </span>
                  <span className="text-[8px] font-mono text-gray-400">
                    {corte.toFixed(0)} × {bobTotal.toFixed(0)} mm
                  </span>
                </div>
                <ZoomableSvg viewBox={{ x: -ML, y: -MT, w: corte + ML + MR, h: bobTotal + MT + MB }} maxHeight={340}>
                  <defs>
                    {[['mD','#1e293b'],['mB','#2563eb'],['mG','#059669'],['mR','#E61C24']].map(([id, fill]) => (
                      <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5"
                        markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={fill} />
                      </marker>
                    ))}
                    <pattern id="pg" width="25" height="25" patternUnits="userSpaceOnUse">
                      <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f0f0f0" strokeWidth="0.5" />
                    </pattern>
                  </defs>

                  <rect x={-ML} y={-MT} width={corte + ML + MR} height={bobTotal + MT + MB} fill="url(#pg)" />
                  <rect x={0} y={0} width={corte} height={bobTotal} fill="#fef2f2" stroke="#d1d5db" strokeWidth="0.5" />

                  {canales === 2 && <>
                    <line x1={0} y1={canal} x2={corte} y2={canal}
                      stroke="#2563eb" strokeWidth="1.5" strokeDasharray="8,5" />
                    <text x={corte * 0.62} y={canal - 5}
                      fill="#2563eb" fontSize="9" fontFamily="monospace" fontWeight="bold"
                      letterSpacing="1" textAnchor="middle">CORTE LONGITUDINAL</text>
                  </>}

                  {Array.from({ length: canales }).map((_, ci) => (
                    <g key={ci}>
                      <rect x={packXStart} y={ci * canal + oreja} width={ladoTop} height={ladoLargo}
                        fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="5,3" />
                      {Array.from({ length: botellasCorte }).map((_, xi) =>
                        Array.from({ length: botellasBobina }).map((_, yi) => (
                          <circle key={`${ci}-${xi}-${yi}`}
                            cx={packXStart + xi * dia + dia / 2}
                            cy={ci * canal + oreja + yi * dia + dia / 2}
                            r={Math.max(0.5, dia / 2 - 1.5)}
                            fill="white" stroke="#475569" strokeWidth="1.5" />
                        ))
                      )}
                    </g>
                  ))}

                  <line x1={0}     y1={-MT + 5} x2={0}     y2={bobTotal + 16} stroke="#E61C24" strokeWidth="2.5" />
                  <line x1={corte} y1={-MT + 5} x2={corte} y2={bobTotal + 16} stroke="#E61C24" strokeWidth="2" strokeDasharray="7,5" />
                  <text x={-8} y={bobTotal * 0.6} fill="#E61C24" fontSize="9" fontFamily="monospace" fontWeight="bold"
                    textAnchor="middle" transform={`rotate(-90, -8, ${bobTotal * 0.6})`}>SCHNITT ①</text>
                  <text x={corte + 8} y={bobTotal * 0.6} fill="#E61C24" fontSize="9" fontFamily="monospace" fontWeight="bold"
                    textAnchor="middle" transform={`rotate(-90, ${corte + 8}, ${bobTotal * 0.6})`}>SCHNITT ②</text>

                  <line x1={corte * 0.12} y1={-32} x2={corte * 0.88} y2={-32}
                    stroke="#475569" strokeWidth="1.5" markerEnd="url(#mD)" />
                  <text x={corte / 2} y={-37} fill="#475569" fontSize="9" textAnchor="middle"
                    fontFamily="monospace" letterSpacing="1.5">LAUFRICHTUNG / SENTIDO DE MARCHA</text>

                  {/* Left dimension lines */}
                  <line x1={-ML+5} y1={0}            x2={-8}  y2={0}            stroke="#ddd" strokeWidth="0.5" />
                  <line x1={-ML+5} y1={oreja}         x2={-44} y2={oreja}         stroke="#ddd" strokeWidth="0.5" />
                  <line x1={-ML+5} y1={oreja+packT}   x2={-44} y2={oreja+packT}   stroke="#ddd" strokeWidth="0.5" />
                  <line x1={-ML+5} y1={canal}         x2={-8}  y2={canal}         stroke="#ddd" strokeWidth="0.5" />
                  {canales === 2 && <line x1={-ML+5} y1={bobTotal} x2={-8} y2={bobTotal} stroke="#ddd" strokeWidth="0.5" />}

                  {oreja > 8 && <>
                    <line x1={-74} y1={0} x2={-74} y2={oreja}
                      stroke="#059669" strokeWidth="1.2" markerStart="url(#mG)" markerEnd="url(#mG)" />
                    <rect x={-93} y={oreja/2-8} width={36} height={16} fill="white" />
                    <text x={-75} y={oreja/2+4} fill="#059669" fontSize="11" fontFamily="monospace"
                      fontWeight="bold" textAnchor="middle">{oreja.toFixed(1)}</text>
                  </>}

                  <line x1={-74} y1={oreja} x2={-74} y2={oreja+packT}
                    stroke="#111" strokeWidth="1.2" markerStart="url(#mD)" markerEnd="url(#mD)" />
                  <rect x={-93} y={oreja+packT/2-8} width={36} height={16} fill="white" />
                  <text x={-75} y={oreja+packT/2+4} fill="#111" fontSize="11" fontFamily="monospace"
                    fontWeight="bold" textAnchor="middle">{packT.toFixed(0)}</text>

                  {oreja > 8 && <>
                    <line x1={-74} y1={oreja+packT} x2={-74} y2={canal}
                      stroke="#059669" strokeWidth="1.2" markerStart="url(#mG)" markerEnd="url(#mG)" />
                    <rect x={-93} y={oreja+packT+oreja/2-8} width={36} height={16} fill="white" />
                    <text x={-75} y={oreja+packT+oreja/2+4} fill="#059669" fontSize="11" fontFamily="monospace"
                      fontWeight="bold" textAnchor="middle">{oreja.toFixed(1)}</text>
                  </>}

                  <line x1={-22} y1={0} x2={-22} y2={canal}
                    stroke="#2563eb" strokeWidth="2" markerStart="url(#mB)" markerEnd="url(#mB)" />
                  <rect x={-46} y={canal/2-10} width={48} height={20} fill="white" stroke="#2563eb" strokeWidth="0.8" />
                  <text x={-22} y={canal/2+5} fill="#2563eb" fontSize="12" fontFamily="monospace"
                    fontWeight="bold" textAnchor="middle">{canal.toFixed(1)}</text>

                  {/* Right: total bobina */}
                  <line x1={corte+MR-10} y1={0} x2={corte+MR-10} y2={bobTotal}
                    stroke="#2563eb" strokeWidth="2.5" markerStart="url(#mB)" markerEnd="url(#mB)" />
                  <rect x={corte+MR-60} y={bobTotal/2-13} width={63} height={26}
                    fill="white" stroke="#2563eb" strokeWidth="1.5" />
                  <text x={corte+MR-29} y={bobTotal/2+1} fill="#2563eb" fontSize="11"
                    fontFamily="monospace" fontWeight="bold" textAnchor="middle">A</text>
                  <text x={corte+MR-29} y={bobTotal/2+13} fill="#2563eb" fontSize="10"
                    fontFamily="monospace" textAnchor="middle">{bobTotal.toFixed(0)}</text>

                  {/* Bottom: S */}
                  <line x1={0}     y1={bobTotal+2} x2={0}     y2={bobTotal+MB-4} stroke="#E61C24" strokeWidth="0.7" strokeDasharray="3,3" />
                  <line x1={corte} y1={bobTotal+2} x2={corte} y2={bobTotal+MB-4} stroke="#E61C24" strokeWidth="0.7" strokeDasharray="3,3" />
                  <line x1={0} y1={bobTotal+MB-8} x2={corte} y2={bobTotal+MB-8}
                    stroke="#E61C24" strokeWidth="2" markerStart="url(#mR)" markerEnd="url(#mR)" />
                  <rect x={corte/2-65} y={bobTotal+MB-20} width={130} height={20}
                    fill="white" stroke="#E61C24" strokeWidth="1" />
                  <text x={corte/2} y={bobTotal+MB-7} fill="#E61C24" fontSize="12"
                    fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    S = {corte.toFixed(1)} mm
                  </text>
                </ZoomableSvg>
              </div>

              {/* ── BOTTOM ROW ── */}
              <div className="grid grid-cols-4 gap-3 pt-3" style={{ borderTop: '1px solid #e5e5e5' }}>

                {/* 1. A-F TABLE */}
                <div>
                  <div className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-[3px] mb-2">
                    Mapeo del diseño
                  </div>
                  <table className="w-full text-sm font-mono border-collapse"
                         style={{ border: '1.5px solid #111' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #111' }}>
                        <th className="px-2 py-1 font-normal text-xs text-center" style={{ borderRight:'1px solid #111' }}>0—</th>
                        <th className="px-2 py-1 font-bold text-right" style={{ borderRight:'1.5px solid #111' }}>mm</th>
                        <th className="px-2 py-1 font-normal text-xs text-center" style={{ borderRight:'1px solid #111' }}>0—</th>
                        <th className="px-2 py-1 font-bold text-right">mm</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                        <td className="px-2 py-1.5 text-center text-xs" style={{ borderRight:'1px solid #111' }}>Inicio</td>
                        <td className="px-2 py-1.5 text-right" style={{ borderRight:'1.5px solid #111' }}>0.00</td>
                        <td className="px-2 py-1.5 text-center text-xs" style={{ borderRight:'1px solid #111' }}>Final</td>
                        <td className="px-2 py-1.5 text-right">{corte.toFixed(2)}</td>
                      </tr>
                      {[['A','D'],['B','E'],['C','F']].map(([l, r]) => (
                        <tr key={l} style={{ borderBottom: '1px solid #e5e5e5' }}>
                          <td className="px-2 py-1.5 text-center font-black" style={{ borderRight:'1px solid #111' }}>{l}</td>
                          <td className="px-2 py-1.5 text-right" style={{ borderRight:'1.5px solid #111' }}>{pts[l].toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-center font-black" style={{ borderRight:'1px solid #111' }}>{r}</td>
                          <td className="px-2 py-1.5 text-right">{pts[r].toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-[9px] font-mono text-gray-400 mt-1">
                    Perímetro pack: {perimetro.toFixed(2)} mm
                  </div>
                  <div className="text-[9px] font-mono mt-0.5 font-bold" style={{ color: solape > 0 ? '#ea580c' : '#9ca3af' }}>
                    Solape S/SS: {solape.toFixed(2)} mm ({solapeLado.toFixed(2)} mm c/lado)
                  </div>
                </div>

                {/* 2. PERFIL LATERAL — corregido */}
                <div>
                  <div className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-[3px] mb-2">
                    Vista lateral
                  </div>
                  <div className="border border-gray-200 bg-white overflow-hidden">
                    <svg width="100%" style={{ maxHeight:'165px', display:'block' }}
                      viewBox={`-35 -15 ${ladoTop + 60} ${alt + 35}`}
                      preserveAspectRatio="xMidYMid meet">
                      {/* siluetas de botellas */}
                      {Array.from({ length: botellasCorte }).map((_, i) => (
                        <path key={i}
                          d={`M ${i*dia} ${alt} L ${i*dia} ${alt-altCil}
                              L ${i*dia+dia/2-tapa/2} 0 L ${i*dia+dia/2+tapa/2} 0
                              L ${i*dia+dia} ${alt-altCil} L ${i*dia+dia} ${alt} Z`}
                          fill="none" stroke="#94a3b8" strokeWidth="1.2" />
                      ))}
                      {/* film principal */}
                      <path d={sideFilmPath} fill="none" stroke="#E61C24" strokeWidth="2.5" strokeLinejoin="round" />
                      {/* solape: segunda capa de film centrada en S/SS */}
                      {solapeVisible > 0 && <path d={solapePath} fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />}
                      {/* puntos A–F */}
                      {sidePoints.map(([l, cx, cy, side]) => (
                        <g key={l}>
                          <circle cx={cx} cy={cy} r="3.5" fill="#E61C24" />
                          <text x={cx + side * 9} y={cy + 4} fill="#E61C24" fontSize="11" fontWeight="bold"
                            fontFamily="monospace" textAnchor={side < 0 ? 'end' : 'start'}>{l}</text>
                        </g>
                      ))}
                      {/* S/SS: punto de sellado en el centro del fondo */}
                      <circle cx={ladoTop/2} cy={alt} r="4" fill="#059669" />
                      <text x={ladoTop/2} y={alt + 20} fill="#059669" fontSize="9"
                        textAnchor="middle" fontFamily="monospace" fontWeight="bold">S/SS</text>
                    </svg>
                  </div>
                </div>

                {/* 3. 3D BOBINA */}
                <div>
                  <div className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-[3px] mb-2">
                    Esquema Bobina
                  </div>
                  <div className="border border-gray-200 bg-white overflow-hidden">
                    <svg width="100%" style={{ maxHeight:'165px', display:'block' }}
                      viewBox="0 0 260 178" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <marker id="a3d" viewBox="0 0 10 10" refX="9" refY="5"
                          markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#475569" />
                        </marker>
                      </defs>
                      <g transform="translate(8,4)">
                        <path d="M 68 18 L 183 50 A 17 35 0 0 1 183 120 L 68 88 A 17 35 0 0 0 68 18 Z"
                          fill="#fef2f2" stroke="#94a3b8" strokeWidth="1.5" />
                        <path d="M 68 88 L 183 120 L 128 166 L 13 134 Z"
                          fill="#dbeafe" stroke="#3b82f6" strokeWidth="1.5" opacity="0.85" />
                        <ellipse cx="183" cy="85" rx="17" ry="35" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />
                        <ellipse cx="183" cy="85" rx="5"  ry="10" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
                        <ellipse cx="68"  cy="53" rx="17" ry="35" fill="#fef2f2" stroke="#94a3b8" strokeWidth="1.5" />
                        <line x1="13" y1="134" x2="128" y2="166"
                          stroke="#2563eb" strokeWidth="1.5" markerStart="url(#a3d)" markerEnd="url(#a3d)" />
                        <text x="66" y="157" fill="#2563eb" fontSize="11" fontWeight="bold"
                          fontFamily="monospace" transform="rotate(14,66,157)" textAnchor="middle">
                          (A) {bobTotal.toFixed(0)}
                        </text>
                        <line x1="128" y1="166" x2="183" y2="115"
                          stroke="#E61C24" strokeWidth="1.5" markerStart="url(#a3d)" markerEnd="url(#a3d)" />
                        <text x="160" y="147" fill="#E61C24" fontSize="11" fontWeight="bold"
                          fontFamily="monospace" transform="rotate(-44,160,147)" textAnchor="middle">
                          (S) {corte.toFixed(0)}
                        </text>
                        <line x1="13" y1="100" x2="128" y2="132"
                          stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,3" />
                        <text x="66" y="107" fill="#2563eb" fontSize="8"
                          fontFamily="monospace" transform="rotate(14,66,107)" textAnchor="middle">Corte</text>
                      </g>
                    </svg>
                  </div>
                </div>

                {/* 4. DIRECCIÓN DE AVANCE */}
                <div>
                  <div className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-[3px] mb-2">
                    Dirección de Avance
                  </div>
                  <div className="border border-gray-200 bg-white p-2">
                    <div className="text-[8px] font-mono text-gray-400 uppercase tracking-widest mb-1">Dirección de avance</div>
                    <svg width="100%" height="42" viewBox="0 0 155 42">
                      <ellipse cx="18" cy="21" rx="13" ry="19" fill="#fee2e2" stroke="#94a3b8" strokeWidth="1.5" />
                      <ellipse cx="18" cy="21" rx="4"  ry="6"  fill="#fca5a5" stroke="#94a3b8" />
                      <line x1="31" y1="21" x2="143" y2="21" stroke="#374151" strokeWidth="1.5" />
                      <polygon points="135,15 150,21 135,27" fill="#374151" />
                      <text x="88" y="13" fill="#374151" fontSize="8" textAnchor="middle" fontFamily="monospace">HORNO →</text>
                      <text x="88" y="35" fill="#9ca3af" fontSize="7" textAnchor="middle" fontFamily="monospace">
                        {tipoFilm === 'arte' ? 'DECORADO' : 'CRISTAL S/E'}
                      </text>
                    </svg>
                  </div>
                </div>

              </div>{/* end bottom row */}

              <section className="viewer-3d-panel no-print">
                <div className="viewer-3d-header">
                  <div>
                    <span className="viewer-3d-kicker">Visualizador interactivo</span>
                    <h3>Pack 3D: antes y después del horno</h3>
                    <p>Arrastrá para rotar. Mové la barra de contracción para ver cómo el film se pega al pack y las orejas se cierran sobre el lado A.</p>
                  </div>
                  <div className="viewer-3d-actions">
                    <button type="button" className={cambios3DPendientes || !geometry3D ? 'viewer-button-primary' : 'viewer-button-secondary'}
                      onClick={actualizar3D} disabled={!geometriaActual}>
                      {geometry3D ? 'Actualizar 3D' : 'Generar modelo 3D'}
                    </button>
                  </div>
                </div>

                {tipoFilm === 'arte' && (
                  <div className={`viewer-art-status ${arteImagen ? 'ready' : 'missing'}`}>
                    <strong>{arteImagen ? 'Arte cargado' : 'Falta cargar el arte'}</strong>
                    <span>{arteImagen ? `${arteNombre} · ${arteLargoEfectivo.toFixed(1)} × ${arteAncho.toFixed(1)} mm · mapeo ${usarPlano ? 'según plano' : 'calculado'}` : 'Cargá una imagen en Material > Con arte.'}</span>
                  </div>
                )}
                {tipoFilm === 'arte' && arteImagen && (
                  <ArtePreview
                    imagen={arteImagen}
                    largo={arteLargoEfectivo}
                    ancho={arteAncho}
                    recorte={arteRecorte}
                    encuadre={arteEncuadre}
                    knotsPlano={knotsPlano}
                    offset={arteOffset}
                    invertido={arteInvertido}
                  />
                )}

                <div className="viewer-shrink-controls">
                  <div className="viewer-shrink-toggle">
                    <button type="button" className={contraccion3D === 0 ? 'active' : ''} onClick={() => setContraccion3D(0)}>Antes del horno</button>
                    <button type="button" className={contraccion3D === 100 ? 'active' : ''} onClick={() => setContraccion3D(100)}>Después del horno</button>
                  </div>
                  <label className="viewer-shrink-slider">
                    <span>Contracción aplicada: <strong>{contraccion3D}%</strong></span>
                    <input type="range" min="0" max="100" step="1" value={contraccion3D} onChange={(valor) => setContraccion3D(valor)} />
                  </label>
                  <div className="viewer-shrink-stats">
                    <span>Borde oreja <strong>{(simActual.contraccionBorde * 100).toFixed(1)}%</strong></span>
                    <span>Transversal <strong>{(simActual.contraccionTD * 100).toFixed(1)}%</strong></span>
                    <span>Hueco <strong>{(simActual.ratioHueco * 100).toFixed(1)}%</strong></span>
                  </div>
                </div>

                <div className="viewer-layer-controls">
                  <span>Mostrar:</span>
                  {[
                    ['mapeo', 'Mapeo del diseño', 'layer-mapeo'],
                    ['solape', 'Solape', 'layer-solape'],
                    ['orejas', 'Orejas sup / inf', 'layer-orejas'],
                  ].map(([key, label, clase]) => (
                    <button key={key} type="button" className={`${clase} ${capas3D[key] ? 'active' : ''}`} aria-pressed={capas3D[key]}
                      onClick={() => setCapas3D((actual) => ({ ...actual, [key]: !actual[key] }))}>
                      {capas3D[key] ? '●' : '○'} {label}
                    </button>
                  ))}
                  <span className="viewer-layer-sep">Vista:</span>
                  {[
                    ['iso', 'Perspectiva'],
                    ['frente', 'Lado A'],
                    ['abajo', 'Desde abajo'],
                  ].map(([key, label]) => (
                    <button key={key} type="button" disabled={!geometry3D}
                      onClick={() => { setVista3D(key); setReset3DToken((value) => value + 1); }}>
                      {label}
                    </button>
                  ))}
                </div>

                {!geometryValida && geometry3D && (
                  <div className="viewer-dirty-notice">Hay datos inválidos. El modelo conserva la última geometría válida.</div>
                )}
                {geometryValida && cambios3DPendientes && (
                  <div className="viewer-dirty-notice">Hay cambios sin aplicar al 3D. Presioná “Actualizar 3D” para verlos.</div>
                )}

                {geometry3D ? (
                  <Pack3D geometry={geometry3D} resetToken={reset3DToken} vista={vista3D} contraccion={contraccion3D / 100} capas={capas3D} />
                ) : (
                  <div className="viewer-3d-empty">
                    <div className="viewer-3d-icon">3D</div>
                    <strong>Modelo todavía no generado</strong>
                    <span>Presioná “Generar modelo 3D” para crear el pack con los datos actuales.</span>
                  </div>
                )}
              </section>
            </div>{/* end right column */}
          </div>{/* end body grid */}

        </div>{/* end drawing sheet */}
      </div>
    </div>
  );
}