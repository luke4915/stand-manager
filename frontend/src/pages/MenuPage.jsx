import { useEffect, useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QRCodeCanvas } from 'qrcode.react';
import { ShoppingCart, Plus, Minus, X, ChefHat, Trash2, Download, QrCode } from 'lucide-react';

import { apiFetch } from '../utils/apiClient';
const ProductCard = ({ product, quantity, onAdd, onRemove }) => (
    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)]">
        <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: product.color || 'var(--accent)' }} />
            <div className="min-w-0">
                <p className="font-black text-sm uppercase tracking-tight text-[var(--text-main)] truncate">{product.name}</p>
                <p className="text-[var(--accent)] font-black text-sm mt-0.5">€{parseFloat(product.price).toFixed(2)}</p>
            </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
            {quantity > 0 && (
                <>
                    <button onClick={() => onRemove(product)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 transition-all active:scale-95">
                        <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-black text-[var(--text-main)]">{quantity}</span>
                </>
            )}
            <button onClick={() => onAdd(product)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-all active:scale-95">
                <Plus size={14} />
            </button>
        </div>
    </div>
);

export default function MenuPage() {
    const [sessionName, setSessionName] = useState('');
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showQR, setShowQR] = useState(false);
    const [enlargedQR, setEnlargedQR] = useState(false);
    const [showCart, setShowCart] = useState(false)
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                // Il messaggio di benvenuto è facoltativo: se non arriva il menu si mostra comunque.
                const [menuData, settingsData] = await Promise.all([
                    apiFetch('/products/menu'),
                    apiFetch('/settings').catch(() => ({})),
                ]);
                setSessionName(menuData.sessionName || 'Menu');
                setProducts(menuData.products);
                setWelcomeMessage(settingsData.welcome_message || '');
            } catch {
                setError('Menu non disponibile al momento.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const addToCart = (product) => {
        setCart(prev => ({ ...prev, [product.id]: { ...product, quantity: (prev[product.id]?.quantity || 0) + 1 } }));
    };

    const removeFromCart = (product) => {
        setCart(prev => {
            const qty = (prev[product.id]?.quantity || 0) - 1;
            if (qty <= 0) { const next = { ...prev }; delete next[product.id]; return next; }
            return { ...prev, [product.id]: { ...prev[product.id], quantity: qty } };
        });
    };

    const clearCart = () => { setCart({}); setShowClearConfirm(false); setShowQR(false); };

    const cartItems = Object.values(cart);
    const total = cartItems.reduce((sum, i) => sum + parseFloat(i.price) * i.quantity, 0);
    const totalItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    const qrData = useMemo(() => {
        if (!cartItems.length) return '';
        // Solo id e quantità: la cassa legge il resto dal proprio catalogo
        return btoa(JSON.stringify(cartItems.map(i => ({ id: i.id, quantity: i.quantity }))));
    }, [cartItems]);

    const grouped = useMemo(() => {
        const map = {};
        products.forEach(p => {
            if (!map[p.category]) map[p.category] = [];
            map[p.category].push(p);
        });
        return map;
    }, [products]);

    const downloadQR = () => {
        const canvas = document.getElementById('qr-canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ordine-qr.png';
        a.click();
    };

    if (loading) return (
        <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
            <p className="text-[var(--text-muted)] text-sm font-black uppercase tracking-widest">Caricamento...</p>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-[var(--bg-main)] flex flex-col items-center justify-center gap-4 px-6">
            <ChefHat size={48} className="text-[var(--text-muted)] opacity-30" />
            <p className="text-[var(--text-muted)] font-black uppercase tracking-widest text-sm text-center">{error}</p>
        </div>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', backgroundColor: 'var(--bg-main)' }}>
            <div className="pb-32">

                {/* Header */}
                <div className="sticky top-0 z-10 bg-[var(--bg-main)] border-b border-[var(--border)] px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[var(--accent)] rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-[var(--accent-shadow)]">S</div>
                        <div>
                            <p className="font-black text-base text-[var(--text-main)] leading-none">{sessionName}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">Scegli i tuoi prodotti</p>
                        </div>
                    </div>
                </div>

                {/* Messaggio benvenuto */}
                {welcomeMessage && (
                    <div className="mx-4 mt-4 px-4 py-3 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-2xl">
                        <p className="text-sm text-[var(--text-main)] font-medium">{welcomeMessage}</p>
                    </div>
                )}

                {/* Prodotti */}
                <div className="px-4 pt-5 space-y-6">
                    {Object.entries(grouped).map(([category, items]) => (
                        <div key={category}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">{category}</p>
                            <div className="space-y-2">
                                {items.map(product => (
                                    <ProductCard key={product.id} product={product}
                                        quantity={cart[product.id]?.quantity || 0}
                                        onAdd={addToCart} onRemove={removeFromCart} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Carrello fisso in basso */}
            {totalItems > 0 && (
                <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)] to-transparent">
                    <div className="flex gap-2">
                        <button onClick={() => setShowClearConfirm(true)}
                            className="w-12 h-12 flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] text-red-500 rounded-2xl hover:bg-red-500/10 transition-all active:scale-95">
                            <Trash2 size={18} />
                        </button>
                        <button onClick={() => setShowCart(true)}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-black text-sm transition-all active:scale-95">
                            <ShoppingCart size={18} />
                            <span className="uppercase tracking-widest">{totalItems}</span>
                            <span className="text-[var(--text-muted)] font-bold">€{total.toFixed(2)}</span>
                        </button>
                        <button onClick={() => setShowQR(true)}
                            className="w-12 h-12 flex items-center justify-center bg-[var(--accent)] text-white rounded-2xl shadow-lg shadow-[var(--accent-shadow)] hover:bg-[var(--accent-hover)] transition-all active:scale-95">
                            <QrCode size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal conferma svuota */}
            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                    <div className="w-full max-w-sm bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] p-6 space-y-4 text-center">
                        <p className="font-black text-lg text-[var(--text-main)]">Svuotare il carrello?</p>
                        <p className="text-sm text-[var(--text-muted)]">Tutti i prodotti selezionati verranno rimossi.</p>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowClearConfirm(false)}
                                className="flex-1 py-3 border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-black text-sm hover:bg-[var(--bg-card-2)] transition-all">
                                ANNULLA
                            </button>
                            <button onClick={clearCart}
                                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-sm hover:bg-red-600 transition-all">
                                SVUOTA
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal riepilogo carrello */}
            {showCart && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4 pb-4">
                    <div className="w-full max-w-sm bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-black text-lg text-[var(--text-main)]">Il tuo carrello</h2>
                            <button onClick={() => setShowCart(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-[var(--bg-card-2)] text-[var(--text-muted)] transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <ul className="space-y-1.5">
                            {cartItems.map(item => (
                                <li key={item.id} className="flex justify-between text-sm">
                                    <span className="text-[var(--text-main)] font-bold">×{item.quantity} {item.name}</span>
                                    <span className="text-[var(--text-muted)]">€{(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-between font-black text-[var(--text-main)] border-t border-[var(--border)] pt-3">
                            <span>Totale</span>
                            <span className="text-[var(--accent)]">€{total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal QR */}
            {showQR && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4 pb-4">
                    <div className="w-full max-w-sm bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-black text-lg text-[var(--text-main)]">Il tuo ordine</h2>
                            <button onClick={() => setShowQR(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-[var(--bg-card-2)] text-[var(--text-muted)] transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        <ul className="space-y-1.5">
                            {cartItems.map(item => (
                                <li key={item.id} className="flex justify-between text-sm">
                                    <span className="text-[var(--text-main)] font-bold">×{item.quantity} {item.name}</span>
                                    <span className="text-[var(--text-muted)]">€{(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-between font-black text-[var(--text-main)] border-t border-[var(--border)] pt-3">
                            <span>Totale</span>
                            <span className="text-[var(--accent)]">€{total.toFixed(2)}</span>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                            {/* Sostituisci il vecchio contenitore del QR con questo cliccabile */}
                            {/* 🚀 CODICE CORRETTO: Sostituisci il blocco del QR con questo */}
                            <div
                                onClick={() => setEnlargedQR(true)}
                                className="p-4 bg-white rounded-2xl cursor-pointer hover:scale-105 transition-transform"
                                title="Clicca per ingrandire"
                            >
                                <QRCodeCanvas id="qr-canvas" value={qrData} size={200} />
                            </div>
                            <p className="text-xs text-[var(--text-muted)] text-center font-bold">Mostra questo QR alla cassa</p>
                            <button onClick={downloadQR}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[var(--accent)]/10 transition-all">
                                <Download size={14} /> Salva QR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 📱 NUOVO: Modal QR a Schermo Intero (Ottimizzato per iOS e Android) */}
            {enlargedQR && (
                <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[100] animate-fade-in select-none">

                    {/* Pulsante di chiusura (X) in alto a destra */}
                    <button
                        onClick={() => setEnlargedQR(false)}
                        className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all"
                    >
                        <X size={24} />
                    </button>

                    {/* Contenitore centrale del QR gigante */}
                    <div className="w-full max-w-xs px-4 flex flex-col items-center gap-6 text-center">
                        <div className="p-6 bg-white rounded-3xl shadow-2xl">
                            {/* Ne disegnamo un secondo, più grande (300px), per facilitare la scansione laser */}
                            <QRCodeCanvas value={qrData} size={280} />
                        </div>

                        <div>
                            <p className="font-black text-lg text-white uppercase tracking-wider">Il tuo codice QR:</p>
                            <p className="text-xs text-white/60 mt-1">Mostralo direttamente in cassa!</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}