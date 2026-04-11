// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { bmEngine } from '../../bmEngine';
import type { BmAction, BmRegistryInfo } from '../../types';

export class WasmEngineBridge {
    private static instance: WasmEngineBridge;
    private initPromise: Promise<void> | null = null;

    private constructor() { }

    public static getInstance(): WasmEngineBridge {
        if (!WasmEngineBridge.instance) {
            WasmEngineBridge.instance = new WasmEngineBridge();
        }
        return WasmEngineBridge.instance;
    }

    async init(): Promise<void> {
        if (this.initPromise) return this.initPromise;

        console.log('[WasmEngineBridge] Initializing WASM engine singleton...');
        this.initPromise = bmEngine.init();

        try {
            await this.initPromise;
            console.log('[WasmEngineBridge] WASM engine initialized successfully');
        } catch (err) {
            console.error('[WasmEngineBridge] WASM engine initialization failed:', err);
            this.initPromise = null;
            throw err;
        }
        return this.initPromise;
    }

    initLocalDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number): void {
        bmEngine.initLocalDevice(id, name, typeCode, address, unreliablePort, reliablePort);
    }

    getHandshakeBytes(): Uint8Array {
        return bmEngine.getHandshakeBytes();
    }

    registerDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number): void {
        bmEngine.registerDevice(id, name, typeCode, address, unreliablePort, reliablePort);
    }

    processIncoming(data: Uint8Array): BmAction[] {
        return bmEngine.processIncoming(data);
    }

    processIncomingUdp(data: Uint8Array): BmAction[] {
        return bmEngine.processIncomingUdp(data);
    }

    makeRegistryRegister(targetId: string, info: BmRegistryInfo, domain: string): BmAction[] {
        return bmEngine.makeRegistryRegister(targetId, info, domain);
    }

    makeRegistryList(targetId: string): BmAction[] {
        return bmEngine.makeRegistryList(targetId);
    }

    makeDeviceConnectRequested(targetId: string, game: BmRegistryInfo, controller: BmRegistryInfo): BmAction[] {
        return bmEngine.makeDeviceConnectRequested(targetId, game, controller);
    }

    makeSetControlMode(targetId: string, mode: number, text?: string): BmAction[] {
        return bmEngine.makeSetControlMode(targetId, mode, text);
    }

    makeEnableAccelerometer(targetId: string, enabled: boolean, interval?: number): BmAction[] {
        return bmEngine.makeEnableAccelerometer(targetId, enabled, interval);
    }

    makeAccel(targetId: string, x: number, y: number, z: number, reliability: number): BmAction[] {
        return bmEngine.makeAccel(targetId, x, y, z, reliability);
    }

    makeGyro(targetId: string, x: number, y: number, z: number, reliability: number): BmAction[] {
        return bmEngine.makeGyro(targetId, x, y, z, reliability);
    }

    makeOrientation(targetId: string, x: number, y: number, z: number, w: number, reliability: number): BmAction[] {
        return bmEngine.makeOrientation(targetId, x, y, z, w, reliability);
    }

    makeButtonInvoke(targetId: string, handler: string, pressed: boolean): BmAction[] {
        return bmEngine.makeButtonInvoke(targetId, handler, pressed);
    }

    makeDpadUpdate(targetId: string, x: number, y: number): BmAction[] {
        return bmEngine.makeDpadUpdate(targetId, x, y);
    }

    makeRequestXml(targetId: string, width: number, height: number, deviceId: string): BmAction[] {
        return bmEngine.makeRequestXml(targetId, width, height, deviceId);
    }

    makeSetCapabilities(targetId: string, caps: number): BmAction[] {
        return bmEngine.makeSetCapabilities(targetId, caps);
    }

    makeOnControlSchemeParsed(targetId: string, deviceId: string): BmAction[] {
        return bmEngine.makeOnControlSchemeParsed(targetId, deviceId);
    }

    makeTouchSet(targetId: string, points: Array<{ id: number; x: number; y: number; screen_width: number; screen_height: number; state: string }>, reliability: number): BmAction[] {
        return bmEngine.makeTouchSet(targetId, points, reliability);
    }

    makeSimpleInvoke(targetId: string, method: string, returnVal?: string | null, param?: string | null): BmAction[] {
        return bmEngine.makeSimpleInvoke(targetId, method, returnVal, param);
    }

    parseControlSchemeXml(xml: string): Uint8Array {
        return bmEngine.parseControlSchemeXml(xml);
    }
}
