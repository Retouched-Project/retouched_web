// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import init, { BmEngineWasm, EndpointMode, FramerWasm, init_panic_hook, parse_control_scheme_xml } from './wasm/bronze_monkey';
import type { BmArrival, BmOutgoing, BmProcessOutput, BmRegistryInfo, ControlMode } from './types';
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

    /// Everything the engine is told about itself. Pass the whole of it whenever
    /// any of it changes; the engine holds nothing over from a previous call.
    ///
    /// A controller that opens its own sessions needs a screen, since it asks a
    /// game for a scheme to fit it.
    configure(config: {
        server?: boolean;
        endpoint?: EndpointMode;
        opensSessions?: boolean;
        gyroscope?: boolean;
        orientation?: boolean;
        screenWidth?: number;
        screenHeight?: number;
        approvesRegistrations?: boolean;
        datagrams?: boolean;
    }) {
        this.engine.configure({
            server: config.server ?? false,
            endpoint: config.endpoint,
            opensSessions: config.opensSessions ?? true,
            gyroscope: config.gyroscope ?? false,
            orientation: config.orientation ?? false,
            screenWidth: config.screenWidth ?? 0,
            screenHeight: config.screenHeight ?? 0,
            approvesRegistrations: config.approvesRegistrations ?? true,
            datagrams: config.datagrams ?? false,
        });
    }

    /// Rejects messages longer than maxLen, or the library ceiling by default.
    createFramer(maxLen?: number): FramerWasm {
        if (!this.wasmEngine) throw new Error("Engine not initialized");
        return new FramerWasm(maxLen);
    }

    /// Tells the engine about a peer it could not have learned about on its
    /// own, at an address known out of band.
    declarePeer(id: string, name: string, typeCode: number, address: string, unreliablePort: number, reliablePort: number) {
        try {
            this.engine.declare_peer(id, name, typeCode, address, unreliablePort, reliablePort);
        } catch (e) {
            log.error("declare_peer WASM panic:", e);
            throw e;
        }
    }

    /// `arrival` is what the transport knows about where the bytes came from.
    /// A relayed transport knows nothing and passes nothing.
    processIncoming(data: Uint8Array, arrival?: BmArrival): BmProcessOutput {
        return this.engine.process_incoming(data, arrival) as BmProcessOutput;
    }

    /// Tells the engine what time it is, in whole milliseconds on any
    /// monotonic clock. Anything due fires, and the output names the next
    /// wanted moment.
    handleTime(nowMs: number): BmProcessOutput {
        return this.engine.handle_time(nowMs) as BmProcessOutput;
    }

    /// Throws when the command itself was wrong. A send to a peer that has
    /// since left is not an error and comes back with nothing to send.
    emit(command: unknown): BmProcessOutput {
        return this.engine.emit(command) as BmProcessOutput;
    }

    registerButtonHandlers(handlers: string[]) {
        this.engine.register_button_handlers(handlers);
    }

    clearButtonHandlers() {
        this.engine.clear_button_handlers();
    }

    makeRegistryRegister(targetId: string, info: BmRegistryInfo, domain: string): BmOutgoing[] {
        return this.emit({ type: 'Register', target: targetId, info, domain, returnMethod: null }).outgoings;
    }

    /// Releases what the engine held for a peer that is gone. Its outgoings are
    /// notices owed to anyone still watching, so they still have to be written.
    peerGone(deviceId: string): BmOutgoing[] {
        return this.emit({ type: 'PeerGone', deviceId }).outgoings;
    }

    makeRegistryList(targetId: string): BmOutgoing[] {
        return this.emit({ type: 'RequestHostList', target: targetId, returnMethod: null }).outgoings;
    }

    makeDeviceConnectRequested(targetId: string, gameDeviceId: string): BmOutgoing[] {
        return this.emit({ type: 'ConnectToHost', target: targetId, hostId: gameDeviceId }).outgoings;
    }

    makeSetControlMode(targetId: string, mode: ControlMode, text?: string): BmOutgoing[] {
        return this.emit({ type: 'SetControlMode', target: targetId, mode, text: text ?? null }).outgoings;
    }

    makeEnableAccelerometer(targetId: string, enabled: boolean, interval?: number): BmOutgoing[] {
        return this.emit({
            type: 'ConfigureSensor',
            target: targetId,
            sensor: 'Accel',
            enabled,
            intervalMs: interval ?? null,
        }).outgoings;
    }

    makeAccel(targetId: string, x: number, y: number, z: number): BmOutgoing[] {
        return this.emit({ type: 'SendAccel', target: targetId, x, y, z }).outgoings;
    }

    makeGyro(targetId: string, x: number, y: number, z: number): BmOutgoing[] {
        return this.emit({ type: 'SendGyro', target: targetId, x, y, z }).outgoings;
    }

    makeOrientation(targetId: string, x: number, y: number, z: number, w: number): BmOutgoing[] {
        return this.emit({ type: 'SendOrientation', target: targetId, x, y, z, w }).outgoings;
    }

    makeButtonInvoke(targetId: string, handler: string, pressed: boolean): BmOutgoing[] {
        return this.emit({ type: 'SendButton', target: targetId, handler, pressed }).outgoings;
    }

    makeDpadUpdate(targetId: string, x: number, y: number): BmOutgoing[] {
        return this.emit({ type: 'SendDPad', target: targetId, x, y }).outgoings;
    }

    // The requesting device id is the engine's own, so it is no longer passed in.
    makeRequestXml(targetId: string, width: number, height: number): BmOutgoing[] {
        return this.emit({ type: 'RequestControlScheme', target: targetId, width, height }).outgoings;
    }

    makeSetCapabilities(targetId: string, caps: number): BmOutgoing[] {
        return this.emit({
            type: 'SetCapabilities',
            target: targetId,
            gyroscope: (caps & 1) !== 0,
            orientation: (caps & 2) !== 0,
        }).outgoings;
    }

    makeOnControlSchemeParsed(targetId: string): BmOutgoing[] {
        return this.emit({ type: 'ControlSchemeParsed', target: targetId }).outgoings;
    }

    makeTouchSet(targetId: string, points: Array<{ id: number, x: number, y: number, screenWidth: number, screenHeight: number, state: number | string }>): BmOutgoing[] {
        return this.emit({ type: 'SendTouch', target: targetId, touches: points }).outgoings;
    }

    makeSimpleInvoke(targetId: string, method: string, returnVal?: string | null, param?: string | null): BmOutgoing[] {
        return this.emit({
            type: 'Invoke',
            target: targetId,
            method,
            returnMethod: returnVal ?? null,
            params: param == null ? [] : [{ String: param }],
        }).outgoings;
    }

    parseControlSchemeXml(xml: string): Uint8Array {
        return parse_control_scheme_xml(xml);
    }
}

export const bmEngine = new BmEngine();
