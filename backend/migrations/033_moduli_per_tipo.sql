-- Un locale è di un solo tipo: sagra/paninaro e ristorante non condividono i moduli (utils/modules.js).
-- Toglie i moduli che non esistono per il tipo del tenant. Idempotente.
UPDATE tenants SET modules = array_remove(modules, 'tables')  WHERE business_type <> 'ristorante' AND 'tables'  = ANY(modules);
UPDATE tenants SET modules = array_remove(modules, 'qr_menu') WHERE business_type = 'ristorante'  AND 'qr_menu' = ANY(modules);
