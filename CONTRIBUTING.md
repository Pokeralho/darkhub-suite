# Contributing to DarkHub Suite

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for the full contribution guide.

Quick commands (from repo root):

```bash
npm install
npm run dev              # Vite + Electron (Windows full; Linux/Ubuntu incremental/dev with capability gates)
npx tsc --noEmit -p .
npx vitest run           # or: npx vitest run --pool=forks --maxWorkers=2 on constrained Linux
npx vite build
```

Platform notes:
- Windows 10/11 x64 is the primary supported runtime. Features that change Windows (optimizer tweaks, services,
  Defender, drivers, sensors, etc.) should be tested in a VM/sandbox and must preserve reversibility/snapshots.
- Linux/Ubuntu support is incremental (Option A): keep stable IPC/preload `{ ok, ... }` contracts and gate
  Windows-only capabilities with structured `unsupported/platform/reason` responses. Do not mask real Windows behavior.
- Before opening a PR, follow the checklist in `.github/PULL_REQUEST_TEMPLATE.md` and run the relevant validation
  commands for your changes.
