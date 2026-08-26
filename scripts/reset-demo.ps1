<#
.SYNOPSIS
  Put a workspace's approval loop back to the start, so the Studio beat can be run again.

.DESCRIPTION
  Approving and distributing moves the experiment to "learned", after which Studio shows
  "Simulated distribution complete" and the Approve button is gone. That is correct once,
  and useless when rehearsing -- every run through the demo needs the loop back at
  "awaiting_approval".

  This deletes the creator's experiment store. The store re-seeds from the initial
  package on the next read, which is exactly the reset we want: approval state and
  receipts cleared, nothing else touched. Clips, manifests and channel memory are not
  involved and are left alone.

  With no -Creator argument it resets EVERY workspace it can find, discovered from the
  workspace registry and the memory directory. It used to default to a hardcoded pair,
  which silently skipped any workspace created later -- exactly the workspace most likely
  to be the one being rehearsed.

  Store files are named by a SHA-256 digest of the creator id, so they cannot be mapped
  back to a creator. The id list has to come from the registry, which is why this is a
  script rather than a one-line delete.

.PARAMETER Creator
  One or more creator ids. Defaults to every workspace found on disk.

.EXAMPLE
  .\scripts\reset-demo.ps1
  .\scripts\reset-demo.ps1 -Creator heyesoteric
  .\scripts\reset-demo.ps1 -List
#>
param(
    [string[]] $Creator,
    [switch] $List
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$storeDir = Join-Path $repoRoot ".afterplay\experiments"
$memoryDir = Join-Path $repoRoot "services\video-clipper\.memory"

function Get-KnownCreators {
    $ids = New-Object System.Collections.Generic.HashSet[string]

    # The registry is authoritative for workspaces created through the UI.
    $registry = Join-Path $memoryDir "workspaces.json"
    if (Test-Path $registry) {
        try {
            $doc = Get-Content $registry -Raw | ConvertFrom-Json
            foreach ($w in $doc.value.workspaces) { [void] $ids.Add($w.id) }
        } catch {
            Write-Warning "Could not read the workspace registry: $($_.Exception.Message)"
        }
    }

    # Directory scan catches anything the registry missed -- creators seeded by the CLI
    # or by tests never get a registry row.
    if (Test-Path $memoryDir) {
        Get-ChildItem $memoryDir -Directory | ForEach-Object { [void] $ids.Add($_.Name) }
    }

    return $ids
}

function Get-StoreKey([string] $id) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($id)) |
            ForEach-Object { $_.ToString("x2") }) -join ""
        return $digest.Substring(0, 32)
    } finally {
        $sha.Dispose()
    }
}

$targets = if ($Creator) { $Creator } else { Get-KnownCreators | Sort-Object }

if ($List) {
    Write-Host "Workspaces found:"
    foreach ($id in $targets) {
        $key = Get-StoreKey $id
        $has = @(".json", ".live.json") | Where-Object { Test-Path (Join-Path $storeDir "$key$_") }
        $state = if ($has) { "has an experiment store" } else { "already at its seeded state" }
        Write-Host ("  {0,-22} {1}" -f $id, $state)
    }
    exit 0
}

if (-not (Test-Path $storeDir)) {
    Write-Host "No experiment store at $storeDir - nothing to reset."
    exit 0
}

$removed = 0
foreach ($id in $targets) {
    $key = Get-StoreKey $id
    $found = $false
    foreach ($suffix in @(".json", ".live.json")) {
        $path = Join-Path $storeDir "$key$suffix"
        if (Test-Path $path) {
            Remove-Item $path -Force
            Write-Host "  reset $id  ($key$suffix)"
            $removed += 1
            $found = $true
        }
    }
    if (-not $found) { Write-Host "  $id already at its seeded state" }
}

Write-Host ""
if ($removed -gt 0) {
    Write-Host "$removed store(s) cleared. Reload /studio: Approve is back, receipts are empty."
} else {
    Write-Host "Nothing to clear - every workspace was already at its seeded state."
}
