#Requires -Version 5.1
<#
.SYNOPSIS
    Installs the IT Bridge upload agent as a Windows service. E14/S2.

.DESCRIPTION
    Clone the repo on the office computer, open PowerShell as administrator and run this. It builds
    the agent if it has to, copies it to `C:\itbridge-agent`, writes the configuration, registers a
    scheduled task that starts at boot and restarts itself on failure, and starts it.

    Once it is done, nobody has to think about the agent again. If it ever does stop, `/admin/proiecte`
    says so: after three hours without a heartbeat the screen states it outright, because otherwise
    "nothing was uploaded today" and "the computer is off" look identical.

    A **scheduled task**, not a service, and not NSSM. A Windows service has to speak the Service
    Control Manager's protocol, which `node.exe` does not — which is why wrappers like NSSM exist at
    all. A scheduled task with an at-startup trigger does the same job, is built into Windows, and
    needs nothing downloaded. "Clone and run" was the point.

.PARAMETER Root
    The projects folder, as this machine sees it. Normally a **local** path on this computer, because
    this is the machine that hosts the share — `D:\Proiecte`, not `P:\Proiecte`. See the check in
    `Assert-UsableRoot` for why that matters.

.EXAMPLE
    .\install.ps1 -ApiBase https://api.itbridgeschool.com -AgentUser agent-birou -Root D:\Proiecte

.EXAMPLE
    .\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [string]$ApiBase,
    # The account the agent signs in to the platform with. Dedicated, with the ADMIN role — no other
    # role exists yet, see the README.
    [string]$AgentUser,
    [string]$Root,
    # One row per name on the server, so two offices do not overwrite each other's heartbeat.
    [string]$AgentName = 'birou',
    [string]$InstallDir = 'C:\itbridge-agent',
    # The Windows account the task runs as. Left empty it runs as SYSTEM, which is right when the
    # folder is local to this machine and wrong the moment it is not.
    [string]$RunAsUser,
    [string]$TaskName = 'ITBridgeAgent',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Note($message) { Write-Host "    $message" -ForegroundColor DarkGray }

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this in a PowerShell opened as administrator: registering a task that starts at boot needs it.'
    }
}

function Get-NodePath {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw 'Node was not found. Install Node 22 or newer from https://nodejs.org and run this again.'
    }
    # The task runs without a user profile, so PATH is not the one you see here. The absolute path is
    # resolved now and written into the task, which is also what makes an upgrade of Node visible as
    # a failure rather than as an agent that quietly stopped starting.
    $major = [int](& node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
    if ($major -lt 22) {
        throw "Node $major is too old. The agent uses fetch, FormData and loadEnvFile, which need Node 22 or newer."
    }
    return $node.Source
}

<#
    Refuses a mapped drive, and explains why rather than just saying no.

    `P:\Proiecte` works perfectly when you type it, and not at all from a task: a mapped drive letter
    belongs to a logged-in user's session, and a task that starts at boot has none. The agent would
    come up, report a healthy heartbeat and upload nothing — which is exactly the ambiguous silence
    the heartbeat exists to remove.

    The intended arrangement has no mapped drive anyway: this computer *hosts* the share, so the path
    here is local (`D:\Proiecte`) and the lab machines are the ones with `P:` mapped to it.
#>
function Assert-UsableRoot([string]$path, [string]$runAs) {
    if ($path -match '^\\\\') {
        if (-not $runAs) {
            throw "A UNC path ($path) is not reachable by SYSTEM. Pass -RunAsUser with an account that can read that share, or point -Root at a local folder on this machine."
        }
        return
    }

    if ($path -match '^([A-Za-z]):') {
        $drive = "$($Matches[1]):"
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'" -ErrorAction SilentlyContinue
        if ($disk -and $disk.DriveType -eq 4) {
            throw "$drive is a mapped network drive, and a task started at boot cannot see one — it belongs to a logged-in session. Use the UNC path (\\server\share\...) with -RunAsUser, or run this on the computer that hosts the folder and point -Root at the local path."
        }
        if (-not $disk) {
            Write-Warning "$drive is not a drive on this computer. Check the path before you walk away from this machine."
        }
    }
}

function Remove-Installation {
    Write-Step "Removing the task '$TaskName'"
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Note 'Task removed.'
    } else {
        Write-Note 'There was no such task.'
    }
    # `$InstallDir` is left alone on purpose: it holds `state.json`, which carries the rotated refresh
    # token, and the logs. Deleting it would make a reinstall look like a first install, and would
    # throw away the only local record of what the agent did.
    Write-Note "Left $InstallDir in place — it holds the logs and the saved token. Delete it by hand if you mean to."
}

function Read-Required([string]$current, [string]$prompt) {
    if ($current) { return $current }
    $value = Read-Host $prompt
    if (-not $value) { throw "$prompt is required." }
    return $value
}

# --- Here we go ---------------------------------------------------------------------------------

Assert-Administrator

if ($Uninstall) {
    Remove-Installation
    return
}

$nodePath = Get-NodePath
$agentDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $agentDir '..\..')

$ApiBase = (Read-Required $ApiBase 'Adresa API (ex. https://api.itbridgeschool.com)').TrimEnd('/')
$AgentUser = Read-Required $AgentUser 'Utilizatorul agentului in platforma'
$Root = Read-Required $Root 'Folderul cu proiecte, pe acest calculator (ex. D:\Proiecte)'

Assert-UsableRoot $Root $RunAsUser

$securePassword = Read-Host 'Parola utilizatorului agentului' -AsSecureString
$agentPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword))
if (-not $agentPassword) { throw 'The agent password is required.' }

# --- Build, if there is nothing built yet -------------------------------------------------------

$distIndex = Join-Path $agentDir 'dist\index.js'
if (-not (Test-Path $distIndex)) {
    Write-Step 'Building the agent'
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw 'pnpm was not found, and there is nothing built to install. Run "npm install -g pnpm" and try again, or build on another machine and copy apps/agent/dist here.'
    }
    Push-Location $repoRoot
    try {
        # `--filter agent...` pulls in the shared contract package and nothing else — not Nuxt, not
        # Nest. On this machine that is the difference between a few seconds and several minutes.
        & pnpm install --frozen-lockfile --filter agent...
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
        & pnpm --filter agent build
        if ($LASTEXITCODE -ne 0) { throw 'The build failed.' }
    } finally {
        Pop-Location
    }
} else {
    Write-Note 'Using the build that is already in apps/agent/dist.'
}

# --- Copy ---------------------------------------------------------------------------------------

Write-Step "Copying to $InstallDir"
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'logs') | Out-Null

# The compiled tests live in `dist` too, because the agent runs them from there rather than carrying
# a second toolchain. They have no business on the office machine.
Get-ChildItem (Join-Path $agentDir 'dist') -File |
    Where-Object { $_.Name -notlike '*.test.js' } |
    Copy-Item -Destination (Join-Path $InstallDir 'dist') -Force

Write-Note "Copied. No node_modules: the agent compiles down to Node's own modules and nothing else."

# --- Configuration ------------------------------------------------------------------------------

Write-Step 'Writing .env'
$envPath = Join-Path $InstallDir '.env'
$lines = @(
    "ITBRIDGE_API_BASE=$ApiBase",
    "ITBRIDGE_AGENT_USERNAME=$AgentUser",
    "ITBRIDGE_AGENT_PASSWORD=$agentPassword",
    "ITBRIDGE_AGENT_ROOT=$Root",
    "ITBRIDGE_AGENT_NAME=$AgentName"
)
# UTF-8 without a BOM: `process.loadEnvFile` reads the BOM as part of the first key name, so the very
# first variable would silently go missing — and the first one here is the API address.
[System.IO.File]::WriteAllLines($envPath, $lines, (New-Object System.Text.UTF8Encoding $false))

# The file holds a password that can do everything an admin can. Inheritance off, and only the two
# accounts that need it — by SID, because on a Romanian Windows the group is called "Administratori"
# and a name-based grant would fail.
& icacls $envPath /inheritance:r /grant '*S-1-5-32-544:(F)' /grant '*S-1-5-18:(F)' | Out-Null
if ($RunAsUser) { & icacls $envPath /grant "${RunAsUser}:(R)" | Out-Null }
Write-Note 'Written, and readable only by administrators and the account the agent runs as.'

# --- The task -----------------------------------------------------------------------------------

Write-Step "Registering the task '$TaskName'"

$logPath = Join-Path $InstallDir 'logs\agent.log'
# Through `cmd` so that stdout and stderr land in a file: a scheduled task has nowhere to put them
# otherwise. The agent logs a line per pass only when something happened, so this grows by a few
# kilobytes a day and needs no rotation.
$arguments = '/c ""{0}" "{1}" >> "{2}" 2>&1"' -f $nodePath, (Join-Path $InstallDir 'dist\index.js'), $logPath

$action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument $arguments -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 9999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$description = 'IT Bridge School: urca proiectele salvate de profesori in folderul fiecarui copil.'

if ($RunAsUser) {
    # An account with a stored password, not `-LogonType S4U`: S4U tasks cannot reach network
    # resources, which is the entire reason a run-as account was needed in the first place.
    $windowsPassword = Read-Host "Parola Windows pentru $RunAsUser" -AsSecureString
    $plainWindows = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($windowsPassword))
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -User $RunAsUser -Password $plainWindows -RunLevel Highest -Description $description | Out-Null
} else {
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Principal $principal -Description $description | Out-Null
}

Start-ScheduledTask -TaskName $TaskName
Write-Note 'Registered and started. It will come up on its own after a reboot.'

# --- Did it actually work? ----------------------------------------------------------------------

Write-Step 'Checking'
Start-Sleep -Seconds 6

if (Test-Path $logPath) {
    Get-Content $logPath -Tail 15 | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Warning "Nothing has been written to $logPath yet. Give it a few seconds and look again."
}

Write-Host ''
Write-Host 'Gata.' -ForegroundColor Green
Write-Host "  Log:        $logPath"
Write-Host "  Configurare: $envPath"
Write-Host "  Oprire:     Stop-ScheduledTask -TaskName $TaskName"
Write-Host "  Dezinstalare: .\install.ps1 -Uninstall"
Write-Host ''
Write-Host 'Deschide /admin/proiecte: acolo scrie cand a raportat agentul ultima oara.'
