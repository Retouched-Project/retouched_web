// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { MessageFramer } from './messageFramer';
import { WasmEngineBridge } from './wasmEngineBridge';
import { WebRtcTransport } from '../webRtcTransport';
import type { BmAction, BmRegistryInfo } from '../../types';

export interface ProtocolHandlers {
    onRegistryEvent: (action: BmAction & { type: 'RegistryEvent' }) => void;
    onInvoke: (action: BmAction & { type: 'Invoke' }) => void;
    onControlConfig: (action: BmAction & { type: 'ControlConfig' }) => void;
    onChunkProgress: (current: number, total: number) => void;
    onChunkComplete: (action: BmAction & { type: 'ChunkComplete' }) => void;
    onLog: (message: string) => void;
}

export class ProtocolCoordinator {
    private engine: WasmEngineBridge;
    private transport: WebRtcTransport;
    private handlers: ProtocolHandlers;

    private registryFramer = new MessageFramer();
    private gameFramer = new MessageFramer();

    constructor(engine: WasmEngineBridge, transport: WebRtcTransport, handlers: ProtocolHandlers) {
        this.engine = engine;
        this.transport = transport;
        this.handlers = handlers;
    }

    handleIncomingData(label: string, data: Uint8Array): Uint8Array[] {
        const framer = label === 'game' || label === 'game-unreliable' ? this.gameFramer : this.registryFramer;
        return framer.processIncoming(data);
    }

    processFrame(data: Uint8Array, activeGame: BmRegistryInfo | null) {
        try {
            const actions = this.engine.processIncoming(data);
            this.processActions(actions, activeGame);
        } catch (e) {
            console.error("[ProtocolCoordinator] processIncoming failed:", e);
        }
    }

    processActions(actions: BmAction[], activeGame: BmRegistryInfo | null) {
        for (const action of actions) {
            switch (action.type) {
                case 'Send': {
                    const isGameTarget = activeGame && action.targetDeviceId === activeGame.deviceId;
                    const gameSupportsUdp = isGameTarget && activeGame.device.address.unreliable_port !== 0;
                    if (isGameTarget && gameSupportsUdp && action.reliability === 0) {
                        this.transport.send('game-unreliable', action.payload as Uint8Array);
                    } else {
                        this.transport.send(isGameTarget ? 'game' : 'registry', action.payload as Uint8Array);
                    }
                    break;
                }
                case 'RegistryEvent':
                    this.handlers.onRegistryEvent(action);
                    break;
                case 'Invoke':
                    this.handlers.onInvoke(action);
                    break;
                case 'ControlConfig':
                    this.handlers.onControlConfig(action);
                    break;
                case 'ChunkProgress':
                    this.handlers.onChunkProgress(action.current, action.total);
                    break;
                case 'ChunkComplete':
                    this.handlers.onChunkComplete(action);
                    break;
                case 'Log':
                    this.handlers.onLog(action.message);
                    break;
            }
        }
    }

    resetFramer(label: string) {
        if (label === 'game' || label === 'game-unreliable') this.gameFramer.reset();
        else this.registryFramer.reset();
    }
}
