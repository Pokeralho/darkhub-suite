---
title: "Tests for log secret redaction (redactSecrets)"
labels: good first issue, tests
---

## Context

`redactSecrets()` in `electron/services/LoggerService.js` masks passwords, tokens, API keys, GitHub tokens and
credentials in URLs before anything reaches the log file. Users attach that log to bug reports, so a regression here
could leak a secret. It has no direct test.

## What to do

Create `tests/redactSecrets.test.ts` that imports `{ redactSecrets }` from `../electron/services/LoggerService.js` and
checks each pattern in `SECRET_PATTERNS`:

- query strings: `https://x.com/?token=abc&page=2` keeps `page=2` and hides `abc`; also `api_key`, `apikey`, `sig`,
  `password`
- `key=value` and JSON-like text: `password: hunter2`, `"secret":"abc"`, `masterPassword=...`, `recoveryWords=...`
- GitHub tokens: `ghp_` + 36 characters and `github_pat_...` become `[REDACTED_GH_TOKEN]`
- credentials in URLs: `https://user:pass@host/path` becomes `https://[REDACTED]@host/path`
- things that must **not** change: a normal sentence, a path like `C:\Users\Ana\Documents`, the word "tokens" alone
- `null` and `undefined` give `''`; numbers are converted to text

Use the real secret-looking values only as fake test data (never a real token).

## Files to look at

- `electron/services/LoggerService.js` (`SECRET_PATTERNS` and `redactSecrets`, near the top)
- any test in `tests/` for the import style

## How to test

```bash
npx vitest run tests/redactSecrets.test.ts
```

## Definition of done

- [ ] Every pattern has at least one positive and one negative case
- [ ] `npx vitest run` passes
- [ ] If you find a secret format that is not masked, describe it in the pull request (a fix is welcome as a separate
      commit)
