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

  The file is named by a SHA-256 digest of the creator id, which is why this script
  exists rather than a one-line delete.

.PARAMETER Creator
  One or more creator ids. Defaults to the two live demo workspaces.

.EXAMPLE
  .\scripts\reset-demo.ps1
  .\scripts\reset-demo.ps1 -Creator sidemen
#>
param(
    [string[]] $Creator = @("sidemen", "betasquad")
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$storeDir = Join-Path $repoRoot ".afterplay\experiments"

if (-not (Test-Path $storeDir)) {
    Write-Host "No experiment store at $storeDir - nothing to reset."
    exit 0
}

$sha = [System.Security.Cryptography.SHA256]::Create()
$removed = 0

foreach ($id in $Creator) {
    $digest = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($id)) |
        ForEach-Object { $_.ToString("x2") }) -join ""
    $key = $digest.Substring(0, 32)

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
    if (-not $found) {
        Write-Host "  $id already at its seeded state - nothing to remove"
    }
}

Write-Host ""
if ($removed -gt 0) {
    Write-Host "$removed store(s) cleared. Reload /studio: Approve is back, receipts are empty."
} else {
    Write-Host "Nothing changed."
}
