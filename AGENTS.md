# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Player UI lock

The player screen is product-approved. Follow `.cursor/rules/player-ui-lock.mdc`. Do not restyle `PlayerScreen`, waveform, controls, or the + button. New features (library, folders, settings, smart-playlist conditions) are separate screens.

# Discovery in chat

The 30 questions are **already answered**. Do not re-ask. Read `.cursor/rules/discovery-answers.mdc` and `src/features/discovery/lockedAnswers.ts`. Follow `.cursor/rules/discovery-chat.mdc`.

# Copy non tecnica

All user-facing text (app, alerts, Store, privacy) is for someone who has never opened the app. Follow `.cursor/rules/copy-semplice.mdc`. Simple, short, clear. No developer jargon.

# Decisioni utente

Product/scope/default/A/B choices: use **AskQuestion** (tappable form), never numbered lists in chat. Follow `.cursor/rules/ask-question.mdc`.

# VAI

The word **VAI** means run `scripts/vai.sh` (commit, merge to main, push, FTP docs if changed, iOS build via **Xcode local**, TestFlight). Follow `.cursor/rules/vai.mdc`. Does not use EAS Build cloud. If this machine has no Xcode, the script uses EAS.

# Apple release

TestFlight (VAI / `scripts/xcode-testflight.sh`) ≠ App Store review. Before Submit for Review, or after Guideline 2.1 Information Needed, read `.cursor/skills/apple-release/SKILL.md`. Fill `review-notes.template.txt`. Do not call the store listing ready without the review packet (7-point notes, demo login, physical iPhone recording, privacy URL, real screenshots). To reuse on the next app, copy that skill folder — see `.cursor/skills/apple-release/INSTALL.md`.

# Mac mini + iPhone

Agents launched from the phone run on the local Mac mini **My Machines** worker for that repo (`~/<path> @ Mac mini`). One-time Mac setup: `agent login`, LaunchAgent `com.cursor.agent.worker.mac-mini-all`, optional `com.cursor.remote-control.keep-awake`. Per-repo: `bash scripts/cursor-worker-setup.sh` creates `.cursor/environment.json`.

After checkout:

```bash
npm ci
npx tsc --noEmit
```

To preview on a physical iPhone on the same Wi-Fi, start Metro on the Mac mini (`npx expo start --lan --go`) and open the printed `exp://` address in Expo Go for SDK 54. Do not restyle the player.

**VAI from iPhone:** new agent → ReWavier → runtime **My Machines** → worker `~/ReWavier @ Mac mini` → write **VAI** (runs `scripts/vai.sh` on the Mac: commit, push, FTP, Xcode build, TestFlight).
