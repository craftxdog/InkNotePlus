param(
  [Parameter(Mandatory = $true)][string]$InstalledExe,
  [Parameter(Mandatory = $true)][string]$SetupExe
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$metadata = Get-Content package.json | ConvertFrom-Json
$sourceIcon = (Resolve-Path assets/icon.ico).Path

function Assert-AppIcon([string]$Executable) {
  $actual = [System.Drawing.Icon]::ExtractAssociatedIcon($Executable)
  if ($null -eq $actual) { throw "No application icon in $Executable" }
  $expected = [System.Drawing.Icon]::new($sourceIcon, $actual.Size)
  $actualBitmap = $actual.ToBitmap()
  $expectedBitmap = $expected.ToBitmap()
  try {
    for ($x = 0; $x -lt $actualBitmap.Width; $x++) {
      for ($y = 0; $y -lt $actualBitmap.Height; $y++) {
        if ($actualBitmap.GetPixel($x, $y).ToArgb() -ne $expectedBitmap.GetPixel($x, $y).ToArgb()) {
          throw "Application icon does not match assets/icon.ico: $Executable"
        }
      }
    }
  } finally {
    $actualBitmap.Dispose()
    $expectedBitmap.Dispose()
    $actual.Dispose()
    $expected.Dispose()
  }
}

$updater = [System.IO.Path]::GetFullPath((Join-Path (Split-Path $InstalledExe) '../Update.exe'))
Assert-AppIcon $SetupExe
Assert-AppIcon $InstalledExe
Assert-AppIcon $updater
$installedPng = Join-Path (Split-Path $InstalledExe) 'resources/icon.png'
if ((Get-FileHash $installedPng).Hash -ne (Get-FileHash assets/icon.png).Hash) {
  throw 'The installed runtime icon does not match assets/icon.png'
}
$registration = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($metadata.name)"
if ($registration.DisplayIcon -ne "`"$updater`",0") {
  throw 'Windows Apps & Features must use the locally installed InkNote icon'
}
Write-Host 'Setup, installed executable, updater and Apps & Features icons verified.'
