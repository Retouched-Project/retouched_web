// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEngine } from '../bmEngine';
import { DeviceInfo } from './deviceInfo';
import { MetricsService } from '../utils/metricsService';
import type { BmOutgoing, BmRegistryInfo } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('GameSession');

export class GameSession {
    private engine: BmEngine;
    private identity: DeviceInfo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onStateUpdate: (partial: any) => void;

    private activeGame: BmRegistryInfo | null = null;
    private isPaused = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(engine: BmEngine, identity: DeviceInfo, onStateUpdate: (partial: any) => void) {
        this.engine = engine;
        this.identity = identity;
        this.onStateUpdate = onStateUpdate;
    }

    joinGame(game: BmRegistryInfo, selfInfo: BmRegistryInfo | null) {
        if (!selfInfo) {
            log.error('Cannot join game: selfInfo not set');
            return;
        }

        log.info('Joining game:', game.device.deviceName);
        this.activeGame = game;
        this.isPaused = false;

        this.onStateUpdate({
            activeGame: game,
            progress: 0,
            scheme: null
        });

        const actions = this.engine.makeDeviceConnectRequested(
            'server',
            game,
            selfInfo
        );

        this.onStateUpdate({ actionsToProcess: actions });
        MetricsService.send(MetricsService.SESSION_START, game.appId ?? '', this.identity.getDeviceId());
    }

    disconnectGame(sendAction: (payload: BmOutgoing[]) => void, sendDisconnectSignal: (payload: Uint8Array) => void) {
        if (this.activeGame) {
            MetricsService.send(MetricsService.SESSION_END, this.activeGame.appId ?? '', this.identity.getDeviceId());

            const targetId = this.activeGame.device.deviceId;
            sendAction(this.engine.makeSimpleInvoke(targetId, 'bmPause'));

            try {
                const msg = JSON.stringify({ type: 'disconnect_game' });
                sendDisconnectSignal(new TextEncoder().encode(msg));
                log.info('Sent disconnect_game signal');
            } catch (e) {
                log.warn('Failed to send disconnect_game signal:', e);
            }
        }

        this.activeGame = null;
        this.onStateUpdate({
            activeGame: null,
            scheme: null,
            progress: 0
        });
    }

    setPaused(paused: boolean, sendAction: (payload: BmOutgoing[]) => void) {
        if (!this.activeGame || this.isPaused === paused) return;
        this.isPaused = paused;

        const targetId = this.activeGame.device.deviceId;
        const actions = this.engine.makeSimpleInvoke(targetId, 'bmPause');
        sendAction(actions);
    }

    sendMenuEvent(event: string, sendAction: (payload: BmOutgoing[]) => void) {
        if (!this.activeGame) return;
        const targetId = this.activeGame.device.deviceId;
        const actions = this.engine.makeSimpleInvoke(targetId, 'menuEvent', null, event);
        sendAction(actions);
    }

    // The port a game listens on for UDP is only known once it acknowledges the
    // connection. What the registry advertised is usually 0 for those games.
    adoptUdpEndpoint(udpPort: number) {
        const game = this.activeGame;
        if (!game || game.deviceAddress.unreliablePort === udpPort) return;
        const updated: BmRegistryInfo = {
            ...game,
            deviceAddress: { ...game.deviceAddress, unreliablePort: udpPort },
        };
        this.activeGame = updated;
        this.onStateUpdate({ activeGame: updated });
        log.info(`Game UDP port is ${udpPort}`);
    }

    getActiveGame() { return this.activeGame; }
    getIsPaused() { return this.isPaused; }
}
