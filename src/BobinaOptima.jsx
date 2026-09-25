import React, { useRef, useState } from 'react';

const ESTADOS = {
  ok: { clase: 'estado-ok', icono: '✓' },
  justo: { clase: 'estado-justo', icono: '!' },
  exceso: { clase: 'estado-exceso', icono: '≈' },
  debil: { clase: 'estado-debil', icono: '✕' },
};

export function EstadoChip({ estado }) {
  const info = ESTADOS[estado.estado] ?? ESTADOS.debil;
  return <span className={`estado-chip ${info.clase}`}>{info.icono} {estado.texto}</span>;
}

const fmt = (valor, dec = 1) => (valor === null || valor === undefined ? '—' : Number(valor).toFixed(dec));

function CurvaBobina({ analisis, bobinaActual, huecoObjetivo: objetivoCrudo, huecoMaximo: maximoCrudo, onElegir }) {
  // Zonas siempre ordenadas y dentro de 0-100 aunque los datos estén a medio escribir.
  const huecoObjetivo = Math.min(100, Math.max(0, objetivoCrudo));
  const huecoMaximo = Math.min(100, Math.max(huecoObjetivo, maximoCrudo));
  const [hover, setHover] = useState(null);
  const arrastrando = useRef(false);
  const { bobinaMax, bobinaMin, bobinaRecomendada } = analisis;

  // Rango visible: hasta un poco después de la zona "sobra film" (o de la bobina actual).
  const referencia = Math.max(bobinaMax ?? bobinaRecomendada ?? 0, bobinaActual);
  const limite = referencia > 0 ? referencia * 1.18 : Infinity;
  const curva = analisis.curva.filter((p) => p.bobina <= limite);
  if (curva.length < 2) return null;

  const W = 640;
  const H = 230;
  const m = { l: 44, r: 14, t: 14, b: 34 };
  const xMin = curva[0].bobina;
  const xMax = curva[curva.length - 1].bobina;
  const px = (v) => m.l + ((v - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const py = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const path = curva.map((p, i) => `${i ? 'L' : 'M'} ${px(p.bobina).toFixed(1)} ${py(p.hueco).toFixed(1)}`).join(' ');
  const rango = xMax - xMin;
  const pasoX = rango > 800 ? 200 : rango > 400 ? 100 : 50;
  const ticksX = [];
  for (let v = Math.ceil(xMin / pasoX) * pasoX; v <= xMax; v += pasoX) ticksX.push(v);

  const cercano = (valor) => curva.reduce((best, p) => (Math.abs(p.bobina - valor) < Math.abs(best.bobina - valor) ? p : best), curva[0]);
  const puntoDesdeEvento = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    return cercano(xMin + ((x - m.l) / (W - m.l - m.r)) * (xMax - xMin));
  };
  const onPointerDown = (event) => {
    arrastrando.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const punto = puntoDesdeEvento(event);
    setHover(punto);
    onElegir(punto.bobina);
  };
  const onPointerMove = (event) => {
    const punto = puntoDesdeEvento(event);
    setHover(punto);
    if (arrastrando.current) onElegir(punto.bobina);
  };
  const onPointerUp = () => { arrastrando.current = false; };

  const actual = cercano(bobinaActual);
  const recomendada = bobinaRecomendada !== null && bobinaRecomendada <= xMax ? cercano(bobinaRecomendada) : null;
  const marcas = [
    bobinaMin !== null && bobinaMin <= xMax ? { valor: bobinaMin, texto: 'mín' } : null,
    bobinaMax !== null && bobinaMax <= xMax ? { valor: bobinaMax, texto: 'máx' } : null,
  ].filter(Boolean);

  return (
    <div className="bobina-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="bobina-chart-svg"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerLeave={() => { if (!arrastrando.current) setHover(null); }}
        role="img" aria-label="Hueco de la cara del lado A según el ancho de bobina. Hacé click para elegir una bobina.">
        <rect x={m.l} y={py(huecoObjetivo)} width={W - m.l - m.r} height={py(0) - py(huecoObjetivo)} className="zona-ok" />
        <rect x={m.l} y={py(huecoMaximo)} width={W - m.l - m.r} height={py(huecoObjetivo) - py(huecoMaximo)} className="zona-justo" />
        <rect x={m.l} y={py(100)} width={W - m.l - m.r} height={py(huecoMaximo) - py(100)} className="zona-debil" />
        {bobinaMax !== null && bobinaMax < xMax && (
          <rect x={px(bobinaMax)} y={m.t} width={W - m.r - px(bobinaMax)} height={H - m.t - m.b} className="zona-exceso" />
        )}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={py(v)} y2={py(v)} className="chart-grid" />
            <text x={m.l - 6} y={py(v) + 3} textAnchor="end" className="chart-tick">{v}%</text>
          </g>
        ))}
        {ticksX.map((v) => (
          <text key={v} x={px(v)} y={H - m.b + 14} textAnchor="middle" className="chart-tick">{v}</text>
        ))}
        {marcas.map(({ valor, texto }) => (
          <g key={texto}>
            <line x1={px(valor)} x2={px(valor)} y1={H - m.b} y2={H - m.b + 4} className="chart-grid-strong" />
            <text x={px(valor)} y={H - m.b - 4} textAnchor="middle" className="chart-mark-label">{texto}</text>
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="chart-axis">Ancho de bobina (mm)</text>
        <text x={m.l + 6} y={py(huecoObjetivo) + 12} className="chart-zone-label">Bien</text>
        <text x={m.l + 6} y={py(huecoMaximo) + 12} className="chart-zone-label">Justo</text>
        <text x={m.l + 6} y={py(100) + 12} className="chart-zone-label">Débil</text>
        {bobinaMax !== null && bobinaMax < xMax && (
          <text x={W - m.r - 6} y={m.t + 12} textAnchor="end" className="chart-zone-label">Sobra film</text>
        )}
        <path d={path} className="chart-line" />
        {recomendada && (
          <g>
            <circle cx={px(recomendada.bobina)} cy={py(recomendada.hueco)} r="6" className="chart-reco-dot" />
            <text x={px(recomendada.bobina)} y={py(recomendada.hueco) + 20} textAnchor="middle" className="chart-reco-label">
              Óptima {fmt(recomendada.bobina, 0)}
            </text>
          </g>
        )}
        <line x1={px(actual.bobina)} x2={px(actual.bobina)} y1={m.t} y2={H - m.b} className="chart-actual" />
        <circle cx={px(actual.bobina)} cy={py(actual.hueco)} r="5" className="chart-actual-dot" />
        <text x={px(actual.bobina) + 6} y={m.t + 24} className="chart-actual-label">Actual {fmt(bobinaActual, 0)}</text>
        {hover && (
          <g pointerEvents="none">
            <line x1={px(hover.bobina)} x2={px(hover.bobina)} y1={m.t} y2={H - m.b} className="chart-crosshair" />
            <circle cx={px(hover.bobina)} cy={py(hover.hueco)} r="4" className="chart-hover-dot" />
          </g>
        )}
      </svg>
      <div className="bobina-chart-readout">
        {hover
          ? <>Bobina <strong>{fmt(hover.bobina, 0)} mm</strong> · oreja {fmt(hover.oreja, 0)} mm · hueco <strong>{fmt(hover.hueco)}%</strong> de la cara · <em>click para usarla</em></>
          : 'Hacé click o arrastrá sobre el gráfico para probar un ancho de bobina: se actualizan la vista superior y el 3D.'}
      </div>
    </div>
  );
}

export default function BobinaOptima({
  analisis, sim, estructura, folienbreite, canales, huecoObjetivo, huecoMaximo, contraccionMD,
  comparativa, modoBobina, onElegirBobina, onModoAuto,
}) {
  return (
    <section className="bobina-panel">
      <div className="bobina-header">
        <div>
          <span className="viewer-3d-kicker">Estructura del pack</span>
          <h3>Bobina óptima y comportamiento de las orejas</h3>
          <p>Modelo simplificado: la oreja se dobla sobre la cara del lado A y se contrae. El hueco que queda define cuánto soporte tiene el pack.</p>
        </div>
        <div className="bobina-header-side">
          <EstadoChip estado={estructura} />
          {modoBobina === 'auto' ? (
            <span className="bobina-modo bobina-modo-auto">Bobina automática (óptima)</span>
          ) : (
            <button type="button" className="bobina-modo bobina-modo-manual" onClick={onModoAuto}>
              Bobina manual · volver a la óptima
            </button>
          )}
        </div>
      </div>

      <div className="bobina-kpis">
        <div className="bobina-kpi bobina-kpi-main">
          <span>Bobina recomendada</span>
          <strong>{analisis.bobinaRecomendada === null ? 'No alcanza' : `${fmt(analisis.bobinaRecomendada, 0)} mm`}</strong>
          <small>
            {analisis.bobinaRecomendada === null
              ? `Con ${contraccionMD}% de contracción longitudinal el hueco no baja del objetivo.`
              : `Oreja ${fmt(analisis.orejaRecomendada, 0)} mm por lado${canales > 1 ? ` · ${canales} canales` : ''}`}
          </small>
        </div>
        <div className="bobina-kpi">
          <span>Rango aceptable</span>
          <strong>{fmt(analisis.bobinaMin, 0)} – {fmt(analisis.bobinaMax, 0)}</strong>
          <small>Debajo: pack débil · Arriba: sobra film</small>
        </div>
        <div className="bobina-kpi">
          <span>Bobina en uso ({fmt(folienbreite, 0)} mm)</span>
          <strong>{fmt(sim.ratioHueco * 100)}% hueco</strong>
          <small>Oreja {fmt(sim.oreja)} mm → cubre {fmt(sim.cobertura)} mm</small>
        </div>
        <div className="bobina-kpi">
          <span>Termocontracción</span>
          <strong>{fmt(sim.contraccionBorde * 100)}% · {fmt(sim.contraccionTD * 100)}%</strong>
          <small>Borde de oreja (long.) · ancho de oreja (transv.)</small>
        </div>
      </div>

      <div className="bobina-detail">
        <div><span>Oreja superior (tapas)</span><strong>{fmt(sim.orejaSup)} mm</strong></div>
        <div><span>Oreja inferior (base)</span><strong>{fmt(sim.orejaInf)} mm</strong></div>
        <div><span>Hueco</span><strong>{fmt(sim.huecoAncho, 0)} × {fmt(sim.huecoAlto, 0)} mm</strong></div>
        <div><span>Film que no contrae</span><strong>{fmt(sim.sobrante)} mm</strong></div>
      </div>

      <CurvaBobina analisis={analisis} bobinaActual={folienbreite} huecoObjetivo={huecoObjetivo} huecoMaximo={huecoMaximo} onElegir={onElegirBobina} />

      <div className="camadas-table-wrap">
        <div className="camadas-title">Este pack con distintos anchos de bobina</div>
        <table className="camadas-table">
          <thead>
            <tr>
              <th>Bobina</th>
              <th>Oreja / lado</th>
              <th>Cubre</th>
              <th>Oreja sup</th>
              <th>Oreja inf</th>
              <th>Hueco</th>
              <th>Contr. borde</th>
              <th>Estructura</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {comparativa.map((fila) => (
              <tr key={fila.bobina} className={fila.etiquetas.includes('actual') ? 'camada-actual' : ''}>
                <td>
                  {fmt(fila.bobina, 0)} mm
                  {fila.etiquetas.map((etiqueta) => <span key={etiqueta} className={`fila-tag fila-tag-${etiqueta.replace(' ', '-')}`}>{etiqueta}</span>)}
                </td>
                <td>{fila.entra ? `${fmt(fila.oreja)} mm` : 'No entra'}</td>
                <td>{fila.entra ? `${fmt(fila.sim.cobertura)} mm` : '—'}</td>
                <td>{fila.entra ? `${fmt(fila.sim.orejaSup)} mm` : '—'}</td>
                <td>{fila.entra ? `${fmt(fila.sim.orejaInf)} mm` : '—'}</td>
                <td>{fila.entra ? `${fmt(fila.sim.ratioHueco * 100)}%` : '—'}</td>
                <td>{fila.entra ? `${fmt(fila.sim.contraccionBorde * 100)}%` : '—'}</td>
                <td>{fila.entra ? <EstadoChip estado={fila.estructura} /> : <EstadoChip estado={{ estado: 'debil', texto: 'No entra' }} />}</td>
                <td>
                  {!fila.etiquetas.includes('actual') && fila.entra && (
                    <button type="button" className="fila-usar" onClick={() => onElegirBobina(fila.bobina)}>Usar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
