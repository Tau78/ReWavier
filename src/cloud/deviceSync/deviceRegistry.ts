export type LinkedKind = 'iphone' | 'ipad' | 'android';
export type LinkedVia = 'icloud' | 'drive';

export type LinkedDevice = {
  id: string;
  name: string;
  kind: LinkedKind;
  via: LinkedVia[];
  lastSeenAt: number;
};

export type DeviceRegistry = {
  version: 1;
  devices: LinkedDevice[];
  revokedIds: string[];
};

export const EMPTY_REGISTRY: DeviceRegistry = {
  version: 1,
  devices: [],
  revokedIds: [],
};

function uniqueVia(values: LinkedVia[]): LinkedVia[] {
  return [...new Set(values.filter((item) => item === 'icloud' || item === 'drive'))];
}

export function parseDeviceRegistry(raw: unknown): DeviceRegistry {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_REGISTRY };
  }
  const data = raw as Partial<DeviceRegistry>;
  const revokedIds = Array.isArray(data.revokedIds)
    ? data.revokedIds.filter((id): id is string => typeof id === 'string')
    : [];
  const devices = Array.isArray(data.devices)
    ? data.devices
        .filter((item): item is LinkedDevice => Boolean(item && typeof item.id === 'string'))
        .map((item) => ({
          id: item.id,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Telefono',
          kind: (item.kind === 'ipad' || item.kind === 'android' ? item.kind : 'iphone') as LinkedKind,
          via: uniqueVia(Array.isArray(item.via) ? item.via : []),
          lastSeenAt: typeof item.lastSeenAt === 'number' ? item.lastSeenAt : 0,
        }))
        .filter((item) => !revokedIds.includes(item.id))
    : [];
  return { version: 1, devices, revokedIds };
}

export function mergeRegistries(...lists: DeviceRegistry[]): DeviceRegistry {
  const revoked = new Set<string>();
  const byId = new Map<string, LinkedDevice>();
  for (const list of lists) {
    for (const id of list.revokedIds) {
      revoked.add(id);
    }
    for (const device of list.devices) {
      const existing = byId.get(device.id);
      if (!existing) {
        byId.set(device.id, { ...device, via: uniqueVia(device.via) });
        continue;
      }
      byId.set(device.id, {
        id: device.id,
        name: device.lastSeenAt >= existing.lastSeenAt ? device.name : existing.name,
        kind: device.kind || existing.kind,
        via: uniqueVia([...existing.via, ...device.via]),
        lastSeenAt: Math.max(existing.lastSeenAt, device.lastSeenAt),
      });
    }
  }
  return {
    version: 1,
    devices: [...byId.values()]
      .filter((device) => !revoked.has(device.id))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    revokedIds: [...revoked],
  };
}

export function registerDevice(
  registry: DeviceRegistry,
  device: LinkedDevice,
  via: LinkedVia,
): DeviceRegistry {
  if (registry.revokedIds.includes(device.id)) {
    return registry;
  }
  return mergeRegistries(registry, {
    version: 1,
    devices: [{ ...device, via: [via], lastSeenAt: Date.now() }],
    revokedIds: [],
  });
}

export function revokeDevice(registry: DeviceRegistry, deviceId: string): DeviceRegistry {
  return {
    version: 1,
    devices: registry.devices.filter((device) => device.id !== deviceId),
    revokedIds: [...new Set([...registry.revokedIds, deviceId])],
  };
}

export function isRevoked(registry: DeviceRegistry, deviceId: string): boolean {
  return registry.revokedIds.includes(deviceId);
}
