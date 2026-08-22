// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEngine } from '../bmEngine';
import { DeviceInfo } from './deviceInfo';
import type { BmRegistryInfo } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('RegistryClient');

export class RegistryClient {
    private engine: BmEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onStateUpdate: (partial: any) => void;
    private registerResolve: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(engine: BmEngine, onStateUpdate: (partial: any) => void) {
        this.engine = engine;
        this.onStateUpdate = onStateUpdate;
    }

    handleIncomingData(data: Uint8Array): boolean {
        if (data.length > 0 && data[0] === 123) { // '{'
            try {
                const text = new TextDecoder().decode(data);
                if (text.includes('"port_assignment"')) {
                    const msg = JSON.parse(text);
                    if (msg.type === 'port_assignment') {
                        log.info('Received Port Assignment:', msg);
                        this.handlePortAssignment(msg.port, msg.host);
                        return true;
                    }
                }
            } catch { /* not a registry message */ }
        }
        return false;
    }
    private async handlePortAssignment(port: number, host: string) {
        this.onStateUpdate({ port });

        const deviceId = DeviceInfo.getDeviceId();
        const deviceName = DeviceInfo.getDeviceName();
        const typeCode = DeviceInfo.getDeviceTypeCode();

        log.info(`Initializing local device: ${deviceId} on ${host}:${port}`);

        try {
            this.engine.initLocalDevice(deviceId, deviceName, typeCode, host, 0, port);

            this.engine.declarePeer('server', 'Registry', 7, host, 0, 8088);

            // The registry speaks first, so there is nothing to send here.
            await this.registerWithRegistry(deviceId, host, port, deviceName, typeCode);
        } catch (e) {
            log.error('Local device initialization failed:', e);
        }
    }

    private async registerWithRegistry(deviceId: string, host: string, port: number, deviceName: string, typeCode: number) {
        const registerPromise = new Promise<void>((resolve) => {
            this.registerResolve = resolve;
        });

        const appId = DeviceInfo.getAppId();
        const selfAddress = { address: host, unreliablePort: 0, reliablePort: port };
        const selfInfo: BmRegistryInfo = {
            slotId: 0,
            appId: appId,
            currentPlayers: 0,
            maxPlayers: 0,
            device: {
                deviceId: deviceId,
                deviceName: deviceName,
                deviceType: typeCode,
                address: selfAddress,
            },
            deviceAddress: selfAddress,
        };

        log.info('Sending registration request...');
        const actions = this.engine.makeRegistryRegister('server', selfInfo, 'retouchedweb');
        this.onStateUpdate({ selfInfo });

        this.onStateUpdate({ actionsToProcess: actions });

        await registerPromise;
        log.info('Registration confirmed');

        const listActions = this.engine.makeRegistryList('server');
        this.onStateUpdate({ actionsToProcess: listActions });
    }

    // The controller's own registration (server replies onRegister) resolves the
    // pending registerWithRegistry promise so the host-list request can proceed.
    onRegistrationResult(): void {
        if (this.registerResolve) {
            this.registerResolve();
            this.registerResolve = null;
        }
    }

    // Full host-list snapshot (the server's onList reply to registry.list).
    onHostsReceived(infos: BmRegistryInfo[]): void {
        this.onStateUpdate({ games: infos });
        this.onRegistrationResult();
    }

    // A single host appeared or had its info updated.
    onHostUpsert(info: BmRegistryInfo, currentGames: BmRegistryInfo[]): void {
        const updatedGames = [...currentGames];
        const idx = updatedGames.findIndex(g => g.device.deviceId === info.device.deviceId);
        if (idx >= 0) updatedGames[idx] = info;
        else updatedGames.push(info);
        this.onStateUpdate({ games: updatedGames });
    }

    onHostDisconnected(info: BmRegistryInfo, currentGames: BmRegistryInfo[]): void {
        const removeId = info.device.deviceId;
        const updatedGames = currentGames.filter(g => g.device.deviceId !== removeId);
        this.onStateUpdate({ games: updatedGames, disconnectedIds: [removeId] });
    }
}
