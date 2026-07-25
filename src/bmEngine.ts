// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import init, { BmEngineWasm, init_panic_hook, make_handshake_bytes, parse_control_scheme_xml } from './wasm/bronze_monkey';
import type { BmOutgoing, BmProcessOutput, BmRegistryInfo, ControlMode } from './types';

export class BmEngine {
    private wasmEngine: BmEngineWasm | null = null;
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._doInit();
        return this.initPromise;
    }

    private async _doInit() {
        console.log('[BmEngine] Initializing WASM engine singleton...');
        try {
            await init();
            init_panic_hook();
            this.wasmEngine = new BmEngineWasm();
            this.initialized = true;
            console.log('[BmEngine] WASM engine initialized successfully');
        } catch (err) {
            console.error('[BmEngine] WASM engine initialization failed:', err);
            this.initPromise = null;
            throw err;
        }
    }

    private get engine(): BmEngineWasm {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine;
    }

    initLocalDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number) {
        try {
            this.engine.init_local_device(id, name, typeCode, address, unreliablePort, reliablePort);
        } catch (e) {
            console.error("[BmEngine] init_local_device WASM panic:", e);
            throw e;
        }
    }

    configureRoles(serverEnabled: boolean, endpointMode: number) {
        try {
            this.engine.configure_roles(serverEnabled, endpointMode);
        } catch (e) {
            console.error("[BmEngine] configure_roles WASM panic:", e);
            throw e;
        }
    }

    getHandshakeBytes(): Uint8Array {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return make_handshake_bytes();
    }

    registerDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number) {
        try {
            this.engine.register_device(id, name, typeCode, address, unreliablePort, reliablePort);
        } catch (e) {
            console.error("[BmEngine] register_device WASM panic:", e);
            throw e;
        }
    }

    processIncoming(data: Uint8Array): BmProcessOutput {
        return this.engine.process_incoming(data) as BmProcessOutput;
    }

    processIncomingUdp(data: Uint8Array): BmProcessOutput {
        return this.engine.process_incoming_udp(data) as BmProcessOutput;
    }

    emit(command: unknown): BmOutgoing[] {
        return this.engine.emit(command) as BmOutgoing[];
    }

    registerButtonHandlers(handlers: string[]) {
        this.engine.register_button_handlers(handlers);
    }

    clearButtonHandlers() {
        this.engine.clear_button_handlers();
    }

    makeRegistryRegister(targetId: string, info: BmRegistryInfo, domain: string): BmOutgoing[] {
        return this.engine.make_registry_register(
            targetId,
            info.slotId,
            info.appId,
            info.currentPlayers ?? 0,
            info.maxPlayers ?? 0,
            info.device.deviceId,
            info.device.deviceName,
            info.device.deviceType,
            info.deviceAddress.address,
            info.deviceAddress.unreliablePort,
            info.deviceAddress.reliablePort,
            domain
        ) as BmOutgoing[];
    }

    makeRegistryList(targetId: string): BmOutgoing[] {
        return this.engine.make_registry_list(targetId) as BmOutgoing[];
    }

    makeDeviceConnectRequested(targetId: string, game: BmRegistryInfo, controller: BmRegistryInfo): BmOutgoing[] {
        return this.engine.make_device_connect_requested(
            targetId,
            game.slotId, game.appId, game.device.deviceId, game.device.deviceName, game.device.deviceType, game.deviceAddress.address, game.deviceAddress.unreliablePort, game.deviceAddress.reliablePort,
            controller.slotId, controller.appId, controller.device.deviceId, controller.device.deviceName, controller.device.deviceType, controller.deviceAddress.address, controller.deviceAddress.unreliablePort, controller.deviceAddress.reliablePort
        ) as BmOutgoing[];
    }

    makeSetControlMode(targetId: string, mode: ControlMode, text?: string): BmOutgoing[] {
        return this.engine.make_set_control_mode(targetId, mode, text) as BmOutgoing[];
    }

    makeEnableAccelerometer(targetId: string, enabled: boolean, interval?: number): BmOutgoing[] {
        return this.engine.make_enable_accelerometer(targetId, enabled, interval) as BmOutgoing[];
    }

    makeAccel(targetId: string, x: number, y: number, z: number): BmOutgoing[] {
        return this.engine.make_accel(targetId, x, y, z) as BmOutgoing[];
    }

    makeGyro(targetId: string, x: number, y: number, z: number): BmOutgoing[] {
        return this.engine.make_gyro(targetId, x, y, z) as BmOutgoing[];
    }

    makeOrientation(targetId: string, x: number, y: number, z: number, w: number): BmOutgoing[] {
        return this.engine.make_orientation(targetId, x, y, z, w) as BmOutgoing[];
    }

    makeButtonInvoke(targetId: string, handler: string, pressed: boolean): BmOutgoing[] {
        return this.engine.make_button_invoke(targetId, handler, pressed) as BmOutgoing[];
    }

    makeDpadUpdate(targetId: string, x: number, y: number): BmOutgoing[] {
        return this.engine.make_dpad_update(targetId, x, y) as BmOutgoing[];
    }

    makeRequestXml(targetId: string, width: number, height: number, deviceId: string): BmOutgoing[] {
        return this.engine.make_request_xml(targetId, width, height, deviceId) as BmOutgoing[];
    }

    makeSetCapabilities(targetId: string, caps: number): BmOutgoing[] {
        return this.engine.make_set_capabilities(targetId, caps) as BmOutgoing[];
    }

    makeOnControlSchemeParsed(targetId: string, deviceId: string): BmOutgoing[] {
        return this.engine.make_on_control_scheme_parsed(targetId, deviceId) as BmOutgoing[];
    }

    makeTouchSet(targetId: string, points: Array<{ id: number, x: number, y: number, screenWidth: number, screenHeight: number, state: number | string }>): BmOutgoing[] {
        return this.engine.make_touch_set(targetId, points) as BmOutgoing[];
    }

    makeSimpleInvoke(targetId: string, method: string, returnVal?: string | null, param?: string | null): BmOutgoing[] {
        return this.engine.make_simple_invoke(targetId, method, returnVal, param) as BmOutgoing[];
    }

    parseControlSchemeXml(xml: string): Uint8Array {
        return parse_control_scheme_xml(xml);
    }
}

export const bmEngine = new BmEngine();
