param(
  [switch]$SkipSupabaseStatus
)

$ErrorActionPreference = "Stop"

function Write-Check($Label, $Value) {
  Write-Host ("[OK] {0}: {1}" -f $Label, $Value)
}

function Require-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Required command '$Name' was not found in PATH."
  }

  Write-Check $Name $cmd.Source
}

Write-Host "Forge Industrial Safety 2.0 - Local Development Doctor"
Write-Host "--------------------------------------------------------"

Require-Command "node"
Require-Command "pnpm"
Require-Command "supabase"
Require-Command "docker"

$nodeVersion = (& node --version).Trim()
$pnpmVersion = (& pnpm --version).Trim()
$supabaseVersion = (& supabase --version).Trim()

Write-Check "Node version" $nodeVersion
Write-Check "pnpm version" $pnpmVersion
Write-Check "Supabase CLI" $supabaseVersion

$envPath = Join-Path $PSScriptRoot "..\apps\web\.env.local"
$envPath = [System.IO.Path]::GetFullPath($envPath)

if (-not (Test-Path $envPath)) {
  throw "Missing apps/web/.env.local. Copy apps/web/.env.example to apps/web/.env.local and add the local Supabase values."
}

Write-Check ".env.local" $envPath

$requiredVariables = @(
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_APP_DOMAIN",
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_APP_TITLE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET"
)

$envLines = Get-Content $envPath
foreach ($variable in $requiredVariables) {
  $line = $envLines | Where-Object { $_ -match "^$([regex]::Escape($variable))=" } | Select-Object -First 1
  if (-not $line) {
    throw "Missing required variable '$variable' in apps/web/.env.local."
  }

  $value = ($line -split "=", 2)[1].Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Variable '$variable' is present but empty in apps/web/.env.local."
  }
}

$publicServiceRole = $envLines | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=" } | Select-Object -First 1
if ($publicServiceRole) {
  throw "Unsafe variable NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is present. Use SUPABASE_SERVICE_ROLE_KEY instead."
}

Write-Check "Environment validation" "passed"

if (-not $SkipSupabaseStatus) {
  Push-Location (Join-Path $PSScriptRoot "..\apps\web")
  try {
    & supabase status | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Local Supabase is not running. Run 'pnpm web:supabase:start'."
    }
  }
  finally {
    Pop-Location
  }

  Write-Check "Local Supabase" "running"
}

Write-Host ""
Write-Host "Local development prerequisites passed."
Write-Host "Next:"
Write-Host "  pnpm web:supabase:reset"
Write-Host "  pnpm dev"
