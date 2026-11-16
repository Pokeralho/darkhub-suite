# Contributing to DarkHub Suite

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for the full contribution guide.

Quick commands (from repo root):

```bash
npm install
npm run dev              # Vite + Electron (Windows full; Linux/Ubuntu incremental/dev with capability gates)
npx tsc --noEmit -p .
npx vitest run           # or: npx vitest run --pool=forks --maxWorkers=2 on constrained Linux
npx vite build

# Linux (incremental): native_cleaner runtime/build + package smoke
npm run build:cleaner
cargo check --manifest-path native_cleaner/Cargo.toml && cargo test --manifest-path native_cleaner/Cargo.toml
cargo check --manifest-path native_disk/Cargo.toml
cargo check --manifest-path native_pacer/Cargo.toml
cargo check --manifest-path native_gpubench/Cargo.toml
npm run build:linux      # native_cleaner + renderer + integrity + electron-builder --linux dir
```

Platform notes:
- Windows 10/11 x64 is the primary supported runtime. Features that change Windows (optimizer tweaks, services,
  Defender, drivers, sensors, etc.) should be tested in a VM/sandbox and must preserve reversibility/snapshots.
- Linux/Ubuntu support is incremental (Option A): keep stable IPC/preload `{ ok, ... }` contracts and gate
  Windows-only capabilities with structured `unsupported/platform/reason` (`partial` where applicable). Only
  `native_cleaner` is the native runtime/build target packaged for Linux; `native_disk`, `native_pacer`, and
  `native_gpubench` are CI compile-checked on Linux and remain runtime unsupported/not packaged on Linux.
- Do not mask real Windows behavior. Before opening a PR, follow `.github/PULL_REQUEST_TEMPLATE.md` and run the
  relevant validation commands for your changes.
