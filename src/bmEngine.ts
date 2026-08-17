// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import init, { BmEngineWasm, EndpointMode, FramerWasm, init_panic_hook, parse_control_scheme_xml } from './wasm/bronze_monkey';
import type { BmOutgoing, BmProcessOutput, BmRegistryInfo, ControlMode } from './types';
import { configureLibLogging, createLogger } from './utils/logger';

const log = createLogger('BmEngine');

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
        log.info('Initializing WASM engine singleton...');
        try {
            await init();
            // Before anything else touches the engine, so its own startup
            // records land in the ring rather than being dropped.
            configureLibLogging();
            init_panic_hook();
            this.wasmEngine = new BmEngineWasm();
            this.initialized = true;
            log.info('WASM engine initialized successfully');
        } catch (err) {
            log.error('WASM engine initialization failed:', err);
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
            log.error("init_local_device WASM panic:", e);
            throw e;
        }
    }

    configureRoles(serverEnabled: boolean, endpointMode?: EndpointMode) {
        try {
            this.engine.configure_roles(serverEnabled, endpointMode);
        } catch (e) {
            log.error("configure_roles WASM panic:", e);
            throw e;
        }
    }

    /// Rejects messages longer than maxLen, or the library ceiling by default.
    createFramer(maxLen?: number): FramerWasm {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return new FramerWasm(maxLen);
    }

    registerDevice(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number) {
        try {
            this.engine.register_device(id, name, typeCode, address, unreliablePort, reliablePort);
        } catch (e) {
            log.error("register_device WASM panic:", e);
            throw e;
        }
    }

    processIncoming(data: Uint8Array): BmProcessOutput {
        return this.engine.process_incoming(data) as BmProcessOutput;
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
        return this.emit({ type: 'Register', target: targetId, info, domain, returnMethod: null });
    }

    makeRegistryList(targetId: string): BmOutgoing[] {
        return this.emit({ type: 'RequestHostList', target: targetId, returnMethod: null });
    }

    makeDeviceConnectRequested(targetId: string, game: BmRegistryInfo, controller: BmRegistryInfo): BmOutgoing[] {
        return this.emit({ type: 'ConnectToHost', target: targetId, host: game, selfInfo: controller });
    }

    makeSetControlMode(targetId: string, mode: ControlMode, text?: string): BmOutgoing[] {
        return this.emit({ type: 'SetControlMode', target: targetId, mode, text: text ?? null });
    }

    makeEnableAccelerometer(targetId: string, enabled: boolean, interval?: number): BmOutgoing[] {
        return this.emit({
            type: 'ConfigureSensor',
            target: targetId,
            sensor: 'Accel',
            enabled,
            intervalMs: interval ?? null,
        });
    }

    makeAccel(targetId: string, x: number, y: number, z: number): BmOutgoing[] {
        return this.emit({ type: 'SendAccel', target: targetId, x, y, z });
    }

    makeGyro(targetId: string, x: number, y: number, z: number): BmOutgoing[] {
        return this.emit({ type: 'SendGyro', target: targetId, x, y, z });
    }

    makeOrientation(targetId: string, x: number, y: number, z: number, w: number): BmOutgoing[] {
        return this.emit({ type: 'SendOrientation', target: targetId, x, y, z, w });
    }

    makeButtonInvoke(targetId: string, handler: string, pressed: boolean): BmOutgoing[] {
        return this.emit({ type: 'SendButton', target: targetId, handler, pressed });
    }

    makeDpadUpdate(targetId: string, x: number, y: number): BmOutgoing[] {
        return this.emit({ type: 'SendDPad', target: targetId, x, y });
    }

    // The requesting device id is the engine's own, so it is no longer passed in.
    makeRequestXml(targetId: string, width: number, height: number): BmOutgoing[] {
        return this.emit({ type: 'RequestControlScheme', target: targetId, width, height });
    }

    makeSetCapabilities(targetId: string, caps: number): BmOutgoing[] {
        return this.emit({
            type: 'SetCapabilities',
            target: targetId,
            gyroscope: (caps & 1) !== 0,
            orientation: (caps & 2) !== 0,
        });
    }

    makeOnControlSchemeParsed(targetId: string): BmOutgoing[] {
        return this.emit({ type: 'ControlSchemeParsed', target: targetId });
    }

    makeTouchSet(targetId: string, points: Array<{ id: number, x: number, y: number, screenWidth: number, screenHeight: number, state: number | string }>): BmOutgoing[] {
        return this.emit({ type: 'SendTouch', target: targetId, touches: points });
    }

    makeSimpleInvoke(targetId: string, method: string, returnVal?: string | null, param?: string | null): BmOutgoing[] {
        return this.emit({
            type: 'Invoke',
            target: targetId,
            method,
            returnMethod: returnVal ?? null,
            params: param == null ? [] : [{ String: param }],
        });
    }

    parseControlSchemeXml(xml: string): Uint8Array {
        return parse_control_scheme_xml(xml);
    }
}

export const bmEngine = new BmEngine();
