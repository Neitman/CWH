# start-tunnels.ps1
# Automates finding the WSL gateway IP and launching docker-compose.

# 1. Get the WSL gateway IP
Write-Host "Checking WSL route gateway..." -ForegroundColor Cyan
$wslIp = (wsl sh -c "ip route show | grep default | awk '{print `$3}'")
if ($wslIp -match 'via\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
    $ip = $Matches[1]
    Write-Host "Detected Windows Host IP from WSL: $ip" -ForegroundColor Green
    
    # 2. Read .env file and update WINDOWS_HOST_IP
    $envPath = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envPath) {
        $lines = Get-Content $envPath
        $newLines = @()
        $found = $false
        foreach ($line in $lines) {
            if ($line -like "WINDOWS_HOST_IP=*") {
                $newLines += "WINDOWS_HOST_IP=$ip"
                $found = $true
            } else {
                $newLines += $line
            }
        }
        if (-not $found) {
            $newLines += "WINDOWS_HOST_IP=$ip"
        }
        $newLines | Set-Content $envPath
        Write-Host "Updated WINDOWS_HOST_IP in .env to $ip" -ForegroundColor Green
    } else {
        # Create .env with the IP
        "WINDOWS_HOST_IP=$ip" | Set-Content $envPath
        Write-Host "Created .env with WINDOWS_HOST_IP=$ip" -ForegroundColor Green
    }
} else {
    Write-Warning "Could not detect Windows Host IP from WSL. Falling back to host.docker.internal."
}

# 3. Start docker-compose inside WSL
Write-Host "Starting Docker Compose services..." -ForegroundColor Cyan
wsl docker compose up
