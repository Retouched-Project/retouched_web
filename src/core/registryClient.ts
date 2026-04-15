// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { WasmEngineBridge } from './engine/wasmEngineBridge';
import { DeviceInfo } from './deviceInfo';
import type { BmRegistryInfo, BmAction } from '../types';
import { RegistryEventKind } from '../types';

export class RegistryClient {
    private engine: WasmEngineBridge;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onStateUpdate: (partial: any) => void;
    private registerResolve: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(engine: WasmEngineBridge, onStateUpdate: (partial: any) => void) {
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
                        console.log('[RegistryClient] Received Port Assignment:', msg);
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

        console.log(`[RegistryClient] Initializing local device: ${deviceId} on ${host}:${port}`);

        try {
            this.engine.initLocalDevice(deviceId, deviceName, typeCode, host, 0, port);

            this.engine.registerDevice('server', 'Registry', 7, host, 0, 8088);

            const handshake = this.engine.getHandshakeBytes();
            this.onStateUpdate({ registryHandshake: handshake });

            await this.registerWithRegistry(deviceId, host, port, deviceName, typeCode);
        } catch (e) {
            console.error('[RegistryClient] Local device initialization failed:', e);
        }
    }

    private async registerWithRegistry(deviceId: string, host: string, port: number, deviceName: string, typeCode: number) {
        const registerPromise = new Promise<void>((resolve) => {
            this.registerResolve = resolve;
        });

        const appId = DeviceInfo.getAppId();
        const selfInfo: BmRegistryInfo = {
            slotId: 0,
            appId: appId,
            currentPlayers: 0,
            maxPlayers: 0,
            deviceType: typeCode,
            deviceId: deviceId,
            deviceName: deviceName,
            device: {
                id: deviceId,
                name: deviceName,
                device_type: typeCode,
                address: {
                    address: host,
                    reliable_port: port,
                    unreliable_port: 0
                }
            }
        };

        console.log('[RegistryClient] Sending registration request...');
        const actions = this.engine.makeRegistryRegister('server', selfInfo, 'retouchedweb');
        this.onStateUpdate({ selfInfo });

        this.onStateUpdate({ actionsToProcess: actions });

        await registerPromise;
        console.log('[RegistryClient] Registration confirmed');

        const listActions = this.engine.makeRegistryList('server');
        this.onStateUpdate({ actionsToProcess: listActions });
    }

    processRegistryEvent(action: BmAction & { type: 'RegistryEvent' }, currentGames: BmRegistryInfo[]): void {
        if (action.kind === RegistryEventKind.OnRegister || action.kind === RegistryEventKind.OnList) {
            if (this.registerResolve) {
                this.registerResolve();
                this.registerResolve = null;
            }
        }

        if (action.kind === RegistryEventKind.OnList || action.kind === RegistryEventKind.OnHostConnected || action.kind === RegistryEventKind.OnHostUpdate) {
            const games = action.infos;
            games.forEach(game => {
                this.engine.registerDevice(
                    game.device.id,
                    game.device.name,
                    game.device.device_type,
                    game.device.address.address,
                    game.device.address.unreliable_port,
                    game.device.address.reliable_port
                );
            });

            if (action.kind === RegistryEventKind.OnList) {
                this.onStateUpdate({ games });
            } else {
                const updatedGames = [...currentGames];
                games.forEach(game => {
                    const idx = updatedGames.findIndex(g => g.deviceId === game.deviceId);
                    if (idx >= 0) updatedGames[idx] = game;
                    else updatedGames.push(game);
                });
                this.onStateUpdate({ games: updatedGames });
            }
        }

        if (action.kind === RegistryEventKind.OnHostDisconnected) {
            const removeIds = new Set(action.infos.map(g => g.deviceId));
            const updatedGames = currentGames.filter(g => !removeIds.has(g.deviceId));
            this.onStateUpdate({ games: updatedGames, disconnectedIds: Array.from(removeIds) });
        }
    }

    handleInvoke(action: BmAction & { type: 'Invoke' }, currentGames: BmRegistryInfo[]): void {
        if (action.method === 'onHostConnected' || action.method === 'onHostUpdate') {
            const info = this.extractRegistryInfo(action.params);
            if (info) {
                this.engine.registerDevice(
                    info.device.id,
                    info.device.name,
                    info.device.device_type,
                    info.device.address.address,
                    info.device.address.unreliable_port,
                    info.device.address.reliable_port
                );
                const updatedGames = [...currentGames];
                const idx = updatedGames.findIndex(g => g.deviceId === info.deviceId);
                if (idx >= 0) updatedGames[idx] = info;
                else updatedGames.push(info);
                this.onStateUpdate({ games: updatedGames });
            }
        } else if (action.method === 'onHostDisconnected') {
            const info = this.extractRegistryInfo(action.params);
            const idToDelete = info ? info.deviceId : (action.params && typeof action.params[0] === 'string' ? action.params[0] : null);
            if (idToDelete) {
                const updatedGames = currentGames.filter(g => g.deviceId !== idToDelete);
                this.onStateUpdate({ games: updatedGames, disconnectedIds: [idToDelete] });
            }
        }
    }

    private extractRegistryInfo(params: unknown[] | undefined): BmRegistryInfo | null {
        if (!params || params.length === 0) return null;
        const wrapper = params[0] as Record<string, Record<string, unknown>> | null;
        return (wrapper?.Object?.BMRegistryInfo ?? wrapper?.BMRegistryInfo ?? null) as BmRegistryInfo | null;
    }
}
