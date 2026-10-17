# Мегумин как настольная программа (Windows, ничего ставить не нужно).
#   serve.ps1 -Install   из Play.bat: ярлыки «Мегумин» на рабочем столе и в «Пуске» (иконка megumin.ico), затем запуск игры
#   serve.ps1            из ярлыка (окно PowerShell скрыто): маленький веб-сервер game/ на localhost:4173 + окно игры в режиме
#                        приложения Edge/Chrome (без адресной строки, свой профиль = свои сохранения); окно закрыто -> сервер выключен
#   serve.ps1 -Server    только сервер, в видимой консоли (проверка / другой браузер)
param([switch]$Install, [switch]$Server)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = [System.IO.Path]::GetFullPath((Join-Path $here 'game'))
$port0 = 4173
$data = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Megumin'
$isWin = [Environment]::OSVersion.Platform -eq 'Win32NT'

function Say([string]$text) {
  if ($isWin -and -not $Server) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($text, 'Мегумин')
  } else { Write-Host $text }
}

try {
  if (-not [System.IO.File]::Exists((Join-Path $root 'index.html'))) { throw 'Не найдена папка app\game с игрой. Распакуй архив целиком.' }

  $self = Join-Path $here 'serve.ps1'
  $psExe = Join-Path $PSHOME 'powershell.exe'
  if (-not [System.IO.File]::Exists($psExe)) { $psExe = 'powershell.exe' }
  $launchArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $self + '"'

  if ($Install) {
    $sh = New-Object -ComObject WScript.Shell
    $places = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
    foreach ($dir in $places) {
      if (-not $dir) { continue }
      $lnk = $sh.CreateShortcut((Join-Path $dir 'Мегумин.lnk'))
      $lnk.TargetPath = $psExe
      $lnk.Arguments = $launchArgs
      $lnk.WorkingDirectory = $here
      $lnk.IconLocation = (Join-Path $here 'megumin.ico') + ',0'
      $lnk.WindowStyle = 7
      $lnk.Description = 'Мегумин: Дорога приключений'
      $lnk.Save()
    }
    Start-Process -FilePath $psExe -ArgumentList $launchArgs -WindowStyle Hidden
    exit 0
  }

  # already running (a second click on the shortcut): just open another window on the same address (same saves)
  $running = $false
  try {
    $wc = New-Object System.Net.WebClient
    $running = $wc.DownloadString("http://localhost:$port0/__megumin") -eq 'megumin'
  } catch { }

  $listener = $null; $port = $port0
  if (-not $running) {
    foreach ($p in $port0..($port0 + 26)) {
      $l = New-Object System.Net.HttpListener
      $l.Prefixes.Add("http://localhost:$p/")
      try { $l.Start(); $listener = $l; $port = $p; break } catch { $l.Close() }
    }
    if (-not $listener) { throw "Не удалось открыть порт $port0-$($port0 + 26)." }
    $types = @{
      '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
      '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
      '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.bin' = 'application/octet-stream'; '.wasm' = 'application/wasm'
      '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'
      '.ico' = 'image/x-icon'; '.ktx2' = 'image/ktx2'; '.hdr' = 'application/octet-stream'
      '.ogg' = 'audio/ogg'; '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'
    }
    # the server loop runs on its own thread; Stop() on the listener ends it
    $serve = {
      param($listener, $root, $types)
      $rootSep = $root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
      while ($listener.IsListening) {
        try { $ctx = $listener.GetContext() } catch { break }
        $req = $ctx.Request; $res = $ctx.Response
        try {
          $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
          if ($rel -eq '__megumin') {
            $b = [System.Text.Encoding]::UTF8.GetBytes('megumin'); $res.ContentType = 'text/plain'; $res.OutputStream.Write($b, 0, $b.Length); continue
          }
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
          # the browser dropped the connection mid-file (a reload): nothing to do
        } finally {
          try { $res.OutputStream.Close() } catch { }
        }
      }
    }
    $worker = [PowerShell]::Create()
    [void]$worker.AddScript($serve).AddArgument($listener).AddArgument($root).AddArgument($types)
    $job = $worker.BeginInvoke()
  }
  $url = "http://localhost:$port/"

  if ($Server) {
    Write-Host ''
    Write-Host "  Мегумин запущена: $url  (открой этот адрес в Chrome, Edge или Firefox)"
    Write-Host '  Чтобы выключить, закрой это окно.'
    while ($true) { Start-Sleep -Seconds 1 }
  }

  # the game window: Edge (it is in every Windows 11) or Chrome in app mode, with a profile of its own
  $browser = $null
  foreach ($c in @(
      (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
      (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))) {
    if ($c -and [System.IO.File]::Exists($c)) { $browser = $c; break }
  }
  if (-not $browser) {
    Start-Process $url
    Say "Игра открыта в браузере: $url`n`nНажми ОК, когда закончишь играть (сервер выключится)."
  } else {
    $prof = Join-Path $data 'browser'
    $bArgs = @("--app=$url", "--user-data-dir=`"$prof`"", '--start-maximized', '--no-first-run', '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate')
    Start-Process -FilePath $browser -ArgumentList $bArgs
    if ($running) { exit 0 } # the first copy keeps serving
    # wait for the game window: a window of a browser process of our profile appears, then none is left (the browser may keep
    # background processes of the profile alive after the window is closed: they do not count)
    $exe = [System.IO.Path]::GetFileName($browser)
    $mark = 'Megumin\browser'
    $alive = {
      $ids = @(Get-CimInstance Win32_Process -Filter "Name='$exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($mark) } | ForEach-Object { $_.ProcessId })
      @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }).Count
    }
    $t = 0
    while ((& $alive) -eq 0 -and $t -lt 30) { Start-Sleep -Seconds 1; $t++ }
    while ((& $alive) -gt 0) { Start-Sleep -Seconds 2 }
  }
  if ($listener) { $listener.Stop(); $listener.Close() }
  exit 0
} catch {
  Say ('Не получилось запустить игру: ' + $_.Exception.Message)
  exit 1
}
