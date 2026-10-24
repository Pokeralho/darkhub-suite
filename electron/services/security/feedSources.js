// Community threat feeds used by Advanced Security. Every URL here was fetched and its format checked
// before being added (2026-10-23). Content is only ever parsed as data (domains, IPs, hashes), never executed.
//
// kind:   'hosts'  -> domains written to the managed block of the Windows hosts file (0.0.0.0 sinkhole)
//         'ip'     -> IPv4 addresses / CIDRs for Windows Firewall block rules
//         'hash'   -> SHA-256 file hashes fed to the real-time protection (SecurityService file-hash rules)
// format: 'hosts'   -> "0.0.0.0 domain" / "127.0.0.1 domain" lines
//         'domains' -> one domain per line
//         'ips'     -> one IPv4 or CIDR per line (comments after ';' or '#')
//         'sha256'  -> one SHA-256 per line, optionally "hash;comment"

export const FEED_SOURCES = Object.freeze([
  {
    id: 'stevenblack-unified',
    kind: 'hosts',
    format: 'hosts',
    name: 'StevenBlack hosts (unified: ads + malware)',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    homepage: 'https://github.com/StevenBlack/hosts',
    license: 'MIT',
    maxBytes: 8 * 1024 * 1024,
    defaultEnabled: false
  },
  {
    id: 'stevenblack-fakenews',
    kind: 'hosts',
    format: 'hosts',
    name: 'StevenBlack + fakenews',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews/hosts',
    homepage: 'https://github.com/StevenBlack/hosts',
    license: 'MIT',
    maxBytes: 8 * 1024 * 1024,
    defaultEnabled: false,
    note: 'includesUnified'
  },
  {
    id: 'stevenblack-gambling',
    kind: 'hosts',
    format: 'hosts',
    name: 'StevenBlack + gambling',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling/hosts',
    homepage: 'https://github.com/StevenBlack/hosts',
    license: 'MIT',
    maxBytes: 8 * 1024 * 1024,
    defaultEnabled: false,
    note: 'includesUnified'
  },
  {
    id: 'stevenblack-porn',
    kind: 'hosts',
    format: 'hosts',
    name: 'StevenBlack + porn',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts',
    homepage: 'https://github.com/StevenBlack/hosts',
    license: 'MIT',
    maxBytes: 12 * 1024 * 1024,
    defaultEnabled: false,
    note: 'includesUnified'
  },
  {
    id: 'hagezi-pro-mini',
    kind: 'hosts',
    format: 'domains',
    name: 'HaGeZi Multi PRO mini',
    url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro.mini-onlydomains.txt',
    homepage: 'https://github.com/hagezi/dns-blocklists',
    license: 'GPL-3.0',
    maxBytes: 8 * 1024 * 1024,
    defaultEnabled: false
  },
  {
    id: 'hagezi-tif-mini',
    kind: 'hosts',
    format: 'domains',
    name: 'HaGeZi Threat Intelligence Feeds (mini)',
    url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/tif.mini-onlydomains.txt',
    homepage: 'https://github.com/hagezi/dns-blocklists',
    license: 'GPL-3.0',
    maxBytes: 10 * 1024 * 1024,
    defaultEnabled: false,
    note: 'large'
  },
  {
    id: 'urlhaus-filter',
    kind: 'hosts',
    format: 'hosts',
    name: 'URLhaus malware hosts (malware-filter)',
    url: 'https://curbengh.github.io/malware-filter/urlhaus-filter-hosts.txt',
    mirrors: ['https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts.txt'],
    homepage: 'https://gitlab.com/malware-filter/urlhaus-filter',
    license: 'CC0-1.0 (data: abuse.ch URLhaus, CC0)',
    maxBytes: 4 * 1024 * 1024,
    defaultEnabled: true
  },
  {
    id: 'phishing-filter',
    kind: 'hosts',
    format: 'hosts',
    name: 'Phishing hosts (OpenPhish, PhishTank, IPThreat)',
    url: 'https://curbengh.github.io/malware-filter/phishing-filter-hosts.txt',
    mirrors: ['https://malware-filter.gitlab.io/malware-filter/phishing-filter-hosts.txt'],
    homepage: 'https://gitlab.com/malware-filter/phishing-filter',
    license: 'CC BY-SA 4.0',
    maxBytes: 6 * 1024 * 1024,
    defaultEnabled: false
  },
  {
    id: 'spamhaus-drop',
    kind: 'ip',
    format: 'ips',
    name: 'Spamhaus DROP (hijacked / criminal networks)',
    url: 'https://www.spamhaus.org/drop/drop.txt',
    homepage: 'https://www.spamhaus.org/blocklists/do-not-route-or-peer/',
    license: 'Spamhaus DROP terms (free to use)',
    maxBytes: 1024 * 1024,
    defaultEnabled: true
  },
  {
    id: 'feodo-recommended',
    kind: 'ip',
    format: 'ips',
    name: 'abuse.ch Feodo Tracker botnet C2 (recommended)',
    url: 'https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt',
    homepage: 'https://feodotracker.abuse.ch/blocklist/',
    license: 'CC0-1.0',
    maxBytes: 1024 * 1024,
    defaultEnabled: true
  },
  {
    id: 'ipsum-level3',
    kind: 'ip',
    format: 'ips',
    name: 'IPsum level 3 (IPs on 3+ blacklists)',
    url: 'https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt',
    homepage: 'https://github.com/stamparm/ipsum',
    license: 'Unlicense',
    maxBytes: 4 * 1024 * 1024,
    defaultEnabled: false,
    note: 'large'
  },
  {
    id: 'malicious-hash-sha256',
    kind: 'hash',
    format: 'sha256',
    name: 'romainmarcoux/malicious-hash (SHA-256)',
    url: 'https://raw.githubusercontent.com/romainmarcoux/malicious-hash/main/full-hash-sha256-aa.txt',
    homepage: 'https://github.com/romainmarcoux/malicious-hash',
    license: 'MIT',
    maxBytes: 16 * 1024 * 1024,
    defaultEnabled: true
  },
  {
    id: 'signature-base-hashes',
    kind: 'hash',
    format: 'sha256',
    name: 'Neo23x0 signature-base hash IOCs (SHA-256 only)',
    url: 'https://raw.githubusercontent.com/Neo23x0/signature-base/master/iocs/hash-iocs.txt',
    homepage: 'https://github.com/Neo23x0/signature-base',
    license: 'Detection Rule License 1.1',
    maxBytes: 8 * 1024 * 1024,
    defaultEnabled: true
  }
]);

/** Only these hosts may serve feed content (checked on the final URL after redirects too). */
export const FEED_ALLOWED_HOSTS = Object.freeze([
  'raw.githubusercontent.com',
  'curbengh.github.io',
  'malware-filter.gitlab.io',
  'www.spamhaus.org',
  'feodotracker.abuse.ch'
]);

export function getFeedSource(id) {
  return FEED_SOURCES.find((s) => s.id === id) || null;
}

export function isAllowedFeedUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && FEED_ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
