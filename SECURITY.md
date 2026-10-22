# Security policy

## Supported versions

Only the [latest release](https://github.com/Pokeralho/darkhub-suite/releases/latest) receives fixes. The app updates
itself, so please reproduce on the latest version before reporting.

## Reporting a vulnerability

Please do **not** open a public issue for a vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/Pokeralho/darkhub-suite/security/advisories/new)
and include:

- DarkHub version and Windows build;
- what an attacker can do and under which conditions (local user, remote site, malicious file...);
- steps or a proof of concept.

You will get an answer within 7 days. Fixes ship in a new release, credited to you unless you prefer otherwise.

## Scope

In scope: the DarkHub app, its native helpers (`electron/services/*.exe`), the installer and `install.ps1`.
Out of scope: third-party tools DarkHub downloads (report those upstream), and settings the user applies on purpose
(for example turning off Windows Defender from the Security screen).

Phishing-domain and heuristic rule submissions are not vulnerabilities: see [SECURITY_RULES.md](./SECURITY_RULES.md).
