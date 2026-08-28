<#
  send-outlook-email.ps1
  Drives the local Outlook desktop client via COM automation to prepare
  a cover letter email: fills To/CC/BCC/Subject/Body, attaches the
  generated PDF, and opens it with .Display() for the agent to review
  and send themselves. Intentionally does NOT call .Send() — a human
  stays in the loop for every message that goes to a provider or
  customer. This is unconditional (see helper/emailHelper.js's header
  comment for why).

  Called from helper/emailHelper.js with each value passed as its own
  argument (never string-concatenated into a shell command), so nothing
  a customer's name/notes/etc. could contain is able to break out of its
  parameter.

  -OftPath (NEW, optional): when provided and valid, the email is
  created FROM the real company Outlook template
  (CreateItemFromTemplate) instead of a blank mail item — matching the
  original Excel macro's "Send it" behavior, which opened the same
  .oft file. All the same fields below are still filled in on top of
  whatever the template already contains. If $OftPath is blank or the
  file can't be found, this falls back to today's plain CreateItem(0)
  behavior automatically — no error, no crash.
#>

param(
    [Parameter(Mandatory = $true)][string]$To,
    [string]$Cc = "",
    [string]$Bcc = "",
    [string]$Subject = "",
    [string]$Body = "",
    [string]$Attachment = "",
    [string]$OftPath = ""
)

$ErrorActionPreference = "Stop"

try {
    $outlook = New-Object -ComObject Outlook.Application

    if ($OftPath -and (Test-Path -LiteralPath $OftPath)) {
        # Real company template (confirmed working path — see
        # backend/.env.example) — opens with its own existing
        # formatting/logo/signature, then the fields below are applied
        # on top of it.
        $mail = $outlook.CreateItemFromTemplate($OftPath)
    }
    else {
        # No template configured, or the path wasn't reachable from
        # this machine — fall back to a blank mail item, exactly the
        # original behavior.
        $mail = $outlook.CreateItem(0) # olMailItem
    }

    $mail.To = $To
    if ($Cc) { $mail.CC = $Cc }
    if ($Bcc) { $mail.BCC = $Bcc }
    $mail.Subject = $Subject

    # IMPORTANT: only overwrite the body when there's NO template.
    # $mail.Body is Outlook's PLAIN-TEXT property — setting it on a
    # mail item created FROM a template would silently strip out the
    # template's own rich formatting (logo, layout, signature), which
    # defeats the entire point of using the real .oft file. When a
    # template was used, its own body is left exactly as the template
    # author designed it; only To/CC/BCC/Subject/Attachment are applied
    # on top. If the template itself needs per-patient dynamic text
    # inserted into its body later, that requires a separate,
    # template-specific integration (matching placeholder bookmarks
    # inside the .oft's own HTML) — flag this if you need it and it can
    # be added once we see the template's actual internal structure.
    if (-not ($OftPath -and (Test-Path -LiteralPath $OftPath))) {
        $mail.Body = $Body
    }

    if ($Attachment -and (Test-Path -LiteralPath $Attachment)) {
        # The attachment's display name in Outlook comes from the file's
        # own name on disk (electron/pdfEngine.js already saves it as
        # e.g. "Cover Letter - Samy Ahmed Samy.pdf") — no override needed.
        $mail.Attachments.Add($Attachment) | Out-Null
    }
    elseif ($Attachment) {
        Write-Error "Attachment not found: $Attachment"
        exit 1
    }

    # Opens Outlook's own compose window. The agent reviews it and
    # clicks Send themselves — see header comment.
    $mail.Display()

    Write-Output "OUTLOOK_PREPARED"
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}

