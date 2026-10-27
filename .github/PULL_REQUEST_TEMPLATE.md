## What this pull request does

<!-- One or two sentences. Link the issue it closes, for example: Closes #12 -->

### Type of change

- [ ] New Translation / i18n Fix
- [ ] Package (module or preset in `docs/hub/examples/`)
- [ ] New Security Threat Intelligence Rules
- [ ] Low-Level System / Kernel Optimization
- [ ] Bug Fix / Performance Improvement
- [ ] Tests
- [ ] Documentation

---

### Checklist

- [ ] `npx tsc --noEmit -p .` reports 0 errors
- [ ] `npx vitest run` passes
- [ ] New or changed text on screen has **both** pt-BR and en-US entries in `src/i18n/`
- [ ] UI change: screenshots before/after attached (`npm run shot -- <route>` with `npm run dev` running)
- [ ] Code change: ran `npm run map` to refresh `docs/map/` (if the tool is not available on your machine, tick this
      and say so; the maintainer will regenerate it)
- [ ] Package: `npm run hub:validate -- <file>` passes and its summary is pasted below
- [ ] Feature that changes the system: tested apply **and** revert, preferably in a VM or Windows Sandbox
      (say where: Windows version and build)

### Notes for the reviewer

<!-- Anything you are unsure about, trade-offs, follow-up work. -->
