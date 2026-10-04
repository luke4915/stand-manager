import pino from 'pino';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // Mai nei log: cookie, intestazioni di autorizzazione e password, anche se qualcuno logga un oggetto richiesta
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.password_hash', '*.token'], censor: '[nascosto]' },
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
        : undefined,
});

export default logger;