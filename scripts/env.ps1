# Põe Node e Git portáteis no PATH desta sessão do PowerShell.
# Uso:  . .\scripts\env.ps1
$nodeDir = "C:\Users\gnmar\tools\node"
$gitDir = "C:\Users\gnmar\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd"
foreach ($d in @($nodeDir, $gitDir)) {
  if ((Test-Path $d) -and ($env:Path -notlike "*$d*")) { $env:Path = "$d;$env:Path" }
}
