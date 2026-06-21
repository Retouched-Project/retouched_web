// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export interface BmAddress {
    address: string;
    unreliablePort: number;
    reliablePort: number;
}

export interface BmDeviceCore {
    deviceId: string;
    deviceName: string;
    deviceType: number;
    address: BmAddress | null;
}

export interface BmRegistryInfo {
    slotId: number;
    appId: string;
    currentPlayers: number | null;
    maxPlayers: number | null;
    device: BmDeviceCore;
    deviceAddress: BmAddress;
}

export interface BmDeviceRecord {
    core: BmDeviceCore;
    classId: number | null;
    info: BmRegistryInfo | null;
}

export interface BmOutgoing {
    targetDeviceId: string;
    channel: number;
    reliability: number;
    payload: Uint8Array;
}

export type ControlMode = 'Gamepad' | 'Keyboard' | 'Navigation' | 'Wait';

export interface BmControlConfig {
    touchEnabled?: boolean | null;
    accelEnabled?: boolean | null;
    gyroEnabled?: boolean | null;
    orientationEnabled?: boolean | null;
    touchIntervalMs?: number | null;
    accelIntervalMs?: number | null;
    gyroIntervalMs?: number | null;
    orientationIntervalMs?: number | null;
    controlMode?: ControlMode | null;
    portalId?: string | null;
    returnAppId?: string | null;
}

export type BmEvent =
    | { type: 'Handshake'; current: number; minimum: number }
    | { type: 'PeerSeen'; record: BmDeviceRecord }
    | { type: 'PeerConnected'; record: BmDeviceRecord }
    | { type: 'ConnectionFailed'; deviceId: string }
    | { type: 'RegistrationResult'; success: boolean }
    | { type: 'SlotAssigned'; info: BmRegistryInfo }
    | { type: 'HostConnected'; info: BmRegistryInfo }
    | { type: 'HostUpdated'; info: BmRegistryInfo }
    | { type: 'HostDisconnected'; info: BmRegistryInfo }
    | { type: 'HostList'; infos: BmRegistryInfo[] }
    | { type: 'DeviceConnectRequested'; info: BmRegistryInfo }
    | { type: 'DeviceKilled'; deviceId: string }
    | { type: 'Vibrate'; sender: string }
    | { type: 'Pause'; sender: string }
    | ({ type: 'ControlConfig' } & BmControlConfig)
    | { type: 'Invoke'; sender: string | null; method: string; returnMethod: string | null; params: unknown[] }
    | { type: 'ChunkProgress'; deviceId: string; setId: string; current: number; total: number }
    | { type: 'ChunkComplete'; deviceId: string; setId: string; blob: Uint8Array };

export interface BmProcessOutput {
    events: BmEvent[];
    outgoings: BmOutgoing[];
}

export interface BmClientState {
    connected: boolean;
    games: BmRegistryInfo[];
    scheme?: unknown;
}

export const DeviceType = {
    Any: 0,
    Unity: 1,
    IPhone: 2,
    Flash: 3,
    Android: 4,
    Native: 5,
    Palm: 6,
    Server: 7,
};
