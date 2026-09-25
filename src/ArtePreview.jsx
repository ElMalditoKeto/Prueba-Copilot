import React from 'react';

const NOMBRES = ['Inicio', 'A', 'B', 'C', 'D', 'E', 'F', 'Final'];

// Vista del arte como plano: la imagen ocupa todo el film (Inicio→Final × ancho),
// la zona impresa se marca con el recorte y las líneas muestran dónde cae cada punto
// del perfil sobre la imagen (incluye el desplazamiento).
export default function ArtePreview({ imagen, largo, ancho, recorte, encuadre, knotsPlano, offset, invertido }) {
  if (!imagen || !(largo > 0) || !(ancho > 0)) return null;
  const pos = (mm) => `${((mm + offset) / largo) * 100}%`;
  // La imagen se amplía para que solo el encuadre (el film) llene el marco.
  const ex = Math.max(0.1, 1 - (encuadre.izquierda + encuadre.derecha) / 100);
  const ey = Math.max(0.1, 1 - (encuadre.superior + encuadre.inferior) / 100);
  const imgStyle = {
    width: `${100 / ex}%`,
    height: `${100 / ey}%`,
    left: `${(-encuadre.izquierda / ex)}%`,
    top: `${(-encuadre.superior / ey)}%`,
  };
  return (
    <div className="arte-preview">
      <div className="arte-preview-frame" style={{ aspectRatio: `${largo} / ${ancho}` }}>
        <div className="arte-preview-img" style={{ transform: invertido ? 'scaleX(-1)' : 'none' }}>
          <img src={imagen} alt="Arte del film" style={imgStyle} />
        </div>
        <div
          className="arte-preview-printed"
          style={{
            left: `${recorte.izquierda}%`,
            right: `${recorte.derecha}%`,
            top: `${recorte.superior}%`,
            bottom: `${recorte.inferior}%`,
          }}
        />
        {knotsPlano.map((mm, i) => (
          <div key={NOMBRES[i]} className={`arte-preview-knot ${i === 0 || i === knotsPlano.length - 1 ? 'extremo' : ''}`} style={{ left: pos(mm) }}>
            <span>{NOMBRES[i]}</span>
          </div>
        ))}
      </div>
      <div className="arte-preview-legend">
        <span><i className="legend-knot" /> Puntos del perfil sobre el arte</span>
        <span><i className="legend-printed" /> Zona impresa (recorte) · afuera = film transparente</span>
        <span>Arte {largo.toFixed(1)} × {ancho.toFixed(1)} mm</span>
      </div>
    </div>
  );
}
