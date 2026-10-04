#!/usr/bin/env bash
# Backup del database: dump compresso (pg_dump -Fc) con rotazione.
#
# Uso:   BACKUP_DATABASE_URL=postgres://utente:password@host/db backend/scripts/backup.sh [cartella] [giorni]
#   cartella  dove scrivere i dump (default: ./backups)
#   giorni    quanti giorni di dump tenere (default: 14)
#
# Serve un utente che legga TUTTE le righe di tutti i tenant (scavalca la RLS), quindi lo stesso
# privilegiato delle migrazioni, non l'utente applicativo. Il dump contiene dati di tutti i clienti:
# la cartella dei backup va protetta e, meglio, copiata fuori dal server (altro disco o storage remoto).
# Pianificazione consigliata: ogni notte e prima di ogni migrazione.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Imposta BACKUP_DATABASE_URL (utente privilegiato)}"
DIR="${1:-./backups}"
KEEP_DAYS="${2:-14}"

mkdir -p "$DIR"
chmod 700 "$DIR"
FILE="$DIR/standmanager-$(date +%Y%m%d-%H%M%S).dump"

pg_dump --format=custom --no-owner --file="$FILE.partial" "$BACKUP_DATABASE_URL"
mv "$FILE.partial" "$FILE"      # un dump interrotto non resta mai col nome definitivo
chmod 600 "$FILE"

# Il dump deve poter essere letto: se l'elenco del contenuto fallisce, il backup non vale
pg_restore --list "$FILE" > /dev/null

find "$DIR" -name 'standmanager-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Backup creato: $FILE ($(du -h "$FILE" | cut -f1))"
