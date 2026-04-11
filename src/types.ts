// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export interface BmRegistryInfo {
    slotId: number;
    appId: string;
    currentPlayers: number;
    maxPlayers: number;
    deviceType: number;
    deviceId: string;
    deviceName: string;
    device: {
        id: string;
        name: string;
        device_type: number;
        address: {
            address: string;
            reliable_port: number;
            unreliable_port: number;
        };
    };
}

export interface BmClientState {
    connected: boolean;
    games: BmRegistryInfo[];
    scheme?: unknown;
}

export type BmAction =
    | { type: 'Send', targetDeviceId: string, channel: number, reliability: number, payload: Uint8Array }
    | { type: 'RegistryEvent', kind: string, success?: boolean, infos: BmRegistryInfo[] }
    | { type: 'ChunkProgress', deviceId: string, setId: string, current: number, total: number }
    | { type: 'ChunkComplete', deviceId: string, setId: string, blob: Uint8Array }
    | { type: 'Log', level: number, message: string }
    | { type: 'ControlConfig', touchEnabled?: boolean, accelEnabled?: boolean, gyroEnabled?: boolean, orientationEnabled?: boolean, touchIntervalMs?: number, accelIntervalMs?: number, gyroIntervalMs?: number, orientationIntervalMs?: number, touchReliability?: number, controlReliability?: number, controlMode?: number, portalId?: string, returnAppId?: string }
    | { type: 'Invoke', method: string, returnMethod?: string, rawBytes?: Uint8Array, params?: unknown[] }
    | { type: 'Vibration', deviceId: string };

export const ActionKind = {
    Send: 0,
    UpdateRegistry: 1,
    ChunkSetComplete: 2,
    ChunkProgress: 3,
    Log: 4,
    RegistryEvent: 5,
    Invoke: 6,
    ControlConfig: 7,
};

export const RegistryEventKind = {
    OnRegister: "OnRegister",
    OnList: "OnList",
    OnHostConnected: "OnHostConnected",
    OnHostUpdate: "OnHostUpdate",
    OnHostDisconnected: "OnHostDisconnected",
    DeviceConnectRequested: "DeviceConnectRequested",
};

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
