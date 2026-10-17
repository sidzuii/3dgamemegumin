# Мегумин: маленький локальный веб-сервер для собранной игры. Ничего ставить не нужно: Windows PowerShell + .NET HttpListener.
# Запускается из Play.bat; игра открывается в браузере по адресу http://localhost:<порт>/. Чтобы выключить — закрыть это окно.
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'game'))
$rootSep = $root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (-not [System.IO.File]::Exists((Join-Path $root 'index.html'))) {
  Write-Host 'Не найдена папка game с игрой рядом с Play.bat. Распакуй архив целиком.'
  Read-Host 'Нажми Enter'
  exit 1
}
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.bin' = 'application/octet-stream'; '.wasm' = 'application/wasm'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'; '.ktx2' = 'image/ktx2'; '.hdr' = 'application/octet-stream'
  '.ogg' = 'audio/ogg'; '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'
}
# the first free port from 4173
$listener = $null
foreach ($p in 4173..4199) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $port = $p; break } catch { $l.Close() }
}
if (-not $listener) {
  Write-Host 'Не удалось открыть порт 4173-4199.'
  Read-Host 'Нажми Enter'
  exit 1
}
$url = "http://localhost:$port/"
Write-Host ''
Write-Host "  Мегумин запущена: $url"
Write-Host '  Если браузер не открылся сам — открой этот адрес в Chrome, Edge или Firefox.'
Write-Host '  Чтобы выключить игру, закрой это окно.'
Write-Host ''
try { Start-Process $url } catch { } # no default browser: the address is printed above
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '' -or $rel.EndsWith('/')) { $rel = $rel + 'index.html' }
      $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $path.StartsWith($rootSep, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($path)) {
        $res.StatusCode = 404
        $b = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $res.OutputStream.Write($b, 0, $b.Length)
      } else {
        $ct = $types[[System.IO.Path]::GetExtension($path).ToLowerInvariant()]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $res.ContentType = $ct
        $res.Headers['Cache-Control'] = 'no-cache'
        $fs = [System.IO.File]::OpenRead($path)
        try {
          $res.ContentLength64 = $fs.Length
          if ($req.HttpMethod -ne 'HEAD') { $fs.CopyTo($res.OutputStream) }
        } finally { $fs.Dispose() }
      }
    } catch {
      # the browser closed the connection mid-file (a reload): nothing to do
    } finally {
      try { $res.OutputStream.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
