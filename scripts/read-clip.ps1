Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 1. Check native Image bitmap
try {
    if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $img = [System.Windows.Forms.Clipboard]::GetImage()
        if ($img -ne $null) {
            $ms = New-Object System.IO.MemoryStream
            $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $b64 = [Convert]::ToBase64String($ms.ToArray())
            Write-Output "IMG:$b64"
            exit 0
        }
    }
} catch {}

# 2. Check FileDropList (WhatsApp Desktop often copies images as file references)
try {
    if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
        $files = [System.Windows.Forms.Clipboard]::GetFileDropList()
        foreach ($filePath in $files) {
            if ($filePath -match '\.(png|jpg|jpeg|gif|webp|bmp|tiff)$') {
                if ([System.IO.File]::Exists($filePath)) {
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $b64 = [Convert]::ToBase64String($bytes)
                    Write-Output "IMG:$b64"
                    exit 0
                }
            }
        }
    }
} catch {}

# 3. Check DataObject custom formats (PNG stream / DeviceIndependentBitmap)
try {
    $data = [System.Windows.Forms.Clipboard]::GetDataObject()
    if ($data -ne $null) {
        if ($data.GetDataPresent("PNG")) {
            $stream = $data.GetData("PNG")
            if ($stream -is [System.IO.Stream]) {
                $ms = New-Object System.IO.MemoryStream
                $stream.CopyTo($ms)
                $b64 = [Convert]::ToBase64String($ms.ToArray())
                Write-Output "IMG:$b64"
                exit 0
            }
        }
        if ($data.GetDataPresent([System.Windows.Forms.DataFormats]::Bitmap)) {
            $bmp = $data.GetData([System.Windows.Forms.DataFormats]::Bitmap)
            if ($bmp -is [System.Drawing.Image]) {
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $b64 = [Convert]::ToBase64String($ms.ToArray())
                Write-Output "IMG:$b64"
                exit 0
            }
        }
    }
} catch {}

# 4. Check Text
try {
    if ([System.Windows.Forms.Clipboard]::ContainsText()) {
        $txt = [System.Windows.Forms.Clipboard]::GetText()
        if (-not [string]::IsNullOrEmpty($txt)) {
            Write-Output "TXT:$txt"
            exit 0
        }
    }
} catch {}

Write-Output "EMPTY"
exit 0
