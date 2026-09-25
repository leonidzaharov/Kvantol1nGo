# Builds one complete handoff from the already exported, verified data.
# Requires explicit owner authorization before generating handoff-private exports.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskData=Join-Path $taskRoot 'handoff-private'
$taskInventory=Get-Content -LiteralPath (Join-Path $taskData 'inventory.json') -Raw | ConvertFrom-Json
if (!$taskInventory.checks.localCopyDiffersOnlyByImageUrls -or !$taskInventory.checks.imageHashesVerified -or !$taskInventory.checks.restoreVerification.passed) { throw 'Verify the migration data first' }
& (Join-Path $PSScriptRoot 'package-ubuntu.ps1')
$taskOutput=Join-Path $taskRoot 'deliverables/quantorium-debian-ready.zip'
$taskSource=[IO.Compression.ZipFile]::OpenRead((Join-Path $taskRoot 'deliverables/quantorium-ubuntu-source.zip'))
$taskStream=[IO.File]::Open($taskOutput,[IO.FileMode]::Create)
$taskZip=[IO.Compression.ZipArchive]::new($taskStream,[IO.Compression.ZipArchiveMode]::Create)
$taskManifest=[Collections.Generic.List[object]]::new()
function Add-HandoffEntry([string]$name,[byte[]]$bytes) {
 if ($name -match '(^|/)(lectures|\.env|node_modules|\.next|\.git|\.claude|\.vercel|test-results)(/|$)') { throw "Forbidden archive entry: $name" }
 $entry=$taskZip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
 $entryStream=$entry.Open()
 try { $entryStream.Write($bytes,0,$bytes.Length) } finally { $entryStream.Dispose() }
 $sha=[Security.Cryptography.SHA256]::Create()
 try { $digest=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLower() } finally { $sha.Dispose() }
 $taskManifest.Add([ordered]@{file=$name;bytes=$bytes.Length;sha256=$digest})
}
try {
 Add-HandoffEntry 'README.md' ([IO.File]::ReadAllBytes((Join-Path $taskRoot 'README.md')))
 foreach($sourceEntry in $taskSource.Entries) {
  $memory=[IO.MemoryStream]::new();$inputStream=$sourceEntry.Open()
  try { $inputStream.CopyTo($memory);Add-HandoffEntry ('app/'+$sourceEntry.FullName) $memory.ToArray() } finally { $inputStream.Dispose();$memory.Dispose() }
 }
 foreach($name in @('database-original.json','database-local.json','storage-map.json','storage-manifest.json','inventory.json')) { Add-HandoffEntry ('migration-data/'+$name) ([IO.File]::ReadAllBytes((Join-Path $taskData $name))) }
 $objects=Get-Content -LiteralPath (Join-Path $taskData 'storage-manifest.json') -Raw | ConvertFrom-Json
 foreach($object in ($objects | Sort-Object file -Unique)) {
  if ($object.file -notmatch '^[a-f0-9]{64}\.(png|jpg|gif|webp)$') { throw 'Unsafe export filename' }
  Add-HandoffEntry ('migration-data/uploads/'+$object.file) ([IO.File]::ReadAllBytes((Join-Path $taskData ('uploads/'+$object.file))))
 }
 $manifestBytes=[Text.Encoding]::UTF8.GetBytes(($taskManifest.ToArray() | ConvertTo-Json -Depth 5))
 Add-HandoffEntry 'MANIFEST.json' $manifestBytes
} finally { $taskZip.Dispose();$taskStream.Dispose();$taskSource.Dispose() }
Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  quantorium-debian-ready.zip" } | Set-Content -LiteralPath (Join-Path $taskRoot 'deliverables/quantorium-debian-ready.sha256')
Write-Output "READY: $taskOutput ($($taskManifest.Count) entries)"
