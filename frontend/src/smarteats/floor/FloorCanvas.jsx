import { useState, useLayoutEffect, useRef } from 'react';
import { clamp, isPlaced } from './geometry';
import { ELEMENT_CLASS } from './elementStyle';

// Griglia di una sala con i suoi tavoli. Serve sia all'editor (tavoli trascinabili) sia alla Sala (tavoli con lo
// stato dal vivo): cosa disegnare dentro a ogni tavolo lo decide `renderTable(table, style)`, che deve applicare
// `style` (posizione e misura in pixel) al suo elemento. La cella si adatta alla larghezza disponibile; con `fit`
// (la Sala) si adatta anche all'altezza: l'intera sala sta nell'area, centrata, senza scroll. `fit` richiede un
// contenitore con altezza definita.
const MIN_CELL = 14;
const MAX_CELL = 56;
const MIN_FIT_CELL = 8;

const FloorCanvas = ({ gridW, gridH, tables, elements = [], renderTable, renderElement, showGrid = false, fit = false, onBackgroundPointerDown, onBackgroundPointerMove, onBackgroundPointerUp, canvasRef }) => {
  const box = useRef(null);
  const [cell, setCell] = useState(32);

  useLayoutEffect(() => {
    const el = box.current;
    const measure = () => {
      if (fit) setCell(Math.max(MIN_FIT_CELL, Math.floor(Math.min(el.clientWidth / gridW, el.clientHeight / gridH))));
      else setCell(clamp(Math.floor(el.clientWidth / gridW), MIN_CELL, MAX_CELL));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridW, gridH, fit]);

  return (
    <div ref={box} className={fit ? 'w-full h-full flex items-center justify-center overflow-hidden' : 'w-full overflow-x-auto no-scrollbar'}>
      <div
        ref={canvasRef}
        onPointerDown={onBackgroundPointerDown} onPointerMove={onBackgroundPointerMove} onPointerUp={onBackgroundPointerUp} onPointerCancel={onBackgroundPointerUp}
        className="relative rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] select-none"
        style={{
          width: gridW * cell, height: gridH * cell,
          ...(showGrid && {
            backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
            backgroundSize: `${cell}px ${cell}px`,
          }),
        }}>
        {elements.map(e => {
          const style = { position: 'absolute', left: e.x * cell, top: e.y * cell, width: e.w * cell, height: e.h * cell };
          return renderElement ? renderElement(e, style, cell)
            : <div key={e.id} style={style} aria-hidden="true" className={`pointer-events-none box-border ${ELEMENT_CLASS[e.kind]}`} />;
        })}
        {tables.filter(isPlaced).map(t => renderTable(t, {
          position: 'absolute', left: t.x * cell, top: t.y * cell, width: t.w * cell, height: t.h * cell,
        }, cell))}
      </div>
    </div>
  );
};

export default FloorCanvas;
