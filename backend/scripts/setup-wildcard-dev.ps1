# setup-wildcard-dev.ps1
# Da lanciare UNA VOLTA SOLA (PowerShell come Amministratore), dalla cartella
# del progetto. Dopo questo, aggiungere un nuovo tenant di test in locale
# richiede solo add-tenant-host.ps1 <slug> (vite.config.js ammette già tutti i sottodomini).

Write-Host "1/2 - Certificato wildcard (copre TUTTI i tenant futuri)..."
New-Item -ItemType Directory -Force "backend\certs" | Out-Null
Set-Location "backend\certs"
mkcert -install
mkcert "*.standmanager.local" "standmanager.local" "localhost" "127.0.0.1" "::1"
Set-Location "..\.."

Write-Host "2/2 - Aggiorna HTTPS_KEY_PATH/HTTPS_CERT_PATH nel .env del backend"
Write-Host "      coi nomi dei file appena generati in backend\certs\"

Write-Host "`nFatto. Da ora, per un NUOVO tenant di test basta:"
Write-Host "  .\add-tenant-host.ps1 nomeslug"
