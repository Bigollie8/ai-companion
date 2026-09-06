$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'build'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$fill = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#172b29'))
$mint = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#a5e8cc'), 12)
$blue = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#8cc6ed'), 12)
$ring = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#598879'), 5)
$graphics.FillEllipse($fill, 6, 6, 244, 244)
$graphics.DrawEllipse($ring, 12, 12, 232, 232)
$graphics.DrawArc($mint, 47, 80, 94, 94, 40, 280)
$graphics.DrawArc($blue, 115, 80, 94, 94, 220, 280)
$bitmap.Save((Join-Path $assetDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
# PNG-backed 256px ICO keeps a clean alpha channel for Windows shortcuts.
$pngStream = [System.IO.MemoryStream]::new()
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$fileStream = [System.IO.File]::Create((Join-Path $assetDir 'icon.ico'))
$writer = [System.IO.BinaryWriter]::new($fileStream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length); $writer.Write([uint32]22); $writer.Write($pngBytes)
$writer.Dispose(); $pngStream.Dispose()
$mint.Dispose(); $blue.Dispose(); $ring.Dispose(); $fill.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
