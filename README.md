# SikLO — foundation + onboarding (batch 1)

React Native + TypeScript (Expo, expo-router) implementation of the **SikLO**
onboarding from the supplied design PDF:

| Route | Design page | Screen |
|---|---|---|
| `/` | p. 7 | Welcome — "A little space for you." |
| `/onboarding/cycle` | p. 8 | Step 1 — How would you describe your cycles? |
| `/onboarding/context` | p. 9 (+ p. 83 option lists) | Step 2 — Your context, your choice. |
| `/onboarding/dates` | p. 10 | Step 3 — Start with what you know. |
| `/onboarding/preferences` | p. 11 | Step 4 — Make this space yours. (Save) |
| `/home` | — | Placeholder after Save (summary of what was stored) |

The older purple "STEP X OF 6" screens (PDF p. 1–6, including the earlier
Name and Birthday screens) are **superseded** by this design and not used.

## Setup

```bash
# 1. New Expo app with TypeScript
npx create-expo-app@latest siklo --template blank-typescript
cd siklo

# 2. Dependencies (expo install picks versions matching your Expo SDK)
npx expo install expo-router react-native-safe-area-context react-native-screens \
  expo-linking expo-constants expo-status-bar expo-font expo-secure-store \
  react-native-svg @expo-google-fonts/plus-jakarta-sans

# 3. Copy this folder's app/, src/, app.json and tsconfig.json over the template,
#    and delete the template's App.tsx and index.ts.

# 4. In package.json set the entry point:
#    "main": "expo-router/entry"

# 5. Run
npx expo start          # then press i (iOS) or a (Android), or scan with Expo Go
npx tsc --noEmit        # strict type check
npx expo lint           # first run sets up ESLint with eslint-config-expo
```

### Why each dependency

- **expo-router** (+ screens, linking, constants): navigation, Android back handling, and `Stack.Protected` to switch between setup and saved-profile screens.
- **react-native-safe-area-context**: real notch / gesture-bar insets.
- **expo-secure-store**: on-device storage for the setup profile (Keychain / Keystore).
- **expo-font + @expo-google-fonts/plus-jakarta-sans**: the design's typeface, bundled in the app (no network fetch).
- **react-native-svg**: check marks and the welcome illustration.

No cloud services, analytics, auth, remote databases or network assets are used.
`android.allowBackup: false` stops Android's automatic cloud backup of app data.

## Structure

```
app/                     routes (expo-router)
  _layout.tsx            fonts, providers, loading/error states, protected stacks
  index.tsx              welcome
  home.tsx               post-save placeholder
  onboarding/            _layout + 4 steps
src/
  theme/                 tokens.ts (colors, spacing, radii), typography.ts
  components/            Screen, StepHeader, ChoiceCard, Button, InfoCard,
                         FormField, CalendarDateModal, icons
  state/                 ProfileContext (saved profile), OnboardingDraftContext (in-memory draft)
  storage/               profileStorage.ts (SecureStore + schema validation)
  lib/                   calendarDate.ts, periodValidation.ts
  types/                 profile.ts (data model)
  config.ts              brand name, step count, limits
```

## Behaviour

- **Save-only contract (PDF p. 83):** answers live in an in-memory draft. Back keeps them.
  Nothing is written until "Save local profile" or "Skip optional preferences & save".
- **Skip** records `skipped`; untouched questions are `not_recorded`. Neither is ever a diagnosis or a made-up date.
- **Dates** are stored as `{ year, month (1–12), day }` with no `Date` timestamps, so a chosen
  day can't shift across time zones. Month lengths and leap years are handled. Future dates
  and end-before-start are blocked in the calendar and re-checked on Continue, with an
  explanation next to the field. A changed start date never silently rewrites the end date.
- **Save** is guarded against double taps; failures keep the input and offer a retry.
- **Loading / error:** the app shows a loader while reading storage and a "Try again" screen if the saved data can't be read.

## Verification

| Check | Result |
|---|---|
| Strict `tsc` on logic modules (`lib`, `types`, `storage`, `config`, `theme/tokens`) with a typed expo-secure-store stub | Passed |
| Unit tests (calendar math incl. leap years, month grid, period validation, storage round-trip, corrupted/invalid data rejected) | Passed |
| Strict `tsc` on all screens/components against hand-written **stub** typings for React / React Native / Expo | Passed. Catches unused imports and errors in this project's own types, but **not** mismatches with the real library typings |
| `tsc` / `expo lint` against the real installed packages | **Not run** — the package registry was unreachable from the build environment |
| Running on iOS / Android, visual comparison with Figma, small screens, keyboard, large text, screen reader | **Not run** — no simulator available |

Run `npx tsc --noEmit` and `npx expo lint` after installing, and please report any errors.

## Assumptions

1. **Step 2 for every cycle answer.** The design labels it "Optional · irregular branch", but the
   progress bar always shows 4 steps. It's shown for all answers; the chip reads
   "Optional · irregular branch" only when Irregular was chosen.
2. **Contraception / life-stage** are expandable lists inside the "Other context" card, using
   the option labels from the p. 83 specimens, not separate screens.
3. **"Yes" (diagnosed condition)** is stored as yes. The follow-up branch referenced on p. 9 isn't in the supplied pages.
4. **Step 2 "Skip"** clears that step's answers (including a typed concern) and marks them skipped.
5. **Preferences start unselected.** The selections in the design (e.g. "Off — don't retain chat")
   are specimen states, and pre-selecting them would submit sample choices as the person's own.
6. **Copy changes.** Designer annotations ("Static screen · actions not wired", "Intended storage
   behavior, not a working save", "See branch specimens…") were removed. The welcome note
   now says setup is stored on-device after Save and that on-device AI isn't included.
7. **Calendar** starts weeks on Sunday and has no earliest date for the start field.
8. **Brand:** the app is named "SikLO" everywhere, including the Settings screens whose
   designs say "Local AI". The name lives in `APP_BRAND` in `src/config.ts`.
9. **Title size** 28 px matches the rendered designs; the token sheet lists 26.

## Known limitations

- **Light theme only.** Dark tokens are recorded in `tokens.ts`, but dark mode isn't wired.
- **iOS Keychain can outlive an uninstall.** A reinstall may find the old profile. Before
  release, add a first-launch check (e.g. a marker file in the app sandbox) that clears stale
  Keychain items. Nothing in the UI promises data survives uninstall, and this is not a backup.
- **SecureStore is for small data.** It fits the setup profile (concern note capped at 500
  characters). Period and symptom logs will need a different on-device store.
- **No encryption claims** are made in the UI. SecureStore's platform protection is not
  presented as app-level encryption.
- **Home is a placeholder.** Today, Calendar, Insights, Companion, Learn, Settings and Backup are later batches.
- `Stack.Protected` routing (switching to Home after Save) and Android edge-to-edge
  keyboard behaviour need checking on a device.
- The welcome illustration is redrawn to approximate the design (no asset was supplied).
