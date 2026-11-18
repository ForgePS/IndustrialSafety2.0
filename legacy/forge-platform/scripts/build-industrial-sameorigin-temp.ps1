$ErrorActionPreference = "Stop"
$root = "C:\Users\jerem\Projects\forge-platform-industrial-recon"
$build = "$env:TEMP\forge-fis-mono-wtlookup"
$appSrc = "$root\apps\industrial-web"
$appDst = "$build\apps\industrial-web"

if (Test-Path $build) { cmd /c "rmdir /s /q `"$build`"" }
New-Item -ItemType Directory -Force -Path "$build\apps" | Out-Null

robocopy $appSrc $appDst /E /XD .next .next_* out out_* node_modules .turbo /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy industrial-web failed: $LASTEXITCODE" }

cmd /c "mklink /J `"$appDst\node_modules`" `"$appSrc\node_modules`"" | Out-Null
Copy-Item "$root\tsconfig.base.json" "$build\tsconfig.base.json" -Force

$cfg = "$appDst\next.config.ts"
$c = Get-Content $cfg -Raw
$c = $c -replace 'outputFileTracingRoot: path\.join\(__dirname, "\.\./\.\."\)', "outputFileTracingRoot: `"$($root -replace '\\','/')`""
Set-Content -Path $cfg -Value $c -NoNewline

$ts = Get-Content "$appDst\tsconfig.json" -Raw | ConvertFrom-Json
$ts.extends = ($root -replace '\\','/') + "/packages/typescript-config/nextjs.json"
($ts | ConvertTo-Json -Depth 10) | Set-Content -Path "$appDst\tsconfig.json" -Encoding utf8

@"
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_URL=https://industrial.forgepublicsafety.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_mJqpAW5qg
NEXT_PUBLIC_COGNITO_CLIENT_ID=7vq5mid0et267n7e2thg2b0kkr
NEXT_PUBLIC_COGNITO_DOMAIN=forge-production-547817.auth.us-east-1.amazoncognito.com
"@ | Set-Content -Path "$appDst\.env.production.local" -Encoding ascii

$env:NODE_ENV = "production"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:NEXT_PRIVATE_WORKER_THREADS = "false"
$env:NEXT_PUBLIC_API_URL = ""
$env:NEXT_PUBLIC_APP_URL = "https://industrial.forgepublicsafety.com"
$env:NEXT_PUBLIC_APP_ENV = "production"
$env:NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_mJqpAW5qg"
$env:NEXT_PUBLIC_COGNITO_CLIENT_ID = "7vq5mid0et267n7e2thg2b0kkr"
$env:NEXT_PUBLIC_COGNITO_DOMAIN = "forge-production-547817.auth.us-east-1.amazoncognito.com"

Push-Location $appDst
try {
  & "$appDst\node_modules\.bin\next.cmd" build
  if ($LASTEXITCODE -ne 0) { throw "next build failed: $LASTEXITCODE" }
  if (-not (Test-Path "$appDst\out\index.html")) { throw "missing out/index.html" }
  Write-Output "TEMP_BUILD_OK"
} finally {
  Pop-Location
}
