import React, { useEffect, useRef, useState } from 'react';

// Campo numérico que se puede dejar vacío mientras se escribe.
// Solo informa números válidos; si se sale del campo vacío, vuelve al último valor.
export default function NumberInput({ value, onChange, onBlur, ...props }) {
  // Limita a min/max (si están definidos) para que un valor fuera de rango no trabe la app.
  const limitar = (n) => {
    let v = n;
    if (props.min !== undefined && props.min !== '') v = Math.max(Number(props.min), v);
    if (props.max !== undefined && props.max !== '') v = Math.min(Number(props.max), v);
    return v;
  };
  const [texto, setTexto] = useState(String(value ?? ''));
  const ref = useRef(null);

  // Si el valor cambia desde afuera (gráfico, configuración cargada), se muestra.
  useEffect(() => {
    const enFoco = ref.current === document.activeElement;
    if (enFoco && (texto === '' || texto === '-')) return;
    if (texto !== '' && Number(texto) === Number(value)) return;
    setTexto(String(value ?? ''));
  }, [value]);

  return (
    <input
      {...props}
      ref={ref}
      type="number"
      value={texto}
      onChange={(event) => {
        const raw = event.target.value;
        setTexto(raw);
        if (raw !== '' && raw !== '-' && Number.isFinite(Number(raw))) onChange(limitar(Number(raw)));
      }}
      onBlur={(event) => {
        if (texto === '' || !Number.isFinite(Number(texto)) || Number(texto) !== Number(value)) setTexto(String(value ?? ''));
        onBlur?.(event);
      }}
    />
  );
}
