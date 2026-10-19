# Tiny static file server for local development (no Node/Python needed).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
param([int]$Port = 8080, [string]$Root = $PSScriptRoot)

$rootFull = [IO.Path]::GetFullPath($Root)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Kinstead is running at http://localhost:$Port/  (Ctrl+C to stop)"

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'; '.md' = 'text/markdown; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    # a folder without its slash (/play, /wiki): on to the slash, as GitHub Pages does,
    # so the page's relative links resolve
    if (-not $path.EndsWith('/') -and (Test-Path -LiteralPath (Join-Path $rootFull $path.TrimStart('/')) -PathType Container)) {
      $ctx.Response.StatusCode = 301
      $ctx.Response.Headers.Add('Location', $ctx.Request.Url.AbsolutePath + '/' + $ctx.Request.Url.Query)
      $ctx.Response.Close()
      continue
    }
    if ($path.EndsWith('/')) { $path = $path + 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull $path.TrimStart('/')))
    if ($full.StartsWith($rootFull) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {
    # Client hung up mid-response or similar; keep serving.
  }
}
