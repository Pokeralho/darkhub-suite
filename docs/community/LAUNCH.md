# Launch drafts

Ready-to-post texts. **Nothing here has been posted.** Read each one, adjust the numbers and links to the current
release, and post it yourself. Each community has its own rules on self-promotion: read them on the day you post, and
always say that you are the author.

Before posting anywhere, make sure that:

- the latest release is published, with `latest.yml` and the setup's SHA-256 digest visible on the release page;
- the README "Why DarkHub needs administrator rights" section is on `main` (people will ask);
- the 18 issues from `docs/community/issues/` exist (run `create-issues.ps1`), so newcomers have something to pick;
- Discussions is enabled (see the checklist at the end).

---

## 1. Show HN

Post on a weekday morning US time. Stay in the thread for the first two hours and answer every question, especially the
critical ones. Do not ask anyone to upvote.

**Title** (max 80 characters):

> Show HN: DarkHub – a Windows optimizer where every change is shown first and reversible

**URL:** `https://github.com/Pokeralho/darkhub-suite`

**Text:**

> Hi HN, I'm the author of DarkHub Suite, an MIT-licensed Windows utility (Electron + React + TypeScript, with small C#
> and Rust helpers) for gaming performance, latency and system maintenance.
>
> Most "Windows optimizers" are a list of registry edits you cannot see and cannot undo. I wanted the opposite:
>
> - Before anything is applied, DarkHub reads the current value of every registry value, service and scheduled task it
>   will touch and shows "now" next to "after".
> - It saves those values, writes the new ones and reads them back. If Windows does not keep a value (policy, Tamper
>   Protection), the change fails as a whole instead of leaving the system half-done.
> - Every change can be reverted one by one, and the revert restores what you had, not "the Windows default".
>
> The part I'd most like feedback on is the package format. A package is a JSON file that describes changes as data:
> registry values, service start types, scheduled tasks and references to built-in tweaks, with hardware conditions
> (laptop/desktop, GPU vendor, Windows build...). There is deliberately no item type for scripts. Packages cannot touch
> Defender, UAC, the firewall, Windows Update, VBS or anything that runs at startup; the app and a CLI validator refuse
> them. Because the format is plain data with a JSON Schema, it is easy to write by hand or with an LLM, and easy to
> review.
>
> Things people usually ask about, answered in the README: why it needs admin, what the DLL injector and the Defender
> toggle do, the PawnIO driver used for sensors, and the one-line installer (it checks the installer's SHA-512 against
> the release; the installer is not code-signed yet).
>
> Spec of the package format: https://github.com/Pokeralho/darkhub-suite/blob/main/docs/hub/README.md
>
> I'd love feedback on the format and on the safety rules, and contributions are welcome: there are good first issues
> for translations, tests and packages.

---

## 2. Reddit

General rules for all three: post from your own account, write "I made this" in the first line, link GitHub (not a
download mirror), answer in the comments, do not cross-post the same day to all three. Check each subreddit's
self-promotion rule (some ask for a 9:1 ratio of normal participation to own content) and flair.

### r/pcmasterrace

Tone: casual, visual. A screenshot or short clip works better than a wall of text. Post on a weekend.

**Title:**

> I made a free, open-source Windows optimizer that shows every change before applying it and can undo all of it

**Body:**

> Disclosure: I'm the developer. It's free and MIT licensed, no ads, no account, no telemetry.
>
> I got tired of "FPS boost" tools that change 200 registry keys and leave you with no way back. DarkHub Suite shows you
> the current value and the new value of everything before it touches anything, and every tweak can be reverted.
>
> What's in it: system optimizer (with the WinUtil tweak set, adapted), frame limiter with frametime overlay, DLSS and
> OptiScaler managers, hardware monitor with all LibreHardwareMonitor sensors, disk map, Windows repairs, and some
> offline tools.
>
> No promises of +50 FPS: most tweaks have small effects, and the app says so in each description.
>
> GitHub: https://github.com/Pokeralho/darkhub-suite
>
> Happy to answer questions. If something breaks, an issue on GitHub helps a lot.

### r/OptimizedGaming

Tone: technical and skeptical. The community values measurements and dislikes placebo. Lead with what is honest, show
evidence, invite criticism. Check the subreddit rules about tools and flair before posting.

**Title:**

> Open-source Windows tweak tool that snapshots and verifies every change, with no placebo tweaks (feedback wanted)

**Body:**

> I'm the developer of DarkHub Suite (MIT, free). Posting here because this sub is the best place to get the tweak
> list criticized.
>
> How it works:
>
> - Each tweak is defined as data (registry key, value, type, new value, previous default). Before applying, the
>   current value is saved; after applying, it is read back. Revert restores the saved value.
> - Tweaks that were wrong or harmful were removed or corrected over time, and the descriptions say when an effect is
>   small, hardware dependent or just a preference. Examples: no `fsutil memoryusage 2`, no 8.3-names change, audiodg is
>   no longer pinned to one core.
> - Built-in before/after benchmark (CPU, memory bandwidth and latency, timer latency, disk, boot time) to check whether
>   a change does anything on your machine.
> - Community "presets" are JSON files that cannot touch Defender, UAC, firewall, Windows Update or startup entries.
>
> The full list of tweaks, with exactly what each writes, is generated from the code:
> https://github.com/Pokeralho/darkhub-suite/blob/main/docs/hub/BUILTIN.md
>
> If you think any entry there is placebo or wrong, I'd like to hear it (with a source if possible). Issues and PRs
> welcome.

### r/Windows11

Tone: practical, privacy and control. Many readers are not gamers. Focus on reversibility, debloat and repairs.

**Title:**

> I built an open-source tool to tweak and repair Windows 11 where every change is reversible

**Body:**

> Disclosure: I'm the author. Free, MIT licensed, no telemetry.
>
> DarkHub Suite covers the usual Windows 11 annoyances (classic context menu, taskbar alignment, Copilot and search
> buttons, ads and suggestions, telemetry) and repairs (Windows Update reset, winget repair, component store cleanup,
> optional features like WSL, Hyper-V, Sandbox).
>
> The difference from most debloat scripts: before applying, it shows the current and new value of each change, saves
> the original, verifies it was written, and lets you undo it later, one by one. It does not remove Defender or
> disable Windows Update in community presets; those are blocked.
>
> It needs administrator rights (registry under HKLM, services, drivers); the README explains exactly why and what the
> sensitive parts do.
>
> https://github.com/Pokeralho/darkhub-suite

---

## 3. Português: comunidades brasileiras

Para Reddit (r/brdev para a parte técnica, r/computadores, r/gamesEcultura, conforme as regras de cada um), grupos de
Discord e fóruns como o Adrenaline e o Clube do Hardware. Diga que você é o autor e leia as regras de divulgação de cada
lugar antes de postar.

**Título:**

> Fiz um otimizador de Windows gratuito e de código aberto que mostra cada mudança antes de aplicar e desfaz tudo

**Texto:**

> Fala, pessoal. Sou o desenvolvedor do DarkHub Suite, um utilitário para Windows gratuito, open source (MIT), sem
> anúncio, sem conta e sem telemetria.
>
> Cansei de "otimizador" que mexe em 200 chaves do registro e não deixa voltar atrás. No DarkHub, antes de aplicar
> qualquer coisa você vê o valor atual e o valor novo de cada item, o app guarda o original, confere se o Windows
> gravou mesmo e deixa desfazer depois, item por item.
>
> Tem otimizador do sistema (com os tweaks do WinUtil adaptados), limitador de FPS com overlay de frametime,
> gerenciador de DLSS e OptiScaler, monitor de hardware com todos os sensores, mapa de disco, reparos do Windows e
> ferramentas offline. O app é todo em português e inglês.
>
> Nada de promessa de "+50 FPS": a maioria dos ajustes tem efeito pequeno e a descrição de cada um diz isso. Tem
> benchmark de antes e depois para você medir na sua máquina.
>
> Também dá para criar presets (pacotes em JSON) e compartilhar, inclusive com ajuda do Claude ou de outra IA. Os
> pacotes da comunidade não podem mexer no Defender, UAC, firewall nem Windows Update.
>
> GitHub: https://github.com/Pokeralho/darkhub-suite
> Site e guias: https://darkhub.ink/otimizador-de-pc/
>
> Quem quiser ajudar: tem issues marcadas como "good first issue" para tradução, testes e pacotes, e o README explica
> por que o app precisa de administrador e o que cada parte sensível faz.

---

## 4. Pitch for PC-optimization YouTubers

Send by email or the creator's business contact, one person at a time, personalized with a video of theirs you actually
watched. Do not offer payment for a positive review; offer early access to answer questions.

**Subject:** Open-source Windows optimizer that lets your viewers undo everything

> Hi <name>,
>
> I liked your video on <topic>, especially <specific point>.
>
> I'm the developer of DarkHub Suite, a free, MIT-licensed Windows optimizer. What might interest your audience:
>
> - It shows the current and new value of every change before applying it, and every tweak can be reverted
>   individually, so viewers can follow a video without the usual "how do I undo this" problem.
> - Built-in before/after benchmark, so you can show on camera whether a tweak does anything.
> - Presets are shareable JSON files. You could publish your own recommended preset and viewers would apply exactly
>   that, with every change listed before it runs.
>
> Repository: https://github.com/Pokeralho/darkhub-suite
>
> If you test it, I'm happy to answer technical questions or explain any tweak. Criticism is welcome too.
>
> Thanks,
> <your name>

---

## 5. Repository setup checklist (instructions only)

Run these yourself, from a terminal logged in with `gh auth login`:

1. Add topics for discovery:
   ```powershell
   gh repo edit Pokeralho/darkhub-suite --add-topic windows --add-topic optimizer --add-topic electron --add-topic gaming
   ```
2. Enable Discussions: GitHub → repository **Settings** → **General** → **Features** → tick **Discussions**. (Or
   `gh repo edit Pokeralho/darkhub-suite --enable-discussions`.) Create categories "Q&A", "Ideas", "Show and tell
   (packages)" and pin a welcome post.
3. Create the labels and issues:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File docs\community\create-issues.ps1 -DryRun
   powershell -NoProfile -ExecutionPolicy Bypass -File docs\community\create-issues.ps1
   ```
4. Turn on private vulnerability reporting (Settings → Security → Private vulnerability reporting), since .github/SECURITY.md
   points to it.
5. Review pull requests within a few days, and mark spam with the `spam` / `invalid` labels so it does
   not count.
