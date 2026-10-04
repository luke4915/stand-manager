import { useState, useRef, useCallback } from 'react';

// Bozza della pianta con annulla e ripristina. Una modifica singola è un `commit`; un gesto continuo (trascinare,
// ridimensionare) è `startGesture` → molti `update` → `endGesture`, e vale come un solo passo nello storico.
export function useDraft(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const gesture = useRef(null);

  const commit = useCallback((next) => setState(s => ({ past: [...s.past, s.present], present: next, future: [] })), []);
  const startGesture = useCallback(() => { gesture.current = true; setState(s => ({ ...s, snapshot: s.present })); }, []);
  const update = useCallback((next) => setState(s => ({ ...s, present: next })), []);
  const endGesture = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = null;
    setState(({ snapshot, ...s }) => (snapshot && JSON.stringify(snapshot) !== JSON.stringify(s.present)
      ? { past: [...s.past, snapshot], present: s.present, future: [] }
      : s));
  }, []);
  const undo = useCallback(() => setState(s => (s.past.length
    ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState(s => (s.future.length
    ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback((next) => setState({ past: [], present: next, future: [] }), []);

  return { draft: state.present, commit, startGesture, update, endGesture, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
