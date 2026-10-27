# DarkHub Suite v0.7.3: packages, the Hub, extensions and Claude inside DarkHub

DarkHub is now modular:
- **Packages**: modules and presets you can preview, install and remove exactly;
- **Hub**: a catalog with signed downloads;
- **Extensions**: new screens and Dashboard cards;
- **MCP server**: lets Claude build and install packages with your approval.

This release also brings a full overlay editor and a new look for the password vault browser extension.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.7.3.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.7.3.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.7.3-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
a07037c95b204e8042c04a161101c32b0fb847e93e7367aeb49017c066f7241b  DarkHub-Setup-0.7.3.exe / DarkHub.Setup.0.7.3.exe
dd9ae90bc5732c3f9da96300d7fd682bf1f10d42c26cdfeb784ac0d59a2bdde9  DarkHub.0.7.3-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### 1. Presets and modules (new screen "Presets e módulos")

A package is a JSON file that describes changes to Windows as data. It can contain:
- built-in tweaks;
- registry values;
- service start types;
- scheduled tasks;
- Optimizer operations.

Packages can also list hardware conditions: Windows build, CPU/GPU vendor, laptop or desktop, RAM, Ethernet, DarkOS.

- **Preview first**: every change is shown with this PC's current value next to the new one.
- **Install safely**: DarkHub saves every original value, reads each change back to check it, and undoes everything if
  a step fails.
- **Exact removal**: removing a package restores every value. Values that did not exist before are deleted again.
- **Create a preset from my PC**: turns the tweaks and operations active on this PC into a package.
- **Not allowed in packages**: Defender, UAC, firewall, Windows Update, startup persistence, code loading or scripts.
  The risk level is computed by DarkHub, not declared by the author.

### 2. The Hub (hub.darkhub.ink)

The **Catalog** tab searches the Hub and can show only the packages that fit this PC.

- **Checked downloads**: every download is checked against its SHA-256 and the Hub's Ed25519 signature before it is
  shown or installed.
- **Manual review**: every submission is reviewed by a person before it is signed.
- **Updates**: installed packages show when a new version exists and update in one click. The old version comes back
  if the new one fails.
- **Links from the site**: `darkhub://` links open the preview in DarkHub. They never install anything by themselves.

### 3. Extensions

Extensions add new screens (sidebar section **Extensões**) and Dashboard cards. They are written in plain HTML, CSS
and JavaScript, with no build step.

- **Isolated**: they run in a sandboxed frame with a strict security policy, with no Node, no files, no direct network
  and no navigation.
- **Permissions**: they reach DarkHub only through the `darkhub` API, one permission at a time (storage, hardware,
  sensors, network for declared sites, notifications, clipboard, packages).
- **Your approval**: installing packages from an extension always asks you first.
- **For developers**: `npm run ext:new` and `npm run ext:pack`, a folder mode that reloads on save, and a console per
  extension. Guide: [docs/hub/EXTENSIONS.md](./hub/EXTENSIONS.md).

### 4. Claude inside DarkHub (MCP)

**Presets e módulos → IA (MCP)**. It is off by default.

- **What Claude can do**: Claude Code or Claude Desktop can read the PC's hardware, validate and preview packages,
  search the Hub, and install, update or remove packages.
- **Safety**: the server listens only on this PC and needs a token. Every change opens a DarkHub window and waits for
  you to approve it.
- Guide: [docs/hub/MCP.md](./hub/MCP.md).

### 5. Overlay editor

**In-game overlay → Open the overlay editor**.

- **Blocks**: build your own overlay from metrics lines, big values, graphs with up to 4 lines, per-thread bars,
  statistics tables, text, separators and spacers.
- **Metrics**: about 45 are available, with thresholds and colors for warning and critical values.
- **Style**: colors, fonts and borders per block and for the whole overlay, plus custom CSS.
- **Live preview**: shows real numbers while the overlay is on.
- **Templates**: six, including RivaTuner classic, Overclocker and Top bar. You can also save named layouts and share
  them as a code.
- **Smoother graphs**: they now redraw at the display's refresh rate and stay sharp under Windows scaling.

### 6. Password vault browser extension

- **New look**: matches the app.
- **Clearer messages**: each state has a title and one line of help (DarkHub not running, pairing, locked, no logins).
- **Pairing code**: shown one digit per box.
- **Inline picker**: same style, in the browser's language.
- **Icons**: the extension now has its own icons.
- **Unchanged**: same permissions and security checks.

### 7. Fixes

- **Optimizer**: change sets that delete a registry value are now applied and verified correctly.
- **Overlay CPU bars**: CPU load and per-thread bars no longer show a false 100% on recent Windows 11 builds.

### For contributors

- **Contributor docs**: moved to `.github/` and `docs/`.
- **Portuguese README**: added.
- **Issue forms**: added.
- **Admin rights explained**: a README section says why DarkHub needs administrator rights and what its sensitive
  features do.
- **Contributing without native tools**: a guide for working without the .NET or Rust toolchain.
