import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => readFileSync(join(root, rel), 'utf8');

assert.match(load('package.json'), /expo-notifications/);
assert.match(load('app.json'), /expo-notifications/);
assert.match(load('app.json'), /POST_NOTIFICATIONS/);

const availability = load('src/notifications/osNotificationsAvailability.ts');
assert.match(availability, /isOsNotificationsAvailable/);
assert.match(availability, /requireOptionalNativeModule/);
assert.doesNotMatch(availability, /from\s+['"]expo-notifications['"]/);
assert.doesNotMatch(availability, /import\(['"]expo-notifications['"]\)/);

const push = load('src/notifications/pushNotifications.ts');
assert.match(push, /isOsNotificationsAvailable/);
assert.match(push, /setNotificationHandler/);
assert.match(push, /registerExpoPushToken/);
assert.match(push, /presentMentionOsNotification/);
assert.match(push, /sendExpoPushMention/);
assert.match(push, /addNotificationResponseReceivedListener/);
assert.match(push, /import\(['"]expo-notifications['"]\)/);
assert.doesNotMatch(
  push,
  /import\s+\*\s+as\s+Notifications\s+from\s+['"]expo-notifications['"]/,
);
assert.doesNotMatch(push, /from\s+['"]expo-notifications['"]/);

const router = load('src/notifications/notificationRouter.ts');
assert.match(router, /openMentionNotification/);

const store = load('src/store/notificationStore.ts');
assert.match(store, /setOsEnabled/);
assert.match(store, /refreshPushToken/);
assert.match(store, /notifyMentionTargetsOnSave/);
assert.match(store, /presentMentionOsNotification/);

const settings = load('src/features/settings/SettingsScreen.tsx');
assert.match(settings, /Notifiche sul telefono/);

const members = load('src/domain/albumMembers.ts');
assert.match(members, /pushToken/);
assert.match(members, /memberPushTokenMapFromFile/);

const authApp = load('src/app/AuthenticatedApp.tsx');
assert.match(authApp, /await installNotificationListeners/);

console.log('ok OS notifications + push token sync (lazy native import)');
