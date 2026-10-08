Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$inputStr = [Console]::In.ReadToEnd()
if ([string]::IsNullOrEmpty($inputStr)) {
    exit 0
}

# If setting an image into Windows clipboard
if ($inputStr.StartsWith("IMG:")) {
    $b64 = $inputStr.Substring(4)
    try {
        $bytes = [Convert]::FromBase64String($b64)
        $ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
        $img = [System.Drawing.Image]::FromStream($ms, $true)
        for ($i = 0; $i -lt 6; $i++) {
            try {
                [System.Windows.Forms.Clipboard]::SetImage($img)
                Write-Output "OK"
                exit 0
            } catch {
                Start-Sleep -Milliseconds 60
            }
        }
    } catch {
        Write-Output "IMG_ERR"
        exit 1
    }
}

# Setting text into Windows clipboard
$text = $inputStr
if ($text.StartsWith("TXT:")) {
    $text = $text.Substring(4)
}

for ($i = 0; $i -lt 6; $i++) {
    try {
        Set-Clipboard -Value $text -ErrorAction Stop
        Write-Output "OK"
        exit 0
    } catch {
        try {
            [System.Windows.Forms.Clipboard]::SetText($text)
            Write-Output "OK"
            exit 0
        } catch {
            Start-Sleep -Milliseconds 60
        }
    }
}
Write-Output "FAIL"
