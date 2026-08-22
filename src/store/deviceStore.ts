import { create } from 'zustand';

import { ensureLocalDevice } from '../cloud/deviceSync/deviceIdentity';
import { isRevoked, type LinkedDevice } from '../cloud/deviceSync/deviceRegistry';
import {
  loadMergedRegistry,
  relinkThisDevice,
  unlinkRemoteDevice,
} from '../cloud/deviceSync/registryIO';
import { loadDeviceSyncPrefs } from '../files/deviceSyncPersist';

export type DeviceStore = {
  selfId: string;
  devices: LinkedDevice[];
  unlinked: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  unlink: (deviceId: string) => Promise<void>;
  relink: () => Promise<void>;
};

export const useDeviceStore = create<DeviceStore>((set) => ({
  selfId: '',
  devices: [],
  unlinked: false,
  loading: false,

  async refresh() {
    set({ loading: true });
    try {
      const [self, prefs, registry] = await Promise.all([
        ensureLocalDevice(),
        loadDeviceSyncPrefs(),
        loadMergedRegistry(),
      ]);
      const unlinked = prefs.unlinked === true || isRevoked(registry, self.id);
      const devices = registry.devices.some((device) => device.id === self.id)
        ? registry.devices
        : [
            {
              ...self,
              lastSeenAt: prefs.lastDriveAt ?? prefs.lastICloudAt ?? 0,
            },
            ...registry.devices,
          ];
      set({
        selfId: self.id,
        devices,
        unlinked,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  async unlink(deviceId) {
    const next = await unlinkRemoteDevice(deviceId);
    const self = await ensureLocalDevice();
    const prefs = await loadDeviceSyncPrefs();
    set({
      selfId: self.id,
      devices: next.devices,
      unlinked: prefs.unlinked === true || isRevoked(next, self.id),
    });
  },

  async relink() {
    const next = await relinkThisDevice();
    const self = await ensureLocalDevice();
    set({
      selfId: self.id,
      devices: next.devices,
      unlinked: false,
    });
  },
}));
