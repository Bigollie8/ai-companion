$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'AI Companion.lnk'
$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSScriptRoot 'start-dashboard.bat'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'AI Companion for Codex and Claude'
$shortcut.IconLocation = Join-Path $PSScriptRoot 'build\icon.ico'
$shortcut.Save()
Write-Host "Created $shortcutPath"
