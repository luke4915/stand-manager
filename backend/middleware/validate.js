import '../schemas/common.js';

// Valida body e/o parametri con schemi zod prima dell'handler. Se i dati non sono
// validi risponde 400 con il primo problema trovato; altrimenti sostituisce
// req.body con i dati validati (tipi convertiti, campi extra rimossi) e aggiorna req.params.
// Va messo prima di tenantScope, così una richiesta non valida non occupa una connessione.
export function validate({ body, params }) {
  return (req, res, next) => {
    for (const [key, schema] of [['params', params], ['body', body]]) {
      if (!schema) continue;
      const parsed = schema.safeParse(req[key] ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue.path.join('.');
        return res.status(400).json({ error: field ? `${field}: ${issue.message}` : issue.message });
      }
      if (key === 'body') req.body = parsed.data;
      else Object.assign(req.params, parsed.data);
    }
    next();
  };
}
