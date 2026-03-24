# =============================================================
# BSG SQL Standards MCP — Installer
# Uso: .\install.ps1 [-InstallPath "C:\ruta\deseada"]
# Requisitos: Node.js >= 18, npm
# =============================================================

param(
    [string]$InstallPath = "$env:USERPROFILE\mcp\lolosqltools"
)

$ErrorActionPreference = "Stop"

# ── Colores ────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n[>] $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "`n[ERROR] $msg" -ForegroundColor Red; exit 1 }

Write-Host "`n=============================================" -ForegroundColor Magenta
Write-Host "  LOLOSQLTOOLS MCP — Installer v1.0" -ForegroundColor Magenta
Write-Host "=============================================`n" -ForegroundColor Magenta

# ── 1. Verificar Node.js ──────────────────────────────────
Write-Step "Verificando Node.js..."
try {
    $nodeVersion = node --version 2>&1
    Write-Ok "Node.js $nodeVersion encontrado"
} catch {
    Write-Fail "Node.js no encontrado. Instalalo desde https://nodejs.org (v18 o superior)"
}

# ── 2. Detectar directorio fuente ────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Step "Directorio fuente: $ScriptDir"

# ── 3. Copiar fuentes al destino ──────────────────────────
Write-Step "Copiando archivos a: $InstallPath"

if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    Write-Ok "Directorio creado"
} else {
    Write-Warn "El directorio ya existe, se sobreescribiran los archivos"
}

# Copiar src, package.json, tsconfig.json (excluir node_modules y dist)
$itemsToCopy = @("src", "package.json", "tsconfig.json")
foreach ($item in $itemsToCopy) {
    $source = Join-Path $ScriptDir $item
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination $InstallPath -Recurse -Force
        Write-Ok "Copiado: $item"
    } else {
        Write-Fail "No se encontro el archivo/directorio requerido: $source"
    }
}

# ── 4. npm install ────────────────────────────────────────
Write-Step "Instalando dependencias (npm install)..."
Push-Location $InstallPath
try {
    npm install --silent
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install fallo" }
    Write-Ok "Dependencias instaladas"
} finally {
    Pop-Location
}

# ── 5. Build TypeScript ───────────────────────────────────
Write-Step "Compilando TypeScript (npm run build)..."
Push-Location $InstallPath
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "La compilacion TypeScript fallo" }
    Write-Ok "Build exitoso -> $InstallPath\dist\index.js"
} finally {
    Pop-Location
}

# ── 6. Verificar que el entry point existe ────────────────
$EntryPoint = Join-Path $InstallPath "dist\index.js"
if (-not (Test-Path $EntryPoint)) {
    Write-Fail "No se encontro el entry point compilado: $EntryPoint"
}

# ── 7. Registrar en ~/.claude/.mcp.json ──────────────────
Write-Step "Registrando MCP en Claude Code..."

$ClaudeDir  = "$env:USERPROFILE\.claude"
$McpFile    = "$ClaudeDir\.mcp.json"
$EntryNorm  = $EntryPoint -replace "\\", "/"

if (-not (Test-Path $ClaudeDir)) {
    New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
}

# Leer config actual o crear estructura base
if (Test-Path $McpFile) {
    $config = Get-Content $McpFile -Raw | ConvertFrom-Json
} else {
    $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
}

if ($null -eq $config.mcpServers) {
    $config | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{})
}

# Agregar/actualizar entrada bsg-sql-standards
$entry = [PSCustomObject]@{
    command = "node"
    args    = @($EntryNorm)
}

if ($config.mcpServers.PSObject.Properties["lolosqltools"]) {
    $config.mcpServers."lolosqltools" = $entry
    Write-Warn "Entrada 'lolosqltools' actualizada (ya existia)"
} else {
    $config.mcpServers | Add-Member -MemberType NoteProperty -Name "lolosqltools" -Value $entry
    Write-Ok "Entrada 'lolosqltools' agregada"
}

$config | ConvertTo-Json -Depth 10 | Set-Content $McpFile -Encoding UTF8
Write-Ok "Guardado en: $McpFile"

# ── 8. Agregar instrucciones a CLAUDE.md ──────────────────
Write-Step "Verificando CLAUDE.md..."

$ClaudeMd = "$ClaudeDir\CLAUDE.md"
$McpSection = "## BSG SQL Standards MCP"

if (Test-Path $ClaudeMd) {
    $mdContent = Get-Content $ClaudeMd -Raw
    if ($mdContent -match [regex]::Escape($McpSection)) {
        Write-Warn "CLAUDE.md ya contiene la seccion BSG SQL Standards — no se modifico"
    } else {
        Write-Warn "CLAUDE.md existe pero no tiene la seccion BSG. Agregala manualmente si la necesitas."
    }
} else {
    Write-Warn "No existe CLAUDE.md en $ClaudeDir. Crea uno con las instrucciones del MCP si lo necesitas."
}

# ── Resumen ────────────────────────────────────────────────
Write-Host "`n=============================================" -ForegroundColor Magenta
Write-Host "  Instalacion completada exitosamente!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Instalado en : $InstallPath"
Write-Host "  Entry point  : $EntryNorm"
Write-Host "  Config MCP   : $McpFile"
Write-Host ""
Write-Host "  PROXIMO PASO: Reinicia Claude Code para" -ForegroundColor Yellow
Write-Host "  cargar el nuevo MCP server." -ForegroundColor Yellow
Write-Host ""
