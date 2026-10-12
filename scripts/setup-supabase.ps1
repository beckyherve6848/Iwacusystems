$ErrorActionPreference = 'Stop'

$projectRef = Read-Host 'Enter the new Supabase project ref (the subdomain in its Project URL)'
if ($projectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'Project ref must contain exactly 20 lowercase letters or digits.'
}

Write-Host "Linking to Supabase project $projectRef..."
supabase link --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
  throw 'Supabase link failed. Confirm that you are logged in and have access to this project.'
}

$configPath = Join-Path $PSScriptRoot '..\supabase\config.toml'
$config = Get-Content -LiteralPath $configPath -Raw
if ($config -notmatch '(?m)^project_id\s*=\s*"[^"]*"\s*$') {
  throw 'Could not find project_id in supabase/config.toml.'
}
$config = [regex]::Replace($config, '(?m)^project_id\s*=\s*"[^"]*"\s*$', "project_id = `"$projectRef`"", 1)
Set-Content -LiteralPath $configPath -Value $config -NoNewline

Write-Host 'Applying pending migrations. Review the CLI plan before confirming.'
supabase db push
if ($LASTEXITCODE -ne 0) {
  throw 'Migration push failed. Review the CLI error, resolve it, then run npm run supabase:push.'
}

Write-Host 'Supabase project setup completed.'
