import { useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiClient';

// Suoni della cassa (prodotto aggiunto, ordine confermato, carrello svuotato).
// I file mp3 arrivano dal server la prima volta e poi restano in memoria.
// Restituisce `play(nome)`, che non fa nulla se i suoni sono disattivati.
export function useSound(enabled) {
  const audioCtxRef = useRef(null);
  const buffers = useRef({});

  return useCallback(async (soundName) => {
    if (!enabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      if (!buffers.current[soundName]) {
        const res = await apiFetch(`/assets/${soundName}.mp3`, { raw: true });
        buffers.current[soundName] = await ctx.decodeAudioData(await res.arrayBuffer());
      }
      const source = ctx.createBufferSource();
      source.buffer = buffers.current[soundName];
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.15;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } catch (err) { console.warn('Audio error:', err); }
  }, [enabled]);
}
