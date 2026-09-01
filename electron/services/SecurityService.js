import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import Logger from './LoggerService.js';
import { runPowerShell as runPowerShellShared } from './PowerShellRunner.js';
import ElevationHelper from './optimizer/ElevationHelper.js';

class SecurityService {
  constructor() {
    this.entropyCache = new Map();
    this.customPhishingDomains = [];
    this.customKeywords = [];
    this.customBrands = [];
    this.communityRulesPath = null;
    this.phishingDomains = [

      'steamcommunity-trade.com', 'steamcommunyty.com', 'steancomuninty.com', 'steam-gift-cards.com',
      'steamcommunity-market.xyz', 'steam-trade-offer.link', 'discrod-nitro.com', 'dlscord.gift',
      'discord-nitro.info', 'discord-airdrop.com', 'discord-app.net', 'discord-gift.me',
      'roblox-robux-free.com', 'roblox-security-login.xyz', 'epicgames-free-vbucks.net',
      'riotgames-gift-pass.com', 'valorant-points-free.xyz',

      'login-live-auth.com', 'microsooft-security.com', 'microsoft-verify-account.net',
      'accounts-googl.com', 'google-security-verify.xyz', 'appleid-apple-verify.com',
      'icloud-account-locked.net', 'netflix-billing-update.com', 'amazon-order-verification.net',
      'paypal-account-security.xyz', 'paypa1-security.com',

      'metamask-restore-seed.com', 'pancakeswap-airdrop.claim', 'uniswap-v3-airdrop.xyz',
      'trustwallet-sync-node.com', 'phantom-wallet-recovery.com', 'ledger-live-verify.net',
      'trezor-hardware-update.xyz', 'opensea-claim-nft.xyz', 'coinbase-account-locked.com',
      'binance-security-verify.net', 'bybit-auth-verify.xyz'
    ];
  }

  init() {
    Logger.info('SecurityService', 'Initialized Advanced Security & Anti-Phishing Engine.');

    ipcMain.handle('security:scanProcesses', async () => {
      return await this.scanRunningProcesses();
    });

    ipcMain.handle('security:scanUrl', async (_e, payload) => {
      return this.scanUrl(payload?.url);
    });

    ipcMain.handle('security:enablePhishingShield', async () => {
      return await this.enablePhishingShield();
    });

    ipcMain.handle('security:disablePhishingShield', async () => {
      return await this.disablePhishingShield();
    });

    ipcMain.handle('security:getPhishingShieldStatus', async () => {
      return this.getPhishingShieldStatus();
    });

    ipcMain.handle('security:getLiveNetworkConnections', async () => {
      return await this.getLiveNetworkConnections();
    });

    ipcMain.handle('security:checkRansomwareArmor', async () => {
      return await this.checkRansomwareArmor();
    });

    ipcMain.handle('security:enableRansomwareArmor', async () => {
      return await this.enableRansomwareArmor();
    });

    ipcMain.handle('security:getCommunityRules', async () => {
      return this.getCommunityRules();
    });

    ipcMain.handle('security:importCommunityRules', async (_e, payload) => {
      return this.importCommunityRules(payload);
    });

    ipcMain.handle('security:resetCommunityRules', async () => {
      return this.resetCommunityRules();
    });

    this.loadCommunityRules();

    this.autoShieldBoot();
  }

  async autoShieldBoot() {
    try {
      const status = this.getPhishingShieldStatus();
      if (!status.active && process.platform === 'win32') {
        Logger.info('SecurityService', 'Auto-enabling Real-Time Anti-Phishing Shield on boot...');
        await this.enablePhishingShield();
      }
    } catch (e) {
      Logger.warn('SecurityService', 'Auto-shield boot notice:', e?.message || e);
    }
  }

  async runPowerShell(script, timeoutMs = 20000) {
    try {
      const { code, stdout, stderr } = await runPowerShellShared(script, { timeoutMs, trim: true });
      if (code !== 0) {
        Logger.warn('SecurityService', `PowerShell exit code ${code}: ${stderr || '(sem stderr)'}`);
        return '[]';
      }
      return stdout;
    } catch (err) {
      Logger.warn('SecurityService', `PowerShell falhou: ${err?.message ?? String(err)}`);
      return '[]';
    }
  }

  async calculateEntropy(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return 0;
    try {
      const stat = await fs.promises.stat(filePath);
      const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;
      if (this.entropyCache.has(cacheKey)) {
        return this.entropyCache.get(cacheKey);
      }

      const entropy = await new Promise((resolve) => {
        const stream = fs.createReadStream(filePath, { start: 0, end: Math.min(stat.size, 512 * 1024) - 1 });
        const freqs = new Uint32Array(256);
        let total = 0;

        stream.on('data', chunk => {
          for (let i = 0; i < chunk.length; i++) {
            freqs[chunk[i]]++;
            total++;
          }
        });

        stream.on('end', () => {
          if (total === 0) return resolve(0);
          let ent = 0;
          for (let i = 0; i < 256; i++) {
            if (freqs[i] > 0) {
              const p = freqs[i] / total;
              ent -= p * Math.log2(p);
            }
          }
          resolve(Number(ent.toFixed(2)));
        });

        stream.on('error', () => resolve(0));
      });

      if (this.entropyCache.size > 500) {
        const firstKey = this.entropyCache.keys().next().value;
        this.entropyCache.delete(firstKey);
      }
      this.entropyCache.set(cacheKey, entropy);
      return entropy;
    } catch (e) {
      return 0;
    }
  }

  async scanRunningProcesses() {
    return Logger.track('SecurityService', 'Process Reputation Scan', async () => {
      const script = `
        $procs = Get-Process | Where-Object { $_.Path -ne $null } | Select-Object Id, ProcessName, Path, WorkingSet64
        $uniquePaths = $procs | Select-Object -ExpandProperty Path -Unique
        $sigMap = @{}
        foreach ($up in $uniquePaths) {
          $sig = Get-AuthenticodeSignature -FilePath $up -ErrorAction SilentlyContinue
          $isSigned = $false
          $signer = ""
          if ($sig -and $sig.Status -eq "Valid") {
            $isSigned = $true
            $signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "" }
          }
          $sigMap[$up] = @{ IsSigned = $isSigned; Signer = $signer }
        }

        $results = @()
        foreach ($p in $procs) {
          $path = $p.Path
          $sigInfo = $sigMap[$path]
          $company = ""
          try {
            $fileInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($path)
            $company = $fileInfo.CompanyName
          } catch {}

          $results += [PSCustomObject]@{
            Id = $p.Id
            Name = $p.ProcessName
            Path = $path
            Company = $company
            IsSigned = if ($sigInfo) { $sigInfo.IsSigned } else { $false }
            Signer = if ($sigInfo) { $sigInfo.Signer } else { "" }
            MemoryMb = [math]::Round($p.WorkingSet64 / 1MB, 1)
          }
        }
        $results | ConvertTo-Json -Compress
      `;

      const raw = await this.runPowerShell(script);
      let processes = [];
      try {
        const parsed = JSON.parse(raw);
        processes = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch(e) { processes = []; }

      const analyzed = await Promise.all(processes.map(async (proc) => {
        let score = 0;
        let flags = [];
        const lowPath = (proc.Path || '').toLowerCase();
        const pid = proc.Id || proc.pid || 0;

        if (!proc.IsSigned) {
          score += 35;
          flags.push('Binário não assinado');
        }

        if (lowPath.includes('\\appdata\\local\\temp\\')) {
          score += 45;
          flags.push('Execução em pasta Temp (Volátil)');
        } else if (lowPath.includes('\\downloads\\') && !proc.IsSigned) {
          score += 30;
          flags.push('Executável recente na pasta Downloads');
        } else if (lowPath.includes('\\appdata\\') && !proc.Company) {
          score += 25;
          flags.push('Execução em AppData sem identificação de fabricante');
        }

        const entropy = await this.calculateEntropy(proc.Path);
        if (entropy > 7.2) {
          score += 35;
          flags.push(`Alta Entropia (${entropy}) - Código Ofuscado/Packer`);
        }

        const sysNames = ['svchost.exe', 'lsass.exe', 'csrss.exe', 'services.exe', 'smss.exe'];
        for (const sn of sysNames) {
          if (lowPath.endsWith(sn) && !lowPath.includes('\\windows\\system32\\')) {
            score += 90;
            flags.push(`Sequestro de processo de sistema (${sn} fora do System32)`);
            break;
          }
        }

        return {
          ...proc,
          pid,
          entropy,
          score: Math.min(score, 100),
          risk: score >= 70 ? 'CRITICAL' : (score >= 40 ? 'WARNING' : 'SAFE'),
          flags
        };
      }));

      return analyzed.filter(a => a.score > 0).sort((a, b) => b.score - a.score);
    });
  }

  scanUrl(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') {
      return { ok: false, error: 'URL inválida ou em branco' };
    }

    let urlObj;
    let raw = inputUrl.trim();
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = 'https://' + raw;
    }

    try {
      urlObj = new URL(raw);
    } catch {
      return { ok: false, error: 'Formato de URL inválido' };
    }

    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    const fullUrl = urlObj.href.toLowerCase();

    let score = 0;
    let flags = [];

    const isIpHost = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
    if (isIpHost) {
      score += 45;
      flags.push('Acesso direto por endereço IP numérico (Sem domínio DNS registrado)');
    }

    if (hostname.startsWith('xn--') || hostname.includes('.xn--')) {
      score += 55;
      flags.push('Ataque Homógrafo Detectado (Domínio Punycode internacional com caracteres disfarçados)');
    }

    const highRiskTlds = ['.zip', '.mov', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.buzz', '.rest', '.icu', '.sbs', '.cam', '.work', '.click', '.surf', '.monster'];
    for (const tld of highRiskTlds) {
      if (hostname.endsWith(tld)) {
        score += 30;
        flags.push(`Extensão de domínio TLD de alto risco (${tld})`);
        break;
      }
    }

    const targetBrands = [
      { name: 'Steam', target: 'steamcommunity.com', typos: ['stean', 'steamcom', 'steamm', 'stearn', 'steamcomm'] },
      { name: 'Discord', target: 'discord.com', typos: ['discrod', 'dlscord', 'discorcl', 'discord-nitro', 'discordapp-nitro'] },
      { name: 'Microsoft', target: 'microsoft.com', typos: ['micros0ft', 'microsooft', 'micosoft', 'login-live', 'ms-security'] },
      { name: 'Google', target: 'google.com', typos: ['googl', 'g00gle', 'googel', 'google-verify'] },
      { name: 'PayPal', target: 'paypal.com', typos: ['paypa1', 'paypai', 'paypal-security', 'pay-pal'] },
      { name: 'Metamask', target: 'metamask.io', typos: ['metamask-login', 'metamasc', 'metamask-restore'] }
    ];

    for (const b of targetBrands) {
      if (hostname !== b.target && !hostname.endsWith('.' + b.target)) {
        for (const typo of b.typos) {
          if (hostname.includes(typo)) {
            score += 65;
            flags.push(`Possível Typosquatting / Clone Phishing da marca ${b.name}`);
            break;
          }
        }
      }
    }

    const lureKeywords = ['free-nitro', 'airdrop', 'claim-gift', 'wallet-connect', 'verify-account', 'account-locked', 'restore-seed', 'free-robux', 'claim-reward', 'security-update'];
    for (const kw of lureKeywords) {
      if (fullUrl.includes(kw)) {
        score += 35;
        flags.push(`Termo comum em iscas de engenharia social detectado: "${kw}"`);
        break;
      }
    }

    if (urlObj.protocol === 'http:') {
      score += 20;
      flags.push('Conexão sem criptografia SSL/TLS (HTTP inseguro)');
    }

    if (this.getAllPhishingDomains().some(pd => hostname === pd || hostname.endsWith('.' + pd))) {
      score = 100;
      flags.push('Domínio presente na Base de Ameaças e Phishing do DarkHub Shield');
    }

    const finalScore = Math.min(score, 100);
    const verdict = finalScore >= 70 ? 'MALICIOUS' : (finalScore >= 35 ? 'SUSPICIOUS' : 'CLEAN');

    return {
      ok: true,
      url: inputUrl,
      hostname,
      score: finalScore,
      verdict,
      flags,
      recommendation: verdict === 'MALICIOUS'
        ? 'PERIGO CRÍTICO: Não acesse este link nem forneça senhas ou tokens.'
        : verdict === 'SUSPICIOUS'
        ? 'CUIDADO: Link suspeito com indicadores incomuns.'
        : 'Link aparentemente seguro de acordo com as análises heurísticas.'
    };
  }

  async enablePhishingShield() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
      const backupPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts.darkhub.bak';

      let currentHosts = '';
      if (fs.existsSync(hostsPath)) {
        currentHosts = fs.readFileSync(hostsPath, 'utf8');
      }

      if (!fs.existsSync(backupPath) && currentHosts) {
        try { fs.writeFileSync(backupPath, currentHosts, 'utf8'); } catch {}
      }

      const cleanHosts = currentHosts.replace(/# DarkHub Anti-Phishing Shield - BEGIN[\s\S]*?# DarkHub Anti-Phishing Shield - END/g, '').trim();

      const blockRules = this.getAllPhishingDomains().map(d => `0.0.0.0 ${d}\n0.0.0.0 www.${d}`).join('\n');
      const newBlock = `\n\n# DarkHub Anti-Phishing Shield - BEGIN\n${blockRules}\n# DarkHub Anti-Phishing Shield - END\n`;

      const finalContent = cleanHosts + newBlock;
      const tmpFile = path.join(process.env.TEMP || 'C:\\Temp', 'hosts_shield.tmp');
      fs.writeFileSync(tmpFile, finalContent, 'utf8');

      const script = `
        $ErrorActionPreference = 'Stop'
        Copy-Item -Path "${tmpFile}" -Destination "${hostsPath}" -Force
        Remove-Item -Path "${tmpFile}" -Force -ErrorAction SilentlyContinue
        ipconfig /flushdns
      `;
      const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
      if (code !== 0) return { ok: false, error: stderr || 'Falha ao atualizar arquivo hosts' };

      return {
        ok: true,
        msg: `Escudo Anti-Phishing ATIVO! ${this.getAllPhishingDomains().length * 2} regras de bloqueio aplicadas.`
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async disablePhishingShield() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
      if (!fs.existsSync(hostsPath)) return { ok: true, msg: 'Hosts padrão mantido.' };

      const currentHosts = fs.readFileSync(hostsPath, 'utf8');
      const cleanHosts = currentHosts.replace(/# DarkHub Anti-Phishing Shield - BEGIN[\s\S]*?# DarkHub Anti-Phishing Shield - END/g, '').trim();

      const tmpFile = path.join(process.env.TEMP || 'C:\\Temp', 'hosts_shield_clean.tmp');
      fs.writeFileSync(tmpFile, cleanHosts + '\n', 'utf8');

      const script = `
        $ErrorActionPreference = 'Stop'
        Copy-Item -Path "${tmpFile}" -Destination "${hostsPath}" -Force
        Remove-Item -Path "${tmpFile}" -Force -ErrorAction SilentlyContinue
        ipconfig /flushdns
      `;
      const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
      if (code !== 0) return { ok: false, error: stderr };

      return { ok: true, msg: 'Escudo Anti-Phishing desativado e arquivo hosts restaurado.' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  getPhishingShieldStatus() {
    try {
      const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
      if (!fs.existsSync(hostsPath)) return { ok: true, active: false, count: 0 };
      const content = fs.readFileSync(hostsPath, 'utf8');
      const active = content.includes('# DarkHub Anti-Phishing Shield - BEGIN');
      return {
        ok: true,
        active,
        totalDomains: this.getAllPhishingDomains().length,
        rulesCount: this.getAllPhishingDomains().length * 2
      };
    } catch (e) {
      return { ok: false, active: false, error: e.message };
    }
  }

  async getLiveNetworkConnections() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $conns = Get-NetTCPConnection | Where-Object { $_.State -eq 'Listen' -or $_.State -eq 'Established' } | Select-Object -First 60 LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
      $procs = Get-Process | Select-Object Id, ProcessName
      $procMap = @{}
      foreach ($p in $procs) { $procMap[$p.Id] = $p.ProcessName }

      $results = @()
      foreach ($c in $conns) {
        $pName = if ($procMap[$c.OwningProcess]) { $procMap[$c.OwningProcess] } else { "PID: " + $c.OwningProcess }
        $isSuspicious = $false
        # Portas conhecidas de trojans / backdoors / IRC maliciosos
        if ($c.LocalPort -in @(4444, 5555, 6666, 6667, 1337, 31337, 8888, 9999) -or $c.RemotePort -in @(4444, 5555, 6666, 6667, 1337, 31337)) {
          $isSuspicious = $true
        }
        $results += [PSCustomObject]@{
          Local = "$($c.LocalAddress):$($c.LocalPort)"
          Remote = if ($c.RemoteAddress) { "$($c.RemoteAddress):$($c.RemotePort)" } else { "N/A" }
          State = $c.State
          Pid = $c.OwningProcess
          ProcessName = $pName
          IsSuspicious = $isSuspicious
        }
      }
      $results | ConvertTo-Json -Compress
    `;
    const raw = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      return { ok: true, connections: list };
    } catch (e) {
      return { ok: false, error: e.message, connections: [] };
    }
  }

  async checkRansomwareArmor() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $vss = (Get-Service -Name "VSS" -ErrorAction SilentlyContinue).Status
      $smb1 = (Get-WindowsOptionalFeature -Online -FeatureName "SMB1Protocol" -ErrorAction SilentlyContinue).State

      [PSCustomObject]@{
        vssRunning = ($vss -eq 'Running')
        vssStatus = [string]$vss
        smb1Disabled = ($smb1 -ne 'Enabled')
      } | ConvertTo-Json -Compress
    `;
    const raw = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, armor: parsed };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async enableRansomwareArmor() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      # 1. Configura e inicia serviço de Volume Shadow Copy (VSS)
      Set-Service -Name "VSS" -StartupType Automatic
      Start-Service -Name "VSS" -ErrorAction SilentlyContinue

      # 2. Desativa protocolo SMBv1 vulnerável a exploits estilo WannaCry / EternalBlue
      Disable-WindowsOptionalFeature -Online -FeatureName "SMB1Protocol" -NoRestart -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -ErrorAction SilentlyContinue

      # 3. Cria Ponto de Restauração Imediato
      Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue
      Checkpoint-Computer -Description "DarkHub Ransomware Armor Checkpoint" -RestorePointType "MODIFY_SETTINGS" -ErrorAction SilentlyContinue
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Blindagem Anti-Ransomware ATIVADA: VSS configurado, SMBv1 bloqueado e Checkpoint gerado.' };
  }

  _getRulesFilePath() {
    const appData = process.env.APPDATA || path.join(process.cwd(), '.data');
    const dir = path.join(appData, 'DarkHub');
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
    return path.join(dir, 'security_community_rules.json');
  }

  loadCommunityRules() {
    try {
      const p = this._getRulesFilePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.phishingDomains)) this.customPhishingDomains = parsed.phishingDomains;
        if (Array.isArray(parsed.keywords)) this.customKeywords = parsed.keywords;
        if (Array.isArray(parsed.brands)) this.customBrands = parsed.brands;
        Logger.info('SecurityService', `Loaded ${this.customPhishingDomains.length} community phishing rules.`);
      }
    } catch (e) {
      Logger.warn('SecurityService', 'Failed to load community rules:', e);
    }
  }

  getCommunityRules() {
    return {
      ok: true,
      defaultsCount: this.phishingDomains.length,
      customPhishingDomains: this.customPhishingDomains,
      customKeywords: this.customKeywords,
      customBrands: this.customBrands,
      totalActivePhishingDomains: this.getAllPhishingDomains().length
    };
  }

  getAllPhishingDomains() {
    return Array.from(new Set([...this.phishingDomains, ...this.customPhishingDomains]));
  }

  importCommunityRules(payload) {
    try {
      const { phishingDomains = [], keywords = [], brands = [] } = payload || {};
      if (Array.isArray(phishingDomains)) {
        this.customPhishingDomains = Array.from(new Set([
          ...this.customPhishingDomains,
          ...phishingDomains.map(d => String(d).trim().toLowerCase()).filter(Boolean)
        ]));
      }
      if (Array.isArray(keywords)) {
        this.customKeywords = Array.from(new Set([
          ...this.customKeywords,
          ...keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)
        ]));
      }
      if (Array.isArray(brands)) {
        this.customBrands = [...this.customBrands, ...brands];
      }

      const p = this._getRulesFilePath();
      fs.writeFileSync(p, JSON.stringify({
        phishingDomains: this.customPhishingDomains,
        keywords: this.customKeywords,
        brands: this.customBrands,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');

      return {
        ok: true,
        msg: `Regras da comunidade importadas com sucesso! Total de regras ativas: ${this.getAllPhishingDomains().length}`,
        total: this.getAllPhishingDomains().length
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  resetCommunityRules() {
    try {
      this.customPhishingDomains = [];
      this.customKeywords = [];
      this.customBrands = [];
      const p = this._getRulesFilePath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { ok: true, msg: 'Regras da comunidade redefinidas para o padrão de fábrica.' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

export default new SecurityService();
