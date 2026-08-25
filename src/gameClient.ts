// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEvent, BmControlConfig, BmRegistryInfo, ControlMode } from './types';
import { ControlScheme } from './bmrender/proto/scheme';
import { isAccelerometerEnabled } from './bmrender/proto/schemeExtensions';
import { assetManager } from './bmrender/assetManager';
import { bmEngine, type BmEngine } from './bmEngine';
import { WebRtcTransport } from './core/webRtcTransport';
import { DeviceInfo } from './core/deviceInfo';
import { VibrationService } from './utils/vibrationService';
import { RegistryClient } from './core/registryClient';
import { GameSession } from './core/gameSession';
import { TouchProcessor } from './core/touchProcessor';
import { SensorProcessor, type SensorStatus } from './core/sensorProcessor';
import { ProtocolCoordinator } from './core/engine/protocolCoordinator';
import { SchemeService } from './core/engine/schemeService';
import { EndpointMode } from './wasm/bronze_monkey';
import { createLogger } from './utils/logger';

const log = createLogger('GameClient');

export interface GameClientState {
    connected: boolean;
    games: BmRegistryInfo[];
    activeGame: BmRegistryInfo | null;
    progress: number;
    scheme: ControlScheme | null;
    port: number;
    sensorStatus?: SensorStatus;
    controlMode?: ControlMode | null;
    startString?: string | null;
}

export type StateCallback = (state: GameClientState) => void;

export class GameClient {
    private transport: WebRtcTransport;
    private engine: BmEngine;
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
    private closed = false;

    private capabilitiesOverride: number | null = null;
    private cachedCapabilities: number | null = null;
    private touchEnabled: boolean | null = null;

    constructor(signalingUrl: string = '/offer') {
        this.transport = new WebRtcTransport(signalingUrl);
        this.engine = bmEngine;
        this.identity = new DeviceInfo();

        this.registry = new RegistryClient(this.engine, (p) => this.handleDelegateUpdate(p));
        this.session = new GameSession(this.engine, this.identity, (p) => this.handleDelegateUpdate(p));
        this.protocol = new ProtocolCoordinator(this.engine, this.transport, {
            onEvent: (ev) => this.handleEvent(ev),
        });
        this.schemes = new SchemeService();
        this.touch = new TouchProcessor(this.engine, (a) => this.protocol.sendOutgoings(a));
        this.sensors = new SensorProcessor(this.engine, (a) => this.protocol.sendOutgoings(a));
        this.sensors.onStatusChange = (status) => this.updateState({ sensorStatus: status });

        this.setupTransportListeners();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handleDelegateUpdate(partial: any) {
        if (partial.actionsToProcess) {
            this.protocol.sendOutgoings(partial.actionsToProcess);
            delete partial.actionsToProcess;
        }
        if (partial.selfInfo) {
            // The engine keeps what it registered, so nothing here needs it.
            delete partial.selfInfo;
        }
        if (partial.disconnectedIds) {
            const activeGame = this.session.getActiveGame();
            if (activeGame && partial.disconnectedIds.includes(activeGame.device.deviceId)) {
                this.disconnectGame();
            }
            delete partial.disconnectedIds;
        }

        this.updateState(partial);
    }

    get activeAppId(): string | null {
        return this.session.getActiveGame()?.appId ?? null;
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
            log.info(`${label} channel open`);
            if (label === 'registry') {
                this.updateState({ connected: true });
            }
        };
        this.transport.onError = (err) => {
            log.error('Transport error:', err);
        };
    }

    private registryHandshakeReceived = false;

    private handleTransportMessage(label: string, data: Uint8Array) {
        if (label === 'registry') {
            if (this.registry.handleIncomingData(data)) return;
        }
        if (label === 'game' || label === 'game-unreliable') {
            if (this.handleGameJson(data)) return;
        }
        let stream = data;
        if (label === 'game') {
            const payload = this.protocol.filterPolicyRequest(data);
            if (payload === null) return;
            stream = payload;
        }

        const messages = this.protocol.handleIncomingData(label, stream);
        for (const message of messages) {
            // The handshaker answers the version exchange itself; anything it
            // passes on belongs to the engine.
            if (this.protocol.handleHandshake(label, message)) {
                log.info(`Received ${label} handshake`);
                if (label === 'registry' && !this.registryHandshakeReceived) {
                    this.registryHandshakeReceived = true;
                }
                continue;
            }
            this.protocol.processFrame(message);
        }
    }

    private handleGameJson(data: Uint8Array): boolean {
        if (data.length > 0 && data[0] === 0x7B) {
            try {
                const text = new TextDecoder().decode(data);
                const msg = JSON.parse(text);
                if (msg.type === 'game_closed') {
                    if (this.protocol.policyHungUp()) {
                        log.info('Ignoring policy socket drop');
                        return true;
                    }
                    log.info('Game closed by server (TCP connection dropped)');
                    const gone = this.session.getActiveGame();
                    if (gone) {
                        this.protocol.sendOutgoings(this.engine.peerGone(gone.device.deviceId));
                    }
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
        this.applySessionInputs(0);
        this.getCapabilities().then((caps) => this.applySessionInputs(caps));
        await this.transport.connect();
    }

    /// The engine opens game sessions from these, so it needs them before a game
    /// connects. Sensor probing finishes later than that can be, so it is handed
    /// what is known and told again when the probe lands.
    private applySessionInputs(capabilities: number) {
        this.engine.configure({
            endpoint: EndpointMode.Controller,
            gyroscope: (capabilities & 1) !== 0,
            orientation: (capabilities & 2) !== 0,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            // No socket here, but the unreliable channel reaches one.
            datagrams: true,
        });
    }

    private handleEvent(ev: BmEvent) {
        switch (ev.type) {
            case 'RegistrationResult':
                this.registry.onRegistrationResult();
                break;
            case 'HostList':
                this.registry.onHostsReceived(ev.infos);
                break;
            case 'HostConnected':
            case 'HostUpdated':
                this.registry.onHostUpsert(ev.info, this.state.games);
                break;
            case 'HostDisconnected':
                this.registry.onHostDisconnected(ev.info, this.state.games);
                break;
            case 'ControlConfig':
                this.handleControlConfig(ev);
                break;
            case 'ChunkProgress':
                this.updateState({ progress: ev.total > 0 ? ev.current / ev.total : 0 });
                break;
            case 'ChunkComplete':
                this.handleChunkComplete(ev);
                break;
            case 'Vibrate':
                VibrationService.vibrate();
                break;
            case 'PeerConnected': {
                const activeGame = this.session.getActiveGame();
                if (!activeGame || ev.record.core.deviceId !== activeGame.device.deviceId) break;
                this.session.adoptUdpEndpoint(ev.udpPort);
                if (ev.udpPort !== 0) {
                    const msg = JSON.stringify({ type: 'set_game_udp_port', port: ev.udpPort });
                    this.transport.send('game', new TextEncoder().encode(msg));
                }
                break;
            }
            case 'ConnectionFailed': {
                const activeGame = this.session.getActiveGame();
                log.warn(`Game reported connection failed: ${ev.deviceId}`);
                if (ev.deviceId && ev.deviceId === activeGame?.device.deviceId) {
                    this.disconnectGame();
                }
                break;
            }
            default:
                break;
        }
    }

    async joinGame(game: BmRegistryInfo) {
        this.protocol.resetFramer('game');
        this.updateState({ progress: 0, scheme: null });
        this.protocol.setGameDeviceId(game.device.deviceId);
        this.session.joinGame(game);
    }

    async setCapabilitiesOverride(mask: number | null) {
        this.capabilitiesOverride = mask;
        this.cachedCapabilities = null;
        this.applySessionInputs(await this.getCapabilities());
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const caps = await this.getCapabilities();
            this.protocol.sendOutgoings(this.engine.makeSetCapabilities(activeGame.device.deviceId, caps));
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
            this.protocol.sendOutgoings(this.engine.makeButtonInvoke(activeGame.device.deviceId, handler, pressed));
        }
    }

    sendDpad(x: number, y: number) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.protocol.sendOutgoings(this.engine.makeDpadUpdate(activeGame.device.deviceId, x, y));
        }
    }

    // Reports one incremental text edit in KEYBOARD mode: the inserted substring,
    // an empty string for a deletion, or "\n" for enter.
    sendKeyString(key: string) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const out = this.engine.emit({ type: 'SendKeyString', target: activeGame.device.deviceId, key });
            this.protocol.sendOutgoings(out.outgoings);
        }
    }

    // Reports one NAVIGATION-mode button press: the command name (back, activate,
    // up, down, left, right).
    sendNavigation(nav: string) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const out = this.engine.emit({ type: 'SendNavigation', target: activeGame.device.deviceId, nav });
            this.protocol.sendOutgoings(out.outgoings);
        }
    }

    sendPause() { this.session.setPaused(true, (actions) => this.protocol.sendOutgoings(actions)); }
    sendResume() { this.session.setPaused(false, (actions) => this.protocol.sendOutgoings(actions)); }

    sendMenuEvent(event: string) {
        this.session.sendMenuEvent(event, (actions) => this.protocol.sendOutgoings(actions));
    }

    handleTouchSet(touches: Array<{ id: number, x: number, y: number, state: number }>, screenWidth: number, screenHeight: number) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.touch.handleTouchSet(touches, screenWidth, screenHeight, activeGame.device.deviceId);
        }
    }

    disconnectGame() {
        this.session.disconnectGame(
            (actions) => this.protocol.sendOutgoings(actions),
            (payload) => this.transport.send('game', payload)
        );
        assetManager.dispose();
        this.touch.reset();
        this.sensors.reset();
        this.schemes.reset();
        this.touchEnabled = null;
        this.updateState({ activeGame: null, scheme: null, progress: 0 });
    }

    close() {
        this.closed = true;
        this.disconnectGame();
        this.transport.close();
        this.registryHandshakeReceived = false;
        this.updateState({ connected: false, activeGame: null, scheme: null, progress: 0, games: [] });
    }

    private handleControlConfig(cfg: BmControlConfig) {
        const activeGame = this.session.getActiveGame();
        if (!activeGame) return;

        if (cfg.controlMode != null) {
            // startString is the keyboard's initial text; only KEYBOARD mode sends it.
            this.updateState({ controlMode: cfg.controlMode, startString: cfg.startString ?? '' });
        }

        this.touch.configure({
            touchEnabled: cfg.touchEnabled,
            touchIntervalMs: cfg.touchIntervalMs
        });

        this.sensors.configure({
            orientationEnabled: cfg.orientationEnabled,
            orientationIntervalMs: cfg.orientationIntervalMs
        }, activeGame.device.deviceId);

        if (cfg.touchEnabled != null) {
            this.touchEnabled = cfg.touchEnabled;
            if (this.state.scheme) {
                this.updateState({ scheme: ControlScheme.create({ ...this.state.scheme, touchEnabled: cfg.touchEnabled }) });
            }
        }

        if (cfg.accelEnabled != null) {
            if (cfg.accelEnabled) {
                this.sensors.startAccel(activeGame.device.deviceId);
            } else {
                this.sensors.stopAccel();
            }
        }
        if (cfg.gyroEnabled != null) {
            if (cfg.gyroEnabled) {
                this.sensors.startGyro(activeGame.device.deviceId);
            } else {
                this.sensors.stopGyro();
            }
        }
        if (cfg.accelEnabled || cfg.gyroEnabled) {
            this.sensors.checkSensorsAfterDelay();
        }
    }

    private handleChunkComplete(ev: BmEvent & { type: 'ChunkComplete' }) {
        const { scheme, initial } = this.schemes.offer(ev.setId, ev.blob);
        if (!scheme) return;
        // Re-apply the runtime touch-enable state
        if (this.touchEnabled != null) scheme.touchEnabled = this.touchEnabled;
        this.updateState({ scheme, progress: 1.0 });
        if (initial) {
            const activeGame = this.session.getActiveGame();
            if (isAccelerometerEnabled(scheme) && activeGame) {
                this.sensors.startAccel(activeGame.device.deviceId);
            }
            this.onSchemeParsed();
        }
    }

    private onSchemeParsed() {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const actions = this.engine.makeOnControlSchemeParsed(activeGame.device.deviceId);
            this.protocol.sendOutgoings(actions);
        }
    }

}

export const gameClient = new GameClient();
