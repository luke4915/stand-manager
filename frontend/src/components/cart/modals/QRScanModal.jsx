import React, { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import jsQR from 'jsqr';

// ─── Componente di supporto per iOS (Evita il lock hardware della fotocamera) ───
const CameraStream = ({ videoRef }) => (
    <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted
    />
);

// ─── Modale Scan QR ─────────────────────────────────────────────
const QRScanModal = ({ currentCart, onMerge, onReplace, onClose }) => {
    const [scanning, setScanning] = useState(false);
    const [scannerError, setScannerError] = useState('');
    const [scanned, setScanned] = useState(null);
    const videoRef = useRef(null);
    const animFrameRef = useRef(null);
    const streamRef = useRef(null);

    // Avvio e arresto della fotocamera solo all'apertura e alla chiusura del modale:
    // le funzioni usano soltanto ref e setter di stato, che non cambiano tra i render.
    useEffect(() => {
        startScanner();
        return () => stopScanner();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startScanner = async () => {
        setScannerError('');
        if (!navigator.mediaDevices?.getUserMedia) {
            setScannerError('Fotocamera non supportata (richiede HTTPS).');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            streamRef.current = stream;
            setScanning(true);

            setTimeout(async () => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    try {
                        await videoRef.current.play();
                        animFrameRef.current = requestAnimationFrame(scanFrame);
                    } catch (playErr) {
                        console.error("Errore playback video:", playErr);
                    }
                }
            }, 100);

        } catch (err) {
            console.error("Errore getUserMedia:", err);
            if (err.name === 'NotAllowedError') {
                setScannerError('Permesso fotocamera negato dall\'utente.');
            } else {
                setScannerError('Impossibile accedere alla fotocamera.');
            }
        }
    };

    const scanFrame = () => {
        if (!streamRef.current) return; // Arresto immediato se lo stream è stato rimosso

        const video = videoRef.current;
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            animFrameRef.current = requestAnimationFrame(scanFrame);
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                try {
                    const items = JSON.parse(atob(code.data));
                    if (Array.isArray(items) && items.length > 0) {
                        stopScanner();
                        setScanned(items);
                        return;
                    } else {
                        setScannerError('Contenuto QR non valido.');
                    }
                } catch {
                    setScannerError('Formato QR non riconosciuto.');
                }
            }
        } catch (canvasErr) {
            console.error("Errore elaborazione frame:", canvasErr);
        }

        animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    const stopScanner = () => {
        setScanning(false);

        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
            });
            streamRef.current = null;
        }

        if (videoRef.current) {
            const video = videoRef.current;
            video.pause();
            video.srcObject = null;
            video.removeAttribute('src');
            video.load();
        }
    };

    const hasCart = currentCart.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Importa ordine</p>
                        <h3 className="font-black text-sm uppercase tracking-tight text-[var(--text-main)]">Scansiona QR cliente</h3>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {!scanned && (
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-[var(--accent)] bg-black flex items-center justify-center">
                                {scanning ? (
                                    <CameraStream videoRef={videoRef} />
                                ) : (
                                    <p className="text-xs text-gray-400">Inizializzazione cam...</p>
                                )}
                                <div className="absolute inset-0 border-2 border-dashed border-white/30 m-4 pointer-events-none rounded-lg" />
                            </div>

                            {scannerError && <p className="text-red-500 text-xs font-bold text-center bg-red-500/10 p-2 rounded-lg border border-red-500/20 w-full">{scannerError}</p>}

                            <button onClick={onClose}
                                className="w-full py-2.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl cursor-pointer font-black text-xs uppercase tracking-widest transition-all hover:bg-red-500 hover:text-white">
                                Annulla Scansione
                            </button>
                        </div>
                    )}

                    {scanned && (
                        <div className="space-y-4">
                            <div className="bg-[var(--bg-card-2)] rounded-xl border border-[var(--border)] p-4 space-y-1.5">
                                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">Ordine scansionato</p>
                                {scanned.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-sm">
                                        <span className="font-bold text-[var(--text-main)]">×{item.quantity} {item.name}</span>
                                        <span className="text-[var(--text-muted)] tabular-nums">€{(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between font-black text-[var(--text-main)] border-t border-[var(--border)] pt-2 mt-2">
                                    <span>Totale</span>
                                    <span className="text-[var(--accent)]">€{scanned.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0).toFixed(2)}</span>
                                </div>
                            </div>

                            {!hasCart && (
                                <button onClick={() => onReplace(scanned)}
                                    className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                                    <Check size={14} /> Carica nel carrello
                                </button>
                            )}

                            {hasCart && (
                                <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)] font-bold text-center">Il carrello ha già degli articoli</p>
                                    <button onClick={() => onMerge(scanned)}
                                        className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                                        Unisci ordini
                                    </button>
                                    <button onClick={() => onReplace(scanned)}
                                        className="w-full py-3 bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] hover:border-[var(--accent)] rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                                        Sostituisci carrello
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QRScanModal;