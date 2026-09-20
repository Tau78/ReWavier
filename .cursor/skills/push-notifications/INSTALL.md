# Install push-notifications skill in a repo

**Source of truth:** `~/.cursor/skills/push-notifications/`

```bash
mkdir -p .cursor/skills .cursor/rules
cp -R ~/.cursor/skills/push-notifications .cursor/skills/push-notifications
cp ~/.cursor/skills/push-notifications/templates/project-rule.mdc .cursor/rules/push-notifications.mdc 2>/dev/null || true
```

In `AGENTS.md`:

```md
# Push notifications

For OS alerts or remote push: read `.cursor/skills/push-notifications/SKILL.md`. In-app inbox ≠ Centro notifiche. Native build required after expo-notifications plugin.
```

Cloud agents only see the repo copy — commit `.cursor/skills/push-notifications/`.
