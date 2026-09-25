import React, { useEffect, useRef, useState } from 'react';

const ZOOM_MIN = 1;
const ZOOM_MAX = 10;

// SVG con zoom (rueda o botones) y desplazamiento (arrastrar). El centro se guarda
// normalizado (0..1) para que el zoom se mantenga si cambian las medidas del plano.
export default function ZoomableSvg({ viewBox, maxHeight = 340, children }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [centro, setCentro] = useState({ x: 0.5, y: 0.5 });
  const [ampliado, setAmpliado] = useState(false);

  const w = viewBox.w / zoom;
  const h = viewBox.h / zoom;
  const limitar = (c, z) => {
    const mx = 0.5 / z;
    return { x: Math.min(1 - mx, Math.max(mx, c.x)), y: Math.min(1 - mx, Math.max(mx, c.y)) };
  };
  const c = limitar(centro, zoom);
  const vx = viewBox.x + c.x * viewBox.w - w / 2;
  const vy = viewBox.y + c.y * viewBox.h - h / 2;

  // Punto del plano (normalizado) bajo el mouse, teniendo en cuenta el "meet" del SVG.
  const puntoNormalizado = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    const escala = Math.min(rect.width / w, rect.height / h);
    const offX = (rect.width - w * escala) / 2;
    const offY = (rect.height - h * escala) / 2;
    const x = vx + (event.clientX - rect.left - offX) / escala;
    const y = vy + (event.clientY - rect.top - offY) / escala;
    return { x: (x - viewBox.x) / viewBox.w, y: (y - viewBox.y) / viewBox.h, escala };
  };

  const zoomEn = (factor, punto) => {
    const zNuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
    if (punto) {
      // Mantiene fijo el punto bajo el cursor.
      const k = zoom / zNuevo;
      setCentro(limitar({ x: punto.x + (c.x - punto.x) * k, y: punto.y + (c.y - punto.y) * k }, zNuevo));
    } else {
      setCentro(c);
    }
    setZoom(zNuevo);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      zoomEn(event.deltaY < 0 ? 1.2 : 1 / 1.2, puntoNormalizado(event));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (event) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, centro: c, escala: puntoNormalizado(event).escala };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / drag.escala / viewBox.w;
    const dy = (event.clientY - drag.y) / drag.escala / viewBox.h;
    setCentro(limitar({ x: drag.centro.x - dx, y: drag.centro.y - dy }, zoom));
  };
  const onPointerUp = () => { dragRef.current = null; };
  const reset = () => { setZoom(1); setCentro({ x: 0.5, y: 0.5 }); };

  return (
    <div className="zoom-svg">
      <div className="zoom-svg-toolbar no-print">
        <button type="button" onClick={() => zoomEn(1.5)} title="Acercar">+</button>
        <button type="button" onClick={() => zoomEn(1 / 1.5)} disabled={zoom <= 1} title="Alejar">−</button>
        <button type="button" onClick={reset} disabled={zoom <= 1} title="Ver todo">Ver todo</button>
        <button type="button" onClick={() => setAmpliado((a) => !a)} title="Cambiar alto de la vista">
          {ampliado ? 'Achicar' : 'Agrandar'}
        </button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        className={zoom > 1 ? 'zoom-svg-pan' : ''}
        style={{ height: ampliado ? '70vh' : undefined, maxHeight: ampliado ? 'none' : `${maxHeight}px`, display: 'block' }}
        viewBox={`${vx} ${vy} ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
      >
        {children}
      </svg>
      <div className="zoom-svg-hint no-print">Rueda del mouse para zoom · arrastrá para moverte · doble click para ver todo</div>
    </div>
  );
}
