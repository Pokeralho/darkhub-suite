# Translation Guide (i18n)

DarkHub Suite uses a JSON-based internationalization structure.

---

## Adding or Editing Translations

### Method 1: In-App Testing
1. Navigate to **Settings > Language**.
2. Click **Collaborate / Import**.
3. Download the current language template (`darkhub-i18n-template.json`).
4. Modify or add translated values for your language code.
5. Paste the JSON into the text area and click **Apply Translation** to test immediately.

### Method 2: Submitting via Pull Request
1. Open `src/i18n/messages.ts`.
2. Add your language to `availableLanguages`:
 ```ts
 { code: 'fr-FR', name: 'French', nativeName: 'Français', flag: '' },
 ```
3. Add the dictionary entries under `messages`:
 ```ts
 export const messages = {
 'en-US': { ... },
 'fr-FR': {
 'app.title': 'DarkHub Suite',
 'nav.dashboard': 'Tableau de bord',
 ...
 }
 };
 ```
4. Verify compilation with `npm run build:renderer` and open a Pull Request.
