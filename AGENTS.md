# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Player UI lock

The player screen is product-approved. Follow `.cursor/rules/player-ui-lock.mdc`. Do not restyle `PlayerScreen`, waveform, controls, or the + button. New features (library, folders, settings, smart-playlist conditions) are separate screens.

# Discovery in chat

The 30 questions are **already answered**. Do not re-ask. Read `.cursor/rules/discovery-answers.mdc` and `src/features/discovery/lockedAnswers.ts`. Follow `.cursor/rules/discovery-chat.mdc`.

# Copy non tecnica

All user-facing text (app, alerts, Store, privacy) is for someone who has never opened the app. Follow `.cursor/rules/copy-semplice.mdc`. Simple, short, clear. No developer jargon.

# VAI

The word **VAI** means run `scripts/vai.sh` (commit, merge to main, push, FTP docs if changed, iOS build). Follow `.cursor/rules/vai.mdc`.

# Mac mini + iPhone

Agents launched from the phone can run on the local Mac mini private worker. After checkout:

```bash
npm ci
npx tsc --noEmit
```

To preview on a physical iPhone on the same Wi-Fi, start Metro on the Mac mini (`npx expo start --lan --go`) and open the printed `exp://` address in Expo Go for SDK 54. Do not restyle the player.
