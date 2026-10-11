function Read-CyberOrbitEnrollmentToken {
  param([switch]$FromClipboard)
  if ($FromClipboard) {
    try { $clipboardText = Get-Clipboard -Raw -ErrorAction Stop }
    catch { throw 'Cannot read the clipboard. Use the hidden enrollment prompt instead.' }
    if ($clipboardText -isnot [string] -or [string]::IsNullOrWhiteSpace($clipboardText)) { throw 'Clipboard has no enrollment token. Click Copy token in Devices first.' }
    try { $secureToken = ConvertTo-SecureString $clipboardText -AsPlainText -Force }
    finally { $clipboardText = $null }
  } else {
    $secureToken = Read-Host '15-minute enrollment token (hidden)' -AsSecureString
  }
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if ($plainToken -cnotmatch '^[A-Za-z0-9_-]{43}$') {
      # The character count diagnoses failed paste without exposing the value.
      throw "Invalid enrollment token: received $($plainToken.Length) characters; expected 43 letters, digits, hyphens or underscores. Click Copy token in Devices. Do not enter asterisks, labels, quotes or JSON. No installation files were created."
    }
    return $secureToken
  } catch {
    $secureToken.Dispose()
    throw
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainToken = $null
  }
}
