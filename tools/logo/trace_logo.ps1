# Trace the Collective's mark into vector paths: PNG alpha -> PBM (Blender) -> SVG (potrace).
# The site extrudes assets/brand/mark.svg into the 3D logo at runtime (src/scene/logo.js).
#   powershell -File tools/logo/trace_logo.ps1 -Blender <blender.exe> -Potrace <potrace.exe>
param(
  [Parameter(Mandatory)] [string]$Blender,
  [Parameter(Mandatory)] [string]$Potrace,
  [string]$Source = "assets/brand/mark-gold.png",
  [string]$Out = "assets/brand/mark.svg"
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$src = Join-Path $repo $Source
$dst = Join-Path $repo $Out
$pbm = Join-Path ([IO.Path]::GetTempPath()) "mark.pbm"
& $Blender -b --factory-startup -P (Join-Path $repo 'tools\logo\png_to_pbm.py') -- $src $pbm 2 | Select-String "wrote|Error"
if (-not (Test-Path $pbm)) { throw "PBM was not written" }
# --flat: one compound path; --turdsize drops specks; --alphamax / --opttolerance keep curves smooth
& $Potrace $pbm --svg --flat --turdsize 12 --alphamax 1.1 --opttolerance 0.3 --unit 1 --output $dst
Remove-Item $pbm
"traced $Out ($((Get-Item $dst).Length) bytes)"
