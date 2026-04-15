// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmAction, BmRegistryInfo } from './types';
import { ControlScheme } from './bmrender/proto/scheme';
import { isAccelerometerEnabled } from './bmrender/proto/schemeExtensions';
import { assetManager } from './bmrender/assetManager';
import { WasmEngineBridge } from './core/engine/wasmEngineBridge';
import { WebRtcTransport } from './core/webRtcTransport';
import { DeviceInfo } from './core/deviceInfo';
import { VibrationService } from './utils/vibrationService';
import { RegistryClient } from './core/registryClient';
import { GameSession } from './core/gameSession';
import { TouchProcessor } from './core/touchProcessor';
import { SensorProcessor, type SensorStatus } from './core/sensorProcessor';
import { ProtocolCoordinator } from './core/engine/protocolCoordinator';
import { SchemeService } from './core/engine/schemeService';

export interface GameClientState {
    connected: boolean;
    games: BmRegistryInfo[];
    activeGame: BmRegistryInfo | null;
    progress: number;
    scheme: ControlScheme | null;
    port: number;
    sensorStatus?: SensorStatus;
}

export type StateCallback = (state: GameClientState) => void;

export class GameClient {
    private static readonly POLICY_RESPONSE = new TextEncoder().encode(
        '<?xml version="1.0"?><cross-domain-policy><allow-access-from domain="*" to-ports="1008-49151" /></cross-domain-policy>\0'
    );

    private transport: WebRtcTransport;
    private engine: WasmEngineBridge;
    private identity: DeviceInfo;

    private registry: RegistryClient;
    private session: GameSession;
    private touch: TouchProcessor;
    private sensors: SensorProcessor;
    private protocol: ProtocolCoordinator;
    private schemes: SchemeService;

    private state: GameClientState = {
        connected: false,
        games: [],
        activeGame: null,
        progress: 0,
        scheme: null,
        port: 0,
    };
    private listeners: StateCallback[] = [];
    private selfInfo: BmRegistryInfo | null = null;
    private closed = false;

    private capabilitiesOverride: number | null = null;
    private cachedCapabilities: number | null = null;

    constructor(signalingUrl: string = '/offer') {
        this.transport = new WebRtcTransport(signalingUrl);
        this.engine = WasmEngineBridge.getInstance();
        this.identity = new DeviceInfo();

        this.registry = new RegistryClient(this.engine, (p) => this.handleDelegateUpdate(p));
        this.session = new GameSession(this.engine, this.identity, (p) => this.handleDelegateUpdate(p));
        this.protocol = new ProtocolCoordinator(this.engine, this.transport, {
            onRegistryEvent: (a) => this.registry.processRegistryEvent(a, this.state.games),
            onInvoke: (a) => this.handleInvoke(a),
            onControlConfig: (a) => this.handleControlConfig(a),
            onChunkProgress: (curr, tot) => this.updateState({ progress: tot > 0 ? curr / tot : 0 }),
            onChunkComplete: (a) => this.handleChunkComplete(a),
            onLog: (msg) => console.log(`[BM] ${msg}`)
        });
        this.schemes = new SchemeService(this.engine);
        this.touch = new TouchProcessor(this.engine, (a) => this.protocol.processActions(a, this.state.activeGame));
        this.sensors = new SensorProcessor(this.engine, (a) => this.protocol.processActions(a, this.state.activeGame));
        this.sensors.onStatusChange = (status) => this.updateState({ sensorStatus: status });

        this.setupTransportListeners();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handleDelegateUpdate(partial: any) {
        if (partial.actionsToProcess) {
            this.protocol.processActions(partial.actionsToProcess, this.state.activeGame);
            delete partial.actionsToProcess;
        }
        if (partial.selfInfo) {
            this.selfInfo = partial.selfInfo;
            delete partial.selfInfo;
        }
        if (partial.registryHandshake) {
            this.transport.send('registry', partial.registryHandshake);
            delete partial.registryHandshake;
        }
        if (partial.disconnectedIds) {
            const activeGame = this.session.getActiveGame();
            if (activeGame && partial.disconnectedIds.includes(activeGame.deviceId)) {
                this.disconnectGame();
            }
            delete partial.disconnectedIds;
        }

        this.updateState(partial);
    }

    addListener(callback: StateCallback) {
        this.listeners.push(callback);
        callback(this.state);
    }

    removeListener(callback: StateCallback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    private updateState(partial: Partial<GameClientState>) {
        this.state = { ...this.state, ...partial };
        this.listeners.forEach(l => l(this.state));
    }

    private setupTransportListeners() {
        this.transport.onMessage = (label, data) => this.handleTransportMessage(label, data);
        this.transport.onOpen = (label) => {
            console.log(`[GameClient] ${label} channel open`);
            if (label === 'registry') {
                this.updateState({ connected: true });
            }
        };
        this.transport.onError = (err) => {
            console.error('[GameClient] Transport error:', err);
        };
    }

    private registryHandshakeReceived = false;
    private gameHandshakeReceived = false;

    private handleTransportMessage(label: string, data: Uint8Array) {
        if (label === 'registry') {
            if (this.registry.handleIncomingData(data)) return;
        }
        if (label === 'game') {
            if (this.handlePolicyRequest(data)) return;
            if (this.handleGameJson(data)) return;
        }
        if (label === 'game-unreliable') {
            if (this.handleGameJson(data)) return;
        }

        const frames = this.protocol.handleIncomingData(label, data);
        for (const frame of frames) {
            if (frame.length === 12) {
                console.log(`[GameClient] Received ${label} handshake`);
                if (label === 'game' && !this.gameHandshakeReceived) {
                    this.gameHandshakeReceived = true;
                    const handshake = this.engine.getHandshakeBytes();
                    this.transport.send('game', handshake);
                    this.session.sendGameInitSequence(
                        () => this.getCapabilities(),
                        (actions) => this.protocol.processActions(actions, this.state.activeGame)
                    );
                } else if (label === 'registry' && !this.registryHandshakeReceived) {
                    this.registryHandshakeReceived = true;
                }
            }

            this.protocol.processFrame(frame, this.state.activeGame);
        }
    }

    private handlePolicyRequest(data: Uint8Array): boolean {
        if (data.length === 23 && new TextDecoder().decode(data).startsWith('<policy-file-request/>')) {
            this.transport.send('game', GameClient.POLICY_RESPONSE);
            return true;
        }
        return false;
    }

    private handleGameJson(data: Uint8Array): boolean {
        if (data.length > 0 && data[0] === 0x7B) {
            try {
                const text = new TextDecoder().decode(data);
                const msg = JSON.parse(text);
                if (msg.type === 'game_closed') {
                    console.log('[GameClient] Game closed by server (TCP connection dropped)');
                    this.disconnectGame();
                    return true;
                }
            } catch { /* not a game message */ }
        }
        return false;
    }

    async connect() {
        if (this.transport.getConnectionStatus() === 'connected' || this.transport.getConnectionStatus() === 'connecting') {
            return;
        }

        await this.engine.init();
        if (this.closed) return;

        this.protocol.resetFramer('registry');
        this.protocol.resetFramer('game');
        await this.transport.connect();
    }

    private handleInvoke(action: BmAction & { type: 'Invoke' }) {
        if (action.method === 'onHostConnected' || action.method === 'onHostUpdate' || action.method === 'onHostDisconnected') {
            this.registry.handleInvoke(action, this.state.games);
        } else if (action.method === 'vibrate') {
            VibrationService.vibrate();
        }
    }

    async joinGame(game: BmRegistryInfo) {
        this.protocol.resetFramer('game');
        this.gameHandshakeReceived = false;
        this.session.joinGame(game, this.selfInfo);
        if (game.device.address.unreliable_port !== 0) {
            const msg = JSON.stringify({ type: 'set_game_udp_port', port: game.device.address.unreliable_port });
            this.transport.send('game', new TextEncoder().encode(msg));
        }
    }

    async setCapabilitiesOverride(mask: number | null) {
        this.capabilitiesOverride = mask;
        this.cachedCapabilities = null;
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const caps = await this.getCapabilities();
            this.protocol.processActions(this.engine.makeSetCapabilities(activeGame.deviceId, caps), activeGame);
        }
    }

    private async getCapabilities(): Promise<number> {
        if (this.capabilitiesOverride != null) return this.capabilitiesOverride;
        if (this.cachedCapabilities != null) return this.cachedCapabilities;
        let caps = 0;
        const probe = (SensorCtor: new (opts: SensorOptions) => Sensor): Promise<boolean> => {
            return new Promise(resolve => {
                try {
                    const sensor = new SensorCtor({ frequency: 1 });
                    const timeout = setTimeout(() => { sensor.stop(); resolve(false); }, 300);
                    sensor.addEventListener('reading', () => { clearTimeout(timeout); sensor.stop(); resolve(true); });
                    sensor.addEventListener('error', () => { clearTimeout(timeout); sensor.stop(); resolve(false); });
                    sensor.start();
                } catch { resolve(false); }
            });
        };
        const [hasGyro, hasMag] = await Promise.all([
            typeof Gyroscope !== 'undefined' ? probe(Gyroscope) : Promise.resolve(false),
            typeof Magnetometer !== 'undefined' ? probe(Magnetometer) : Promise.resolve(false),
        ]);
        if (hasGyro || typeof DeviceMotionEvent !== 'undefined') caps |= 1;
        if (hasMag) caps |= 2;
        this.cachedCapabilities = caps;
        return caps;
    }

    sendButton(handler: string, pressed: boolean) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.protocol.processActions(this.engine.makeButtonInvoke(activeGame.deviceId, handler, pressed), activeGame);
        }
    }

    sendDpad(x: number, y: number) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.protocol.processActions(this.engine.makeDpadUpdate(activeGame.deviceId, x, y), activeGame);
        }
    }

    sendPause() { this.session.setPaused(true, (actions) => this.protocol.processActions(actions, this.state.activeGame)); }
    sendResume() { this.session.setPaused(false, (actions) => this.protocol.processActions(actions, this.state.activeGame)); }

    sendMenuEvent(event: string) {
        this.session.sendMenuEvent(event, (actions) => this.protocol.processActions(actions, this.state.activeGame));
    }

    handleTouchSet(touches: Array<{ id: number, x: number, y: number, state: number }>, screenWidth: number, screenHeight: number) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.touch.handleTouchSet(touches, screenWidth, screenHeight, activeGame.deviceId);
        }
    }

    disconnectGame() {
        const activeGame = this.session.getActiveGame();
        this.session.disconnectGame(
            (actions) => this.protocol.processActions(actions, activeGame),
            (payload) => this.transport.send('game', payload)
        );
        assetManager.dispose();
        this.touch.reset();
        this.sensors.reset();
        this.schemes.reset();
        this.updateState({ activeGame: null, scheme: null, progress: 0 });
    }

    close() {
        this.closed = true;
        this.disconnectGame();
        this.transport.close();
        this.registryHandshakeReceived = false;
        this.gameHandshakeReceived = false;
        this.updateState({ connected: false, activeGame: null, scheme: null, progress: 0, games: [] });
    }

    private handleControlConfig(cfg: BmAction & { type: 'ControlConfig' }) {
        const activeGame = this.session.getActiveGame();
        if (!activeGame) return;

        this.touch.configure({
            touchReliability: cfg.touchReliability,
            touchEnabled: cfg.touchEnabled,
            touchIntervalMs: cfg.touchIntervalMs
        });

        this.sensors.configure({
            controlReliability: cfg.controlReliability,
            accelIntervalMs: cfg.accelIntervalMs,
            gyroIntervalMs: cfg.gyroIntervalMs,
            orientationEnabled: cfg.orientationEnabled,
            orientationIntervalMs: cfg.orientationIntervalMs
        }, activeGame.deviceId);

        if (cfg.touchEnabled != null && this.state.scheme) {
            this.updateState({ scheme: ControlScheme.create({ ...this.state.scheme, touchEnabled: cfg.touchEnabled }) });
        }

        if (cfg.accelEnabled != null) {
            if (cfg.accelEnabled) {
                this.sensors.startAccel(activeGame.deviceId);
            } else {
                this.sensors.stopAccel();
            }
        }
        if (cfg.gyroEnabled != null) {
            if (cfg.gyroEnabled) {
                this.sensors.startGyro(activeGame.deviceId);
            } else {
                this.sensors.stopGyro();
            }
        }
        if (cfg.accelEnabled || cfg.gyroEnabled) {
            this.sensors.checkSensorsAfterDelay();
        }
    }

    private handleChunkComplete(action: BmAction & { type: 'ChunkComplete' }) {
        const { scheme, isUpdate } = this.schemes.parseChunk(action);
        if (!scheme) return;

        if (!isUpdate) { // setId === 'testXML'
            this.updateState({ scheme, progress: 1.0 });
            const activeGame = this.session.getActiveGame();
            if (isAccelerometerEnabled(scheme) && activeGame) {
                this.sensors.startAccel(activeGame.deviceId);
            }
            this.onSchemeParsed();
        } else { // setId === 'updateXML'
            this.updateState({ scheme });
        }
    }

    private onSchemeParsed() {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const actions = this.engine.makeOnControlSchemeParsed(activeGame.deviceId, this.identity.getDeviceId());
            this.protocol.processActions(actions, activeGame);
        }
    }

}

export const gameClient = new GameClient();
