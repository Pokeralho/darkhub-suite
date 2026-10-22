# DarkHub "Frost" design system

DarkHub is a Windows power tool (Operate mode): people come to finish a task fast. Beauty lives in precision, not decoration. The identity comes from the brand mark, a white snow crystal on ink-black: **cold ink neutrals, one glacial accent, crystalline geometry, mono numerals.**

## Foundations (already global, do not re-declare)

- **Palette** (`src/style.css`): Tailwind palettes are remapped.
  - `zinc-*` = Ink neutrals: `950` page, `900` raised, `800` borders.
  - `blue-*` = Glacier, the only accent. `indigo`, `violet`, `purple`, `sky` and `cyan` alias to it, but **write `blue-*` in new code**.
  - Semantic colours stay meaningful: `emerald` = ok/success, `amber` = warning, `red`/`rose` = error/destructive. Never use them as decoration or for a neutral primary action.
- **Type:** Geist (sans) and Geist Mono (`font-mono`, tabular figures) for every number, path, ID, version or technical tag.
- **Radius:** one tight scale: `rounded-md` (6) for controls, `rounded-lg` (8) for small blocks, `rounded-xl` (10) for cards/panels. No `rounded-2xl`/`3xl` and no pills except true status dots.
- **Motion:** 150 to 220 ms, `ease-out` curve (`--ease-out`). Buttons already press to `scale(.97)` globally. Pages fade-slide in once (`.dh-page`). Nothing loops except real progress/loading indicators. Respect `prefers-reduced-motion`.
- **Icons:** only `src/components/icons` (custom Frost set). Never import an icon library. `size={16}` in UI, `14` inline with text, `18`-`20` for a page-level glyph. Colour `text-zinc-400/500`, `text-blue-300` when active/selected.
- **Native controls** (checkbox, radio, select, range) are styled globally: do not add `accent-*` or custom checkbox CSS.

## Component vocabulary (CSS classes in `src/style.css`, React in `src/components/ui`)

| Need | Use |
|---|---|
| Page title + context + actions | `<PageHeader title subtitle actions>` from `src/components/ui/PageHeader` |
| Card / panel | `dh-card p-4` (or `p-5`) |
| Section heading inside a page | `<h2 className="dh-section-title">` sentence case + optional `<p className="dh-help">` under it |
| Field label / helper | `dh-label` / `dh-help` |
| Buttons | `dh-btn` (secondary, outlined) · `dh-btn dh-btn-primary` (snow-white, the ONE main action of a view) · `dh-btn dh-btn-accent` (glacier, for "apply/run" when white would compete) · `dh-btn dh-btn-danger` (destructive) · `dh-btn dh-btn-ghost` · add `dh-btn-sm` for compact |
| Text input / select | `dh-input` (+ `w-full`) |
| Technical tag | `<span className="dh-tag">DXGI</span>`, mono, no box, lowercase or the real casing |
| Status | small coloured text, or a 6px dot **only for a real live state** |

## Rules (what makes it look designed, not generated)

1. **No icon chips.** Remove `p-1.5 bg-X-500/10 border border-X-500/20 rounded` boxes around icons; render the icon bare in `text-zinc-400` (or the semantic colour when it encodes state).
2. **No uppercase headings or eyebrows.** Replace `uppercase tracking-wider` section titles with `dh-section-title` in sentence case. Small tables and column headers may use `text-[11px] text-zinc-500`, still not uppercase.
3. **No hype pills.** Badges like `AI FRAME GEN`, `CHART`, `FREE UP`, `AUDIT`, `NEW`, `PRO` go away or become a quiet `dh-tag` when they carry real technical info.
4. **One primary action per view.** Use `dh-btn-primary` for that one; everything else is `dh-btn`/ghost. Red is only for destructive actions.
5. **No rainbow.** One accent. Per-card colours (green card, amber card, purple card) are banned; differences come from layout and copy.
6. **Hierarchy by weight and space, not size.** Page title 22px semibold; section 13.5px semibold; body 12.5-13px; meta 11-12px. Line length for prose ≤ 75ch.
7. **Group with space and hairlines** (`divide-y divide-zinc-800/80`, `border-zinc-800/80`). A card only when it groups a real unit. Do not nest cards inside cards more than once.
8. **Every async view has loading, empty and error states.** Loading = skeleton blocks (`bg-zinc-900 animate-pulse`) shaped like the content, not a lone spinner. Empty = one sentence + the action that fills it. Error = inline, red text, with retry.
9. **Numbers in `font-mono`**, units dimmer (`text-zinc-500`).
10. **No em dash (—) in UI copy.** No emoji. No fake data or always-green status indicators.
11. **Density:** controls 32px tall (28 compact), 12-16px gaps, page padding from the shell. Do not add page-level `p-*`/`max-w` wrappers that fight the shell; use `max-w-6xl` only for reading-heavy pages.

## Do not change

Behaviour, IPC calls, state logic, i18n keys or copy meaning. Visual layer only, unless a state (loading/empty/error) is missing.
