# Build industrial-web from a short path and sync to production.
#
# The SPA must call the API same-origin (relative /api via the industrial CloudFront
# /api/* behavior). The HttpOnly __Host- session cookie is SameSite=Strict, so baking a
# cross-site API host (e.g. https://dygmtx4vxgy9i.cloudfront.net) means /auth/session/refresh
# never receives the cookie and users are signed out about an hour after login.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-industrial-web-production.ps1 [-Label name]
param(
  [string]$Label = "industrial-web"
)

$ErrorActionPreference = "Stop"
$repo = "C:\Users\jerem\Projects\forge-platform-industrial-recon"
$log = "$repo\scripts\_deploy-$Label-web-out.txt"
function Log($m) { Add-Content -Path $log -Value $m; Write-Host $m }
Set-Content -Path $log -Value "START $(Get-Date -Format o)"

try {
  $buildRoot = "C:\Temp\forge-iw-$Label"
  if (Test-Path $buildRoot) { Remove-Item -Recurse -Force $buildRoot }
  New-Item -ItemType Directory -Path $buildRoot | Out-Null
  robocopy "$repo\apps\industrial-web" "$buildRoot\apps\industrial-web" /E /XD node_modules .next out .next_locked* out_bak* .next_deploy* /XF .env .env.local .env.production .env.production.local /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  robocopy "$repo\packages" "$buildRoot\packages" /E /XD node_modules .turbo dist /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  foreach ($f in @("package.json","pnpm-lock.yaml","pnpm-workspace.yaml","tsconfig.base.json","tsconfig.json")) {
    if (Test-Path "$repo\$f") { Copy-Item "$repo\$f" "$buildRoot\$f" -Force }
  }
  New-Item -ItemType Junction -Path "$buildRoot\apps\industrial-web\node_modules" -Target "$repo\apps\industrial-web\node_modules" | Out-Null
  if (Test-Path "$repo\node_modules") {
    New-Item -ItemType Junction -Path "$buildRoot\node_modules" -Target "$repo\node_modules" -ErrorAction SilentlyContinue | Out-Null
  }
  Log "SOURCE_COPIED"

  # Setting $env:X = "" deletes the variable in PowerShell; the empty same-origin value
  # comes from .env.production.local instead.
  Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
  $env:FORGE_SAME_ORIGIN_API = "1"
  $env:NODE_ENV = "production"
  $env:NEXT_PUBLIC_APP_ENV = "production"
  $env:NEXT_PUBLIC_APP_URL = "https://d1n0e5wvjwbpdf.cloudfront.net"
  $env:NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_mJqpAW5qg"
  $env:NEXT_PUBLIC_COGNITO_CLIENT_ID = "7vq5mid0et267n7e2thg2b0kkr"
  $env:NEXT_PUBLIC_COGNITO_DOMAIN = "forge-production-547817.auth.us-east-1.amazoncognito.com"
  @"
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_URL=$($env:NEXT_PUBLIC_APP_URL)
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$($env:NEXT_PUBLIC_COGNITO_USER_POOL_ID)
NEXT_PUBLIC_COGNITO_CLIENT_ID=$($env:NEXT_PUBLIC_COGNITO_CLIENT_ID)
NEXT_PUBLIC_COGNITO_DOMAIN=$($env:NEXT_PUBLIC_COGNITO_DOMAIN)
"@ | Set-Content "$buildRoot\apps\industrial-web\.env.production.local" -Encoding utf8

  Set-Location "$buildRoot\apps\industrial-web"
  Log "INDUSTRIAL_BUILD_START"
  $buildLog = "$repo\scripts\_deploy-$Label-web-build.txt"
  cmd /c "npx next build --no-lint > `"$buildLog`" 2>&1"
  $buildCode = $LASTEXITCODE
  if ($buildCode -ne 0) { Log "INDUSTRIAL_BUILD_FAIL $buildCode"; Get-Content $buildLog -Tail 50 | ForEach-Object { Log $_ }; exit $buildCode }
  $outDir = "$buildRoot\apps\industrial-web\out"
  if (-not (Test-Path "$outDir\index.html")) { Log "INDUSTRIAL_OUT_MISSING"; exit 1 }

  $crossSite = Get-ChildItem "$outDir\_next\static" -Recurse -Filter *.js | Select-String -Pattern "dygmtx4vxgy9i\.cloudfront\.net|api\.forgepublicsafety\.com" -List
  if ($crossSite) { Log "CROSS_SITE_API_BAKED $($crossSite[0].Path)"; exit 4 }
  $sameOrigin = Get-ChildItem "$outDir\_next\static" -Recurse -Filter *.js | Select-String -Pattern 'baseUrl:""' -SimpleMatch -List
  if (-not $sameOrigin) { Log "SAME_ORIGIN_BASEURL_MISSING"; exit 5 }
  Log "INDUSTRIAL_OUT_OK_SAME_ORIGIN"

  robocopy $outDir "$repo\apps\industrial-web\out" /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  Set-Location $repo
  Log "INDUSTRIAL_SYNC_START"
  & node scripts/sync-static-site.mjs --app industrial --environment production --skip-build 2>&1 | Tee-Object -FilePath "$repo\scripts\_deploy-$Label-web-sync.txt"
  if ($LASTEXITCODE -ne 0) { Log "INDUSTRIAL_SYNC_FAIL $LASTEXITCODE"; exit $LASTEXITCODE }
  Log "DONE"
  exit 0
} catch {
  Log "ERROR $($_.Exception.Message)"
  exit 1
}
