$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $project
try {
    New-Item -ItemType Directory -Force -Path '.local/tmp' | Out-Null
    $env:TEMP = (Resolve-Path -LiteralPath '.local/tmp').Path
    $env:TMP = $env:TEMP
    if (!(Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
        & py -3.12 -m venv --without-pip .venv
        if ($LASTEXITCODE -ne 0) { throw '需要Python 3.12，请先核对已安装的Python环境。' }
    }
    & ./.venv/Scripts/python.exe -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) { throw '项目pip初始化失败。' }
    & ./.venv/Scripts/python.exe -m pip install --cache-dir .local/pip-cache -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python依赖安装失败，未关闭证书验证，请检查网络。' }
    & npm.cmd ci --cache .local/npm-cache
    if ($LASTEXITCODE -ne 0) { throw 'Node依赖安装失败。' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败。' }
    Write-Output '环境已准备好。运行 scripts/start.ps1 或根目录“启动知练.cmd”。'
} finally { Pop-Location }
