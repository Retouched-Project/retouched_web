// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEngine } from '../bmEngine';
import { DeviceInfo } from './deviceInfo';
import { MetricsService } from '../utils/metricsService';
import type { BmOutgoing, BmRegistryInfo } from '../types';

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
            console.error('[GameSession] Cannot join game: selfInfo not set');
            return;
        }

        console.log('[GameSession] Joining game:', game.device.deviceName);
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
                console.log('[GameSession] Sent disconnect_game signal');
            } catch (e) {
                console.warn('[GameSession] Failed to send disconnect_game signal:', e);
            }
        }

        this.activeGame = null;
        this.onStateUpdate({
            activeGame: null,
            scheme: null,
            progress: 0
        });
    }

    async sendGameInitSequence(getCapabilities: () => Promise<number>, sendAction: (payload: BmOutgoing[]) => void) {
        if (!this.activeGame) return;

        const targetId = this.activeGame.device.deviceId;
        const deviceId = this.identity.getDeviceId();

        const caps = await getCapabilities();
        console.log(`[GameSession] Sending setCapabilities to game (mask=${caps})...`);
        const capActions = this.engine.makeSetCapabilities(targetId, caps);
        sendAction(capActions);

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        console.log(`[GameSession] Sending requestXml (${screenWidth}x${screenHeight}) to game...`);
        const xmlActions = this.engine.makeRequestXml(targetId, screenWidth, screenHeight, deviceId);
        sendAction(xmlActions);
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

    getActiveGame() { return this.activeGame; }
    getIsPaused() { return this.isPaused; }
}
