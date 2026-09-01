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
  ]
}
```

---

## Submission Guidelines

- **phishingDomains**: Must be verified malicious hostnames without protocol prefixes.
- **keywords**: High-confidence social engineering phrases commonly found in phishing URLs.
- **brands**: Legitimate domains and associated typosquatting variations.

All submissions are reviewed before being integrated into default releases.
