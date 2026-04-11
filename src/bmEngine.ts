// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import init, { BmEngineWasm, init_panic_hook, make_handshake_bytes, parse_control_scheme_xml } from './wasm/bronze_monkey';
import type { BmAction, BmRegistryInfo } from './types';

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
        await init();
        init_panic_hook();
        this.wasmEngine = new BmEngineWasm();
        this.initialized = true;
    }

    initLocalDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number) {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        try {
            this.wasmEngine.init_local_device(id, name, typeCode, address, unreliablePort, reliablePort);
        } catch (e) {
            console.error("[BmEngine] init_local_device WASM panic:", e);
            throw e;
        }
    }

    getHandshakeBytes(): Uint8Array {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return make_handshake_bytes();
    }

    registerDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number) {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        try {
            this.wasmEngine.register_device(id, name, typeCode, address, unreliablePort, reliablePort);
        } catch (e) {
            console.error("[BmEngine] register_device WASM panic:", e);
            throw e;
        }
    }

    processIncoming(data: Uint8Array): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.process_incoming(data) as BmAction[];
    }

    processIncomingUdp(data: Uint8Array): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.process_incoming_udp(data) as BmAction[];
    }

    makeRegistryRegister(targetId: string, info: BmRegistryInfo, domain: string): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_registry_register(
            targetId,
            info.slotId,
            info.appId,
            info.currentPlayers,
            info.maxPlayers,
            info.device.id,
            info.device.name,
            info.device.device_type,
            info.device.address.address,
            info.device.address.unreliable_port,
            info.device.address.reliable_port,
            domain
        ) as BmAction[];
    }

    makeRegistryList(targetId: string): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_registry_list(targetId) as BmAction[];
    }

    makeDeviceConnectRequested(targetId: string, game: BmRegistryInfo, controller: BmRegistryInfo): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_device_connect_requested(
            targetId,
            game.slotId, game.appId, game.device.id, game.device.name, game.device.device_type, game.device.address.address, game.device.address.unreliable_port, game.device.address.reliable_port,
            controller.slotId, controller.appId, controller.device.id, controller.device.name, controller.device.device_type, controller.device.address.address, controller.device.address.unreliable_port, controller.device.address.reliable_port
        ) as BmAction[];
    }

    makeSetControlMode(targetId: string, mode: number, text?: string): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_set_control_mode(targetId, mode, text) as BmAction[];
    }

    makeEnableAccelerometer(targetId: string, enabled: boolean, interval?: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_enable_accelerometer(targetId, enabled, interval) as BmAction[];
    }

    makeAccel(targetId: string, x: number, y: number, z: number, reliability: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_accel(targetId, x, y, z, reliability) as BmAction[];
    }

    makeGyro(targetId: string, x: number, y: number, z: number, reliability: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_gyro(targetId, x, y, z, reliability) as BmAction[];
    }

    makeOrientation(targetId: string, x: number, y: number, z: number, w: number, reliability: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_orientation(targetId, x, y, z, w, reliability) as BmAction[];
    }

    makeButtonInvoke(targetId: string, handler: string, pressed: boolean): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_button_invoke(targetId, handler, pressed) as BmAction[];
    }

    makeDpadUpdate(targetId: string, x: number, y: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_dpad_update(targetId, x, y) as BmAction[];
    }

    makeRequestXml(targetId: string, width: number, height: number, deviceId: string): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_request_xml(targetId, width, height, deviceId) as BmAction[];
    }

    makeSetCapabilities(targetId: string, caps: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_set_capabilities(targetId, caps) as BmAction[];
    }

    makeOnControlSchemeParsed(targetId: string, deviceId: string): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_on_control_scheme_parsed(targetId, deviceId) as BmAction[];
    }

    makeTouchSet(targetId: string, points: Array<{ id: number, x: number, y: number, screen_width: number, screen_height: number, state: number | string }>, reliability: number): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_touch_set(targetId, points, reliability) as BmAction[];
    }

    makeSimpleInvoke(targetId: string, method: string, returnVal?: string | null, param?: string | null): BmAction[] {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return this.wasmEngine.make_simple_invoke(targetId, method, returnVal, param) as BmAction[];
    }

    parseControlSchemeXml(xml: string): Uint8Array {
        return parse_control_scheme_xml(xml);
    }
}

export const bmEngine = new BmEngine();
