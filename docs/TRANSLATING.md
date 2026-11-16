# Translating Moku

Interface strings live in `src/lib/i18n/locales/` in i18next JSON v4 format (Weblate: "i18next JSON file v4"). `en.json` is the source of truth.

## Adding a language

1. Copy `en.json` to `<code>.json`, where `<code>` is a BCP 47 tag such as `es`, `pt-BR` or `ja`.
2. Translate the values. Keep the keys and any `{{placeholders}}` exactly as they are.
3. Run the app. The language appears in **Settings → General → App language** automatically.

You don't have to translate everything at once. Any key missing from your file falls back to English.

## Plurals

Keys ending in `_one`, `_other` (and `_zero`, `_two`, `_few`, `_many` where your language needs them) are plural forms. Moku picks one with `Intl.PluralRules`, so add whichever forms your language uses:

```json
"minutes_one": "{{count}} minuto",
"minutes_other": "{{count}} minutos"
```

## Using strings in code

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte'
</script>

<span>{t('settings.general.serverUrl')}</span>
<span>{t('common.minutes', { count: 5 })}</span>
```

Keys are type-checked against `en.json`, so add a key there before using it.
