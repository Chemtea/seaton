$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked {
  param([string]$Program, [string[]]$Arguments)
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed ($LASTEXITCODE)." }
}
foreach ($command in @('git', 'gh', 'node', 'npm.cmd')) {
  if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "Install $command before publishing. See README.md." }
}
Invoke-Checked 'gh' @('auth', 'status')
$repo = Read-Host 'GitHub repository (press Enter for Chemtea/seaton)'
if ([string]::IsNullOrWhiteSpace($repo)) { $repo = 'Chemtea/seaton' }
if ($repo -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]+$') { throw 'Use OWNER/REPO format.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
Write-Host "Publish source code and Windows release $tag to https://github.com/$repo"
Write-Host 'Only project source is published. Student data is stored outside this folder.'
if ((Read-Host 'Type PUBLISH to continue') -cne 'PUBLISH') { Write-Host 'Cancelled.'; exit 0 }
Invoke-Checked 'npm.cmd' @('ci', '--no-audit', '--no-fund')
Invoke-Checked 'npm.cmd' @('test')
$root = (Get-Location).Path
if (!(Test-Path '.git')) { Invoke-Checked 'git' @('init', '-b', 'main') }
$userName = & git config user.name
if (!$userName) { $name = Read-Host 'Git commit display name'; Invoke-Checked 'git' @('config', 'user.name', $name) }
$userEmail = & git config user.email
if (!$userEmail) { $email = Read-Host 'Git commit email (GitHub noreply address is fine)'; Invoke-Checked 'git' @('config', 'user.email', $email) }
$existingRemote = & git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  $expectedHttps = "https://github.com/$repo.git"
  $expectedSsh = "git@github.com:$repo.git"
  if ($existingRemote -ne $expectedHttps -and $existingRemote -ne $expectedSsh -and $existingRemote -ne "https://github.com/$repo") { throw "Origin points to another repository: $existingRemote. Use a separate checkout." }
}
& gh repo view $repo --json nameWithOwner,visibility 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked 'gh' @('repo', 'create', $repo, '--public', '--description', 'Seaton classroom seating app')
} else {
  $visibility = & gh repo view $repo --json visibility --jq .visibility
  if ($visibility -ne 'PUBLIC') { throw 'The updater needs public Releases. Choose a public repository; no token is embedded in the app.' }
}
if (!$existingRemote) { Invoke-Checked 'git' @('remote', 'add', 'origin', "https://github.com/$repo.git") }
$source = @('package.json', 'package-lock.json', 'electron-builder.cjs', 'release-repository.json', '.gitignore', '.nvmrc', 'app', 'desktop', 'scripts', '.github', 'README.md', 'Build-Windows.cmd', 'Publish-GitHub.cmd', 'tests', 'test')
if (Test-Path 'build/icon.ico') { $source += 'build/icon.ico' }
if (Test-Path 'build/icon.svg') { $source += 'build/icon.svg' }
Invoke-Checked 'git' (@('add', '--') + $source)
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { Invoke-Checked 'git' @('commit', '-m', "Prepare Seaton $tag") }
$branch = (& git branch --show-current).Trim()
if (!$branch) { throw 'Check out a branch before publishing.' }
& git rev-parse --verify "refs/tags/$tag" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw "$tag already exists locally. Increase package version for a new release; README describes retrying an existing build." }
Invoke-Checked 'git' @('tag', '-a', $tag, '-m', "Seaton $tag")
Invoke-Checked 'git' @('push', '-u', 'origin', $branch)
Invoke-Checked 'git' @('push', 'origin', $tag)
Write-Host "Windows build started: https://github.com/$repo/actions"
Write-Host "After completion, download Seaton-Setup-$version-x64.exe from https://github.com/$repo/releases/latest"
