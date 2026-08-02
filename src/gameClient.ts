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
    private static readonly POLICY_RESPONSE = new TextEncoder().encode(
        '<?xml version="1.0"?><cross-domain-policy><allow-access-from domain="*" to-ports="1008-49151" /></cross-domain-policy>\0'
    );

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
    private selfInfo: BmRegistryInfo | null = null;
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
        this.touch = new TouchProcessor(this.engine, (a) => this.protocol.sendOutgoings(a, this.state.activeGame));
        this.sensors = new SensorProcessor(this.engine, (a) => this.protocol.sendOutgoings(a, this.state.activeGame));
        this.sensors.onStatusChange = (status) => this.updateState({ sensorStatus: status });

        this.setupTransportListeners();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handleDelegateUpdate(partial: any) {
        if (partial.actionsToProcess) {
            this.protocol.sendOutgoings(partial.actionsToProcess, this.state.activeGame);
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
                log.info(`Received ${label} handshake`);
                if (label === 'game' && !this.gameHandshakeReceived) {
                    this.gameHandshakeReceived = true;
                    const handshake = this.engine.getHandshakeBytes();
                    this.transport.send('game', handshake);
                    this.session.sendGameInitSequence(
                        () => this.getCapabilities(),
                        (actions) => this.protocol.sendOutgoings(actions, this.state.activeGame)
                    );
                } else if (label === 'registry' && !this.registryHandshakeReceived) {
                    this.registryHandshakeReceived = true;
                }
            }

            this.protocol.processFrame(frame, this.state.activeGame);
        }
    }

    private isHandlingPolicy = false;
    private policyBuffer: Uint8Array = new Uint8Array(0);

    private handlePolicyRequest(data: Uint8Array): boolean {
        if ((data.length > 0 && data[0] === 0x3C) || this.policyBuffer.length > 0) {
            const newBuffer = new Uint8Array(this.policyBuffer.length + data.length);
            newBuffer.set(this.policyBuffer);
            newBuffer.set(data, this.policyBuffer.length);
            this.policyBuffer = newBuffer;

            if (this.policyBuffer.length >= 23) {
                this.isHandlingPolicy = true;
                this.transport.send('game', GameClient.POLICY_RESPONSE);
                this.policyBuffer = new Uint8Array(0);
            }
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
                    if (this.isHandlingPolicy) {
                        log.info('Ignoring policy socket drop');
                        this.isHandlingPolicy = false;
                        return true;
                    }
                    log.info('Game closed by server (TCP connection dropped)');
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
        this.gameHandshakeReceived = false;
        this.session.joinGame(game, this.selfInfo);
    }

    async setCapabilitiesOverride(mask: number | null) {
        this.capabilitiesOverride = mask;
        this.cachedCapabilities = null;
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const caps = await this.getCapabilities();
            this.protocol.sendOutgoings(this.engine.makeSetCapabilities(activeGame.device.deviceId, caps), activeGame);
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
            this.protocol.sendOutgoings(this.engine.makeButtonInvoke(activeGame.device.deviceId, handler, pressed), activeGame);
        }
    }

    sendDpad(x: number, y: number) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.protocol.sendOutgoings(this.engine.makeDpadUpdate(activeGame.device.deviceId, x, y), activeGame);
        }
    }

    // Reports one incremental text edit in KEYBOARD mode: the inserted substring,
    // an empty string for a deletion, or "\n" for enter.
    sendKeyString(key: string) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const outgoings = this.engine.emit({ type: 'SendKeyString', target: activeGame.device.deviceId, key });
            this.protocol.sendOutgoings(outgoings, activeGame);
        }
    }

    // Reports one NAVIGATION-mode button press: the command name (back, activate,
    // up, down, left, right).
    sendNavigation(nav: string) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            const outgoings = this.engine.emit({ type: 'SendNavigation', target: activeGame.device.deviceId, nav });
            this.protocol.sendOutgoings(outgoings, activeGame);
        }
    }

    sendPause() { this.session.setPaused(true, (actions) => this.protocol.sendOutgoings(actions, this.state.activeGame)); }
    sendResume() { this.session.setPaused(false, (actions) => this.protocol.sendOutgoings(actions, this.state.activeGame)); }

    sendMenuEvent(event: string) {
        this.session.sendMenuEvent(event, (actions) => this.protocol.sendOutgoings(actions, this.state.activeGame));
    }

    handleTouchSet(touches: Array<{ id: number, x: number, y: number, state: number }>, screenWidth: number, screenHeight: number) {
        const activeGame = this.session.getActiveGame();
        if (activeGame) {
            this.touch.handleTouchSet(touches, screenWidth, screenHeight, activeGame.device.deviceId);
        }
    }

    disconnectGame() {
        const activeGame = this.session.getActiveGame();
        this.session.disconnectGame(
            (actions) => this.protocol.sendOutgoings(actions, activeGame),
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
        this.gameHandshakeReceived = false;
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
            accelIntervalMs: cfg.accelIntervalMs,
            gyroIntervalMs: cfg.gyroIntervalMs,
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
            this.protocol.sendOutgoings(actions, activeGame);
        }
    }

}

export const gameClient = new GameClient();
