//! winapp2.ini parser (CCleaner format). The community file is downloaded from the internet, so it is treated
//! as data only: no command in it is ever run, registry keys (RegKey) are ignored, and every FileKey is
//! expanded and checked by `safety::Env::check_rule` before it becomes a cleanable rule.
//! The built-in targets are written in the same format, so one code path handles both.
use crate::safety::{is_protected_pattern, norm, Env};
use crate::util::{has_wild, wild_match};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const BUILTIN: &str = r#"
[Temporários do usuário]
DhId=user-temp
Section=Windows
FileKey1=%Temp%|*.*|RECURSE

[Temporários do Windows]
DhId=windows-temp
Section=Windows
FileKey1=%WinDir%\Temp|*.*|RECURSE

[Downloads do Windows Update]
DhId=wu-download
Section=Windows
FileKey1=%WinDir%\SoftwareDistribution\Download|*.*|RECURSE

[Despejos de memória]
DhId=crash-dumps
Section=Windows
FileKey1=%WinDir%\Minidump|*.dmp
FileKey2=%LocalAppData%\CrashDumps|*.dmp
FileKey3=%WinDir%\LiveKernelReports|*.dmp|RECURSE

[Relatórios de erro do Windows]
DhId=wer
Section=Windows
FileKey1=%ProgramData%\Microsoft\Windows\WER\ReportArchive|*.*|RECURSE
FileKey2=%ProgramData%\Microsoft\Windows\WER\ReportQueue|*.*|RECURSE
FileKey3=%LocalAppData%\Microsoft\Windows\WER|*.*|RECURSE

[Cache de miniaturas]
DhId=thumbcache
Section=Windows
Warning=O Explorer recria as miniaturas aos poucos; arquivos em uso são ignorados.
FileKey1=%LocalAppData%\Microsoft\Windows\Explorer|thumbcache_*.db;iconcache_*.db

[Logs do Windows]
DhId=windows-logs
Section=Windows
FileKey1=%WinDir%\Logs\CBS|*.log;*.cab
FileKey2=%WinDir%\Logs\DISM|*.log
FileKey3=%WinDir%\Logs\MoSetup|*.log

[Cache do Google Chrome]
DhId=chrome-cache
Section=Navegadores
DetectFile=%LocalAppData%\Google\Chrome\User Data
FileKey1=%LocalAppData%\Google\Chrome\User Data\*\Cache|*.*|RECURSE
FileKey2=%LocalAppData%\Google\Chrome\User Data\*\Code Cache|*.*|RECURSE
FileKey3=%LocalAppData%\Google\Chrome\User Data\*\GPUCache|*.*|RECURSE

[Cache do Microsoft Edge]
DhId=edge-cache
Section=Navegadores
DetectFile=%LocalAppData%\Microsoft\Edge\User Data
FileKey1=%LocalAppData%\Microsoft\Edge\User Data\*\Cache|*.*|RECURSE
FileKey2=%LocalAppData%\Microsoft\Edge\User Data\*\Code Cache|*.*|RECURSE
FileKey3=%LocalAppData%\Microsoft\Edge\User Data\*\GPUCache|*.*|RECURSE

[Cache do Firefox]
DhId=firefox-cache
Section=Navegadores
DetectFile=%LocalAppData%\Mozilla\Firefox\Profiles
FileKey1=%LocalAppData%\Mozilla\Firefox\Profiles\*\cache2|*.*|RECURSE
FileKey2=%LocalAppData%\Mozilla\Firefox\Profiles\*\startupCache|*.*|RECURSE

[Cache do Brave]
DhId=brave-cache
Section=Navegadores
DetectFile=%LocalAppData%\BraveSoftware\Brave-Browser\User Data
FileKey1=%LocalAppData%\BraveSoftware\Brave-Browser\User Data\*\Cache|*.*|RECURSE
FileKey2=%LocalAppData%\BraveSoftware\Brave-Browser\User Data\*\Code Cache|*.*|RECURSE
FileKey3=%LocalAppData%\BraveSoftware\Brave-Browser\User Data\*\GPUCache|*.*|RECURSE

[Cache do Zen Browser]
DhId=zen-cache
Section=Navegadores
DetectFile=%LocalAppData%\zen\Profiles
FileKey1=%LocalAppData%\zen\Profiles\*\cache2|*.*|RECURSE
FileKey2=%LocalAppData%\zen\Profiles\*\startupCache|*.*|RECURSE
"#;

pub struct Section {
    pub name: String,
    pub keys: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct Rule {
    pub dir: PathBuf,
    pub patterns: Vec<String>,
    pub recurse: bool,
    pub remove_self: bool,
}

#[derive(Clone, Debug)]
pub struct Exclude {
    pub dir: String,
    pub pattern: Option<String>,
}

pub struct Target {
    pub id: String,
    pub name: String,
    pub category: String,
    pub source: &'static str,
    pub warning: Option<String>,
    pub rules: Vec<Rule>,
    pub excludes: Vec<Exclude>,
    pub rejected: Vec<(String, String)>,
    pub ignored_registry: usize,
}

impl Target {
    pub fn excluded(&self, file: &Path) -> bool {
        let f = norm(file);
        self.excludes.iter().any(|e| match &e.pattern {
            None => f == e.dir || f.starts_with(&format!("{}\\", e.dir)),
            Some(p) => {
                let (dir, name) = f.rsplit_once('\\').unwrap_or(("", &f));
                (dir == e.dir || dir.starts_with(&format!("{}\\", e.dir))) && wild_match(p, name)
            }
        })
    }

    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id, "name": self.name, "category": self.category, "source": self.source, "warning": self.warning,
            "rules": self.rules.iter().map(|r| json!({
                "dir": r.dir.to_string_lossy(), "patterns": r.patterns, "recurse": r.recurse, "remove_self": r.remove_self,
            })).collect::<Vec<_>>(),
            "rejected": self.rejected.iter().map(|(raw, why)| json!({ "rule": raw, "reason": why })).collect::<Vec<_>>(),
            "ignored_registry": self.ignored_registry,
        })
    }
}

/// Splits an INI text into sections. Comments (`;`), blank lines and keys before the first section are skipped.
pub fn parse(text: &str) -> Vec<Section> {
    let mut out: Vec<Section> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim().trim_start_matches('\u{feff}');
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            out.push(Section { name: line[1..line.len() - 1].trim().to_string(), keys: Vec::new() });
            continue;
        }
        if let (Some(sec), Some((k, v))) = (out.last_mut(), line.split_once('=')) {
            sec.keys.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    out
}

fn category_of(sec: &Section) -> String {
    if let Some((_, v)) = sec.keys.iter().find(|(k, _)| k.eq_ignore_ascii_case("Section")) {
        return v.clone();
    }
    let lang = sec.keys.iter().find(|(k, _)| k.eq_ignore_ascii_case("LangSecRef")).map(|(_, v)| v.as_str()).unwrap_or("");
    match lang {
        "3021" => "Aplicativos",
        "3022" => "Internet",
        "3023" => "Multimídia",
        "3024" => "Utilitários",
        "3025" => "Windows",
        "3026" | "3027" | "3028" | "3029" | "3030" | "3031" => "Navegadores",
        _ => "Outros",
    }
    .to_string()
}

/// "%LocalAppData%\Foo\*\Cache" → every existing folder it names. Unknown variables are an error.
pub fn expand(env: &Env, raw: &str) -> Result<Vec<PathBuf>, String> {
    let raw = raw.trim().trim_matches('"').replace('/', "\\");
    let mut bases: Vec<String> = Vec::new();
    if let Some(rest) = raw.strip_prefix('%') {
        let (var, tail) = rest.split_once('%').ok_or("variável sem fechamento")?;
        let vals = env.vars.get(&var.to_lowercase()).ok_or_else(|| format!("variável desconhecida %{var}%"))?;
        for v in vals {
            bases.push(format!("{}{}", v.to_string_lossy().trim_end_matches('\\'), tail));
        }
    } else {
        bases.push(raw.clone());
    }
    if bases.iter().any(|b| b.contains('%')) {
        return Err("variável no meio do caminho".into());
    }
    let mut out = Vec::new();
    for b in bases {
        expand_wild(&b, &mut out);
    }
    Ok(out)
}

/// Resolves wildcard folder segments against the disk (never through links). Capped to avoid explosions.
fn expand_wild(path: &str, out: &mut Vec<PathBuf>) {
    let segs: Vec<&str> = path.split('\\').filter(|s| !s.is_empty()).collect();
    if segs.is_empty() {
        return;
    }
    let mut cur: Vec<PathBuf> = vec![PathBuf::from(format!("{}\\", segs[0]))];
    for seg in &segs[1..] {
        let mut next = Vec::new();
        for c in &cur {
            if has_wild(seg) {
                let Ok(rd) = std::fs::read_dir(c) else { continue };
                for e in rd.flatten() {
                    let Ok(md) = std::fs::symlink_metadata(e.path()) else { continue };
                    if md.is_dir() && !crate::files::is_reparse(&md) && wild_match(seg, &e.file_name().to_string_lossy()) {
                        next.push(e.path());
                    }
                }
            } else {
                next.push(c.join(seg));
            }
        }
        next.truncate(256);
        cur = next;
    }
    out.extend(cur);
}

fn exists_wild(env: &Env, raw: &str) -> bool {
    expand(env, raw).map(|v| v.iter().any(|p| p.exists())).unwrap_or(false)
}

fn detected(sec: &Section, env: &Env, reg_exists: &dyn Fn(&str) -> bool) -> bool {
    let mut any_rule = false;
    for (k, v) in &sec.keys {
        let k = k.to_lowercase();
        if k == "detectos" {
            // "min|max": skip entries meant only for Windows versions before 10
            let max = v.split('|').nth(1).unwrap_or("").trim();
            if let Ok(m) = max.parse::<f32>() {
                if m < 10.0 {
                    return false;
                }
            }
        }
        if k.starts_with("detectfile") {
            any_rule = true;
            if exists_wild(env, v) {
                return true;
            }
        } else if k.starts_with("detect") && k != "detectos" {
            any_rule = true;
            if reg_exists(v) {
                return true;
            }
        } else if k == "specialdetect" {
            any_rule = true;
            let p = match v.to_uppercase().as_str() {
                "DET_CHROME" => "%LocalAppData%\\Google\\Chrome\\User Data",
                "DET_MOZILLA" => "%AppData%\\Mozilla\\Firefox",
                "DET_THUNDERBIRD" => "%AppData%\\Thunderbird",
                "DET_OPERA" => "%AppData%\\Opera Software",
                _ => continue,
            };
            if exists_wild(env, p) {
                return true;
            }
        }
    }
    !any_rule
}

/// Builds a target from a section. `None` when the program is not installed or nothing in it exists here.
pub fn build(sec: &Section, env: &Env, source: &'static str, reg_exists: &dyn Fn(&str) -> bool) -> Option<Target> {
    if !detected(sec, env, reg_exists) {
        return None;
    }
    // built-in entries carry a stable ASCII id (DhId) the page uses to translate their names
    let dh_id = sec.keys.iter().find(|(k, _)| k.eq_ignore_ascii_case("DhId")).map(|(_, v)| v.as_str());
    let id = match (source, dh_id) {
        ("builtin", Some(i)) => format!("dh:{i}"),
        ("builtin", None) => format!("dh:{}", sec.name),
        _ => format!("w2:{}", sec.name),
    };
    let mut t = Target {
        id,
        name: sec.name.trim_end_matches('*').trim().to_string(),
        category: category_of(sec),
        source,
        warning: sec.keys.iter().find(|(k, _)| k.eq_ignore_ascii_case("Warning")).map(|(_, v)| v.clone()),
        rules: Vec::new(),
        excludes: Vec::new(),
        rejected: Vec::new(),
        ignored_registry: 0,
    };
    for (k, v) in &sec.keys {
        let kl = k.to_lowercase();
        if kl.starts_with("regkey") {
            t.ignored_registry += 1;
        } else if kl.starts_with("excludekey") {
            // FILE|path\name  or  PATH|path\|pattern
            let parts: Vec<&str> = v.split('|').collect();
            let kind = parts.first().map(|s| s.to_uppercase()).unwrap_or_default();
            let Some(raw) = parts.get(1) else { continue };
            let Ok(dirs) = expand(env, raw) else { continue };
            for d in dirs {
                match kind.as_str() {
                    "FILE" => t.excludes.push(Exclude { dir: norm(&d), pattern: None }),
                    "PATH" => t.excludes.push(Exclude { dir: norm(&d), pattern: parts.get(2).map(|s| s.to_string()) }),
                    _ => {}
                }
            }
        } else if kl.starts_with("filekey") {
            let parts: Vec<&str> = v.split('|').collect();
            let mut patterns: Vec<String> = parts.get(1).filter(|s| !s.trim().is_empty()).map(|s| s.split(';').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect()).unwrap_or_else(|| vec!["*.*".into()]);
            patterns.retain(|p| !is_protected_pattern(p));
            if patterns.is_empty() {
                t.rejected.push((v.clone(), "dados pessoais protegidos (senhas, chaves, favoritos)".into()));
                continue;
            }
            let flags: Vec<String> = parts.iter().skip(2).map(|s| s.trim().to_uppercase()).collect();
            let remove_self = flags.iter().any(|f| f == "REMOVESELF");
            let recurse = remove_self || flags.iter().any(|f| f == "RECURSE");
            match expand(env, parts[0]) {
                Err(why) => t.rejected.push((v.clone(), why)),
                Ok(dirs) => {
                    for dir in dirs {
                        if !dir.is_dir() {
                            continue;
                        }
                        if let Err(why) = env.check_rule(&dir, &patterns, recurse) {
                            t.rejected.push((format!("{} ({})", v, dir.to_string_lossy()), why));
                        } else {
                            t.rules.push(Rule { dir, patterns: patterns.clone(), recurse, remove_self });
                        }
                    }
                }
            }
        }
    }
    if t.rules.is_empty() && t.rejected.is_empty() {
        return None;
    }
    Some(t)
}

/// Built-in targets plus every applicable winapp2 entry (when a file is given). Returns targets and stats.
pub fn load_all(env: &Env, winapp2: Option<&str>, reg_exists: &dyn Fn(&str) -> bool) -> (Vec<Target>, Value) {
    let mut out: Vec<Target> = parse(BUILTIN).iter().filter_map(|s| build(s, env, "builtin", reg_exists)).collect();
    let mut stats = json!({ "builtin": out.len(), "winapp2_sections": 0, "winapp2_detected": 0, "rejected_rules": 0 });
    if let Some(text) = winapp2 {
        let secs = parse(text);
        stats["winapp2_sections"] = json!(secs.len());
        let found: Vec<Target> = secs.iter().filter_map(|s| build(s, env, "winapp2", reg_exists)).collect();
        stats["winapp2_detected"] = json!(found.len());
        out.extend(found);
    }
    stats["rejected_rules"] = json!(out.iter().map(|t| t.rejected.len()).sum::<usize>());
    (out, stats)
}
