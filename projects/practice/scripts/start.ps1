param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$python = Join-Path $project '.venv/Scripts/python.exe'
$state = Join-Path $project '.local'
if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath (Join-Path $project 'dist/index.html'))) {
    throw '缺少项目环境或构建文件，请先运行 projects/practice/scripts/setup.ps1。'
}
function Get-Health {
    try { return Invoke-RestMethod -Uri 'http://127.0.0.1:4250/api/health' -TimeoutSec 2 } catch { return $null }
}
$health = Get-Health
if ($health.product -ne 'zhilian') {
    if (Get-NetTCPConnection -LocalPort 4250 -State Listen -ErrorAction SilentlyContinue) {
        throw '4250端口被其他服务占用，未停止或替换该服务。'
    }
    Write-Output '正在启动知练。请保留此窗口；按Ctrl+C停止服务。'
    Push-Location -LiteralPath $project
    try {
        if ($NoBrowser) { & $python -X utf8 run.py }
        else { & $python -X utf8 run.py --open-browser }
        if ($LASTEXITCODE -ne 0) { throw '服务已停止；如有错误，请查看本窗口的错误文字。' }
    } finally { Pop-Location }
    exit
}
Write-Output '知练已就绪：http://127.0.0.1:4250/'
if (!$NoBrowser) { Start-Process 'http://127.0.0.1:4250/' }
