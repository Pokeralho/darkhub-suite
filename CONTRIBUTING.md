# Contributing to DarkHub Suite

Thank you for your interest in contributing to DarkHub Suite.

---

## Areas of Contribution

### 1. Translations (i18n)
Help translate the interface into other languages. Refer to [TRANSLATIONS.md](./TRANSLATIONS.md) for instructions on creating and testing translation files.

### 2. Security Rules
Submit verified phishing domain signatures or URL heuristic rules. Refer to [SECURITY_RULES.md](./SECURITY_RULES.md) for schema requirements.

### 3. Bug Fixes and Code Improvements
Help resolve issues, optimize code paths, or enhance Windows integration modules.

---

## Development Workflow

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/darkhub-suite.git
   cd darkhub-suite
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development environment:
   ```bash
   npm run dev
   ```
5. Verify that your changes compile without errors:
   ```bash
   npm run build:renderer
   ```
6. Create a branch and submit your Pull Request with a clear summary of the changes.
