# Voice-over lines: one loudness for every file + the game's formats. Windows PowerShell (also pwsh) + ffmpeg in PATH.
#   MP3 (Fish Audio) -> MP3, WAV -> OGG (Vorbis), OGG -> OGG; the name (= the line ID, A00_001…) is kept.
#   Loudness: EBU R128 two-pass loudnorm (measure, then a linear gain), -18 LUFS, peaks under -1.5 dBTP; mono, 44.1 kHz.
#   The originals are never touched: the results go to the output folder.
# Usage (in PowerShell):
#   powershell -ExecutionPolicy Bypass -File tools\audio\normalize_voice.ps1 -In "D:\voice_raw" -Out "public\audio\voice"
#   -Lufs -16   louder (default -18: room for music and effects)
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Lufs = -18,
  [double]$Peak = -1.5
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Host 'ffmpeg не найден: установи его и добавь в PATH (ffmpeg -version должна работать).'; exit 1 }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$files = @(Get-ChildItem -Path $In -File | Where-Object { $_.Extension -match '^\.(mp3|wav|ogg)$' })
if (-not $files.Count) { Write-Host "В папке $In нет файлов .mp3 / .wav / .ogg"; exit 1 }
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$target = 'I={0}:TP={1}:LRA=11' -f $Lufs.ToString($inv), $Peak.ToString($inv)
$ok = 0; $bad = @()
foreach ($f in $files) {
  $ext = $f.Extension.ToLowerInvariant()
  $dst = Join-Path $Out ($f.BaseName + $(if ($ext -eq '.mp3') { '.mp3' } else { '.ogg' }))
  $codec = if ($ext -eq '.mp3') { @('-c:a', 'libmp3lame', '-b:a', '128k') } else { @('-c:a', 'libvorbis', '-q:a', '5') }
  try {
    # pass 1: measure (ffmpeg prints the numbers as JSON at the end of its log)
    $log = (& ffmpeg -hide_banner -nostats -i $f.FullName -af "loudnorm=$($target):print_format=json" -f null - 2>&1 | Out-String)
    $m = [regex]::Match($log, '\{[^{}]*"input_i"[^{}]*\}')
    if (-not $m.Success) { throw 'нет замера громкости' }
    $j = $m.Value | ConvertFrom-Json
    if ($j.input_i -eq '-inf') { throw 'тишина' }
    # pass 2: one gain for the whole line (linear: no pumping), back to 44.1 kHz mono
    $af = "loudnorm=$($target):measured_I=$($j.input_i):measured_TP=$($j.input_tp):measured_LRA=$($j.input_lra):measured_thresh=$($j.input_thresh):offset=$($j.target_offset):linear=true"
    & ffmpeg -hide_banner -loglevel error -y -i $f.FullName -af $af -ar 44100 -ac 1 @codec $dst
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg вернул $LASTEXITCODE" }
    $ok++
    Write-Host ('{0,-24} {1,7} LUFS -> {2}' -f $f.Name, $j.input_i, (Split-Path $dst -Leaf))
  } catch {
    $bad += $f.Name
    Write-Host ('{0,-24} ОШИБКА: {1}' -f $f.Name, $_.Exception.Message)
  }
}
Write-Host ''
Write-Host "Готово: $ok из $($files.Count) -> $Out"
if ($bad.Count) { Write-Host ('Не обработаны: ' + ($bad -join ', ')) }
# the same ID in two formats would be ambiguous for the game
$dup = Get-ChildItem -Path $Out -File | Where-Object { $_.Extension -match '^\.(mp3|ogg)$' } | Group-Object BaseName | Where-Object { $_.Count -gt 1 }
foreach ($d in $dup) { Write-Host "Внимание: $($d.Name) есть и в .mp3, и в .ogg — оставь один файл." }
