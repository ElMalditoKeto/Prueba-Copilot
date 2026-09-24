import React, { useState } from 'react';

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

function CurvaBobina({ analisis, bobinaActual, huecoObjetivo, huecoMaximo }) {
  const [hover, setHover] = useState(null);
  const { curva, bobinaMax } = analisis;
  if (curva.length < 2) return null;
  const W = 640;
  const H = 230;
  const m = { l: 44, r: 14, t: 14, b: 34 };
  const xMin = curva[0].bobina;
  const xMax = Math.max(curva[curva.length - 1].bobina, bobinaActual);
  const px = (v) => m.l + ((v - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const py = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const path = curva.map((p, i) => `${i ? 'L' : 'M'} ${px(p.bobina).toFixed(1)} ${py(p.hueco).toFixed(1)}`).join(' ');
  const pasoX = (xMax - xMin) > 400 ? 100 : 50;
  const ticksX = [];
  for (let v = Math.ceil(xMin / pasoX) * pasoX; v <= xMax; v += pasoX) ticksX.push(v);

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const valor = xMin + ((x - m.l) / (W - m.l - m.r)) * (xMax - xMin);
    let best = curva[0];
    curva.forEach((p) => { if (Math.abs(p.bobina - valor) < Math.abs(best.bobina - valor)) best = p; });
    setHover(best);
  };

  const actual = curva.reduce((best, p) => (Math.abs(p.bobina - bobinaActual) < Math.abs(best.bobina - bobinaActual) ? p : best), curva[0]);

  return (
    <div className="bobina-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
        aria-label="Hueco de la cara del lado A según el ancho de bobina">
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
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="chart-axis">Ancho de bobina (mm)</text>
        <text x={m.l + 6} y={py(huecoObjetivo) + 12} className="chart-zone-label">Bien</text>
        <text x={m.l + 6} y={py(huecoMaximo) + 12} className="chart-zone-label">Justo</text>
        <text x={m.l + 6} y={py(100) + 12} className="chart-zone-label">Débil</text>
        {bobinaMax !== null && bobinaMax < xMax && (
          <text x={W - m.r - 6} y={m.t + 12} textAnchor="end" className="chart-zone-label">Sobra film</text>
        )}
        <path d={path} className="chart-line" />
        <line x1={px(bobinaActual)} x2={px(bobinaActual)} y1={m.t} y2={H - m.b} className="chart-actual" />
        <circle cx={px(actual.bobina)} cy={py(actual.hueco)} r="5" className="chart-actual-dot" />
        <text x={px(bobinaActual) + 6} y={m.t + 24} className="chart-actual-label">Actual {fmt(bobinaActual, 0)}</text>
        {hover && (
          <g pointerEvents="none">
            <line x1={px(hover.bobina)} x2={px(hover.bobina)} y1={m.t} y2={H - m.b} className="chart-crosshair" />
            <circle cx={px(hover.bobina)} cy={py(hover.hueco)} r="4" className="chart-hover-dot" />
          </g>
        )}
      </svg>
      <div className="bobina-chart-readout">
        {hover
          ? <>Bobina <strong>{fmt(hover.bobina, 0)} mm</strong> · oreja {fmt(hover.oreja, 0)} mm · hueco <strong>{fmt(hover.hueco)}%</strong> de la cara</>
          : 'Pasá el mouse por el gráfico para ver cada ancho de bobina.'}
      </div>
    </div>
  );
}

export default function BobinaOptima({ analisis, sim, estructura, folienbreite, canales, huecoObjetivo, huecoMaximo, camadas, contraccionMD }) {
  return (
    <section className="bobina-panel">
      <div className="bobina-header">
        <div>
          <span className="viewer-3d-kicker">Estructura del pack</span>
          <h3>Bobina óptima y comportamiento de las orejas</h3>
          <p>Modelo simplificado: la oreja se dobla sobre la cara del lado A y se contrae. El hueco que queda define cuánto soporte tiene el pack.</p>
        </div>
        <EstadoChip estado={estructura} />
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
          <span>Bobina actual ({fmt(folienbreite, 0)} mm)</span>
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

      <CurvaBobina analisis={analisis} bobinaActual={folienbreite} huecoObjetivo={huecoObjetivo} huecoMaximo={huecoMaximo} />

      <div className="camadas-table-wrap">
        <div className="camadas-title">Comparativa de camadas con la bobina actual</div>
        <table className="camadas-table">
          <thead>
            <tr>
              <th>Camada (A × B)</th>
              <th>Ancho pack</th>
              <th>Oreja</th>
              <th>Hueco</th>
              <th>Estructura</th>
              <th>Bobina recomendada</th>
            </tr>
          </thead>
          <tbody>
            {camadas.map((fila) => (
              <tr key={fila.nombre} className={fila.actual ? 'camada-actual' : ''}>
                <td>{fila.nombre}{fila.actual ? ' (actual)' : ''}</td>
                <td>{fmt(fila.anchoPaquete, 0)} mm</td>
                <td>{fila.entra ? `${fmt(fila.oreja)} mm` : 'No entra'}</td>
                <td>{fila.entra ? `${fmt(fila.hueco)}%` : '—'}</td>
                <td>{fila.entra ? <EstadoChip estado={fila.estructura} /> : <EstadoChip estado={{ estado: 'debil', texto: 'No entra' }} />}</td>
                <td>{fila.bobinaRecomendada === null ? '—' : `${fmt(fila.bobinaRecomendada, 0)} mm`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
