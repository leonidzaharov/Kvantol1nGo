# Build a source-only Ubuntu handoff. No database, credentials or build cache.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOutputDir = Join-Path $taskRoot 'deliverables'
New-Item -ItemType Directory -Force $taskOutputDir | Out-Null
$taskOutput = Join-Path $taskOutputDir 'quantorium-ubuntu-source.zip'
$taskNames = @('README.md','package.json','package-lock.json','next.config.ts','prisma.config.ts','tsconfig.json','postcss.config.mjs','eslint.config.mjs','vitest.config.ts','vitest.integration.config.ts','playwright.config.ts','vercel.json','AGENTS.md')
$taskFiles = @($taskNames | ForEach-Object { Get-Item -LiteralPath (Join-Path $taskRoot $_) })
foreach ($taskDir in @('src','public','prisma','scripts','e2e','deploy')) { $taskFiles += Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskDir) -Recurse -File }
$taskSecrets = @()
$taskEnv = Join-Path $taskRoot '.env'
if (Test-Path -LiteralPath $taskEnv) {
 foreach ($taskLine in Get-Content -LiteralPath $taskEnv) {
  if ($taskLine -match '^(AUTH_SECRET|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL)=(.+)$') { $taskSecrets += $Matches[2].Trim().Trim('"').Trim("'") }
 }
}
$taskManifest = @()
$taskStream = [IO.File]::Open($taskOutput,[IO.FileMode]::Create)
$taskZip = [IO.Compression.ZipArchive]::new($taskStream,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($taskFile in $taskFiles) {
  $taskRelative = [IO.Path]::GetRelativePath($taskRoot,$taskFile.FullName).Replace('\','/')
  if ($taskRelative.StartsWith('src/generated/') -or $taskRelative -eq 'e2e/.fixtures.json' -or $taskFile.Name.StartsWith('.env') -or $taskFile.Extension -in @('.db','.pem','.log','.zip')) { continue }
  if ($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink in source list; review packaging' }
  $taskBytes = [IO.File]::ReadAllBytes($taskFile.FullName)
  $taskText = [Text.Encoding]::UTF8.GetString($taskBytes)
  foreach ($taskSecret in $taskSecrets) { if ($taskSecret.Length -ge 16 -and $taskText.Contains($taskSecret)) { throw "Secret detected in $taskRelative; archive must not be sent" } }
  $taskEntry = $taskZip.CreateEntry($taskRelative,[IO.Compression.CompressionLevel]::Optimal)
  $taskEntryStream = $taskEntry.Open()
  try { $taskEntryStream.Write($taskBytes,0,$taskBytes.Length) } finally { $taskEntryStream.Dispose() }
  $taskManifest += [ordered]@{file=$taskRelative;bytes=$taskBytes.Length;sha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLower()}
 }
} finally { $taskZip.Dispose();$taskStream.Dispose() }
$taskManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskOutputDir 'source-manifest.json')
Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  quantorium-ubuntu-source.zip" } | Set-Content -LiteralPath (Join-Path $taskOutputDir 'SHA256SUMS.txt')
Write-Output "Packaged $($taskManifest.Count) source files. No database or environment secrets included."
