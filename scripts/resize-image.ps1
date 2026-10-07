#!/usr/bin/env pwsh
# Resize and re-compress a JPEG using the System.Drawing codecs that ship with
# Windows, so optimising a marketing asset does not mean adding a dependency.
#
# Usage: node scripts/resize-image.cjs is not possible (no native canvas), so this
# runs through PowerShell instead:
#   powershell -File scripts/resize-image.ps1 -In <src> -Out <dst> -Width 1600 -Quality 82

param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 1600,
  [int]$Quality = 82
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $In).Path)
try {
  # Preserve the exact aspect ratio: target height = width * (srcH / srcW).
  $height = [int][Math]::Round($Width * ($src.Height / $src.Width))

  $bmp = New-Object System.Drawing.Bitmap($Width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      # Flatten onto white so any alpha does not composite against black.
      $g.Clear([System.Drawing.Color]::White)
      $g.DrawImage($src, 0, 0, $Width, $height)
    }
    finally { $g.Dispose() }

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
      [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

    $dir = Split-Path -Parent $Out
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $bmp.Save($Out, $codec, $params)
    $params.Dispose()
  }
  finally { $bmp.Dispose() }
}
finally { $src.Dispose() }

$before = (Get-Item $In).Length
$after = (Get-Item $Out).Length
Write-Output ("{0} -> {1}  {2} bytes -> {3} bytes  ({4:P0} smaller)" -f `
  (Split-Path -Leaf $In), (Split-Path -Leaf $Out), $before, $after,
  (1 - ($after / $before)))