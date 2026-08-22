import { Platform } from 'react-native';
import * as Device from 'expo-device';

import { loadDeviceSyncPrefs, saveDeviceSyncPrefs } from '../../files/deviceSyncPersist';
import type { LinkedDevice, LinkedKind } from './deviceRegistry';

function kindOfThisPhone(): LinkedKind {
  if (Platform.OS === 'ios') {
    return Platform.isPad ? 'ipad' : 'iphone';
  }
  return 'android';
}

function defaultName(): string {
  const model = Device.modelName?.trim();
  if (model) {
    return model;
  }
  if (Platform.OS === 'ios') {
    return Platform.isPad ? 'iPad' : 'iPhone';
  }
  return 'Android';
}

export async function ensureLocalDevice(): Promise<LinkedDevice> {
  const prefs = await loadDeviceSyncPrefs();
  const id = prefs.deviceId || `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const name = prefs.deviceName?.trim() || defaultName();
  const kind = prefs.deviceKind || kindOfThisPhone();
  if (prefs.deviceId !== id || prefs.deviceName !== name || prefs.deviceKind !== kind) {
    await saveDeviceSyncPrefs({ ...prefs, deviceId: id, deviceName: name, deviceKind: kind });
  }
  return {
    id,
    name,
    kind,
    via: [],
    lastSeenAt: Date.now(),
  };
}

