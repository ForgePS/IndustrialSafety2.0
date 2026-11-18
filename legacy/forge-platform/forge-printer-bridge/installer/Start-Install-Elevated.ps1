<#
.SYNOPSIS
  One-click elevated install launcher (UAC). Prefer the .cmd double-click entry.
#>
$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "Install-Dev.ps1"
if (-not (Test-Path $script)) {
  throw "Missing $script"
}

# When already elevated, run install in this window so the user sees progress + Done dialog.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
  & $script
  exit $LASTEXITCODE
}

Write-Host "Requesting administrator permission (UAC)..."
$p = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$script`""
)
exit $p.ExitCode
