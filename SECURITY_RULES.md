# Security Threat Rules Guide

DarkHub Suite includes a local defensive sinkhole and URL heuristic scanner to help users avoid known malicious websites and phishing links.

---

## JSON Rule Schema

Community threat rules use the following format:

```json
{
  "phishingDomains": [
    "example-malicious-domain.com",
    "fake-login-service.net"
  ],
  "keywords": [
    "account-verification-required",
    "claim-reward-now"
  ],
  "brands": [
    {
      "name": "Service",
      "target": "example.com",
      "typos": ["exampel.com", "examp1e.com"]
    }
  ],
  "fileHashes": [
    { "sha256": "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f", "name": "EICAR test file" }
  ]
}
```

---

## Submission Guidelines

- **phishingDomains**: Must be verified malicious hostnames without protocol prefixes.
- **keywords**: High-confidence social engineering phrases commonly found in phishing URLs.
- **brands**: Legitimate domains and associated typosquatting variations.
- **fileHashes**: SHA-256 of confirmed malware samples (with the family or detection name). Real-time protection
  quarantines any file with a listed hash. Only submit hashes of samples confirmed by more than one engine (for example
  on MalwareBazaar or VirusTotal): a wrong hash quarantines a legitimate file for every user.

All submissions are reviewed before being integrated into default releases.
