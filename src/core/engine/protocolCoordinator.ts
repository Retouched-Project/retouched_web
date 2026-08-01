// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { MessageFramer } from './messageFramer';
import type { BmEngine } from '../../bmEngine';
import { WebRtcTransport } from '../webRtcTransport';
import type { BmEvent, BmOutgoing, BmRegistryInfo } from '../../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('ProtocolCoordinator');

export interface ProtocolHandlers {
    onEvent: (event: BmEvent) => void;
}

export class ProtocolCoordinator {
    private engine: BmEngine;
    private transport: WebRtcTransport;
    private handlers: ProtocolHandlers;

    private registryFramer = new MessageFramer();
    private gameFramer = new MessageFramer();

    constructor(engine: BmEngine, transport: WebRtcTransport, handlers: ProtocolHandlers) {
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
            const out = this.engine.processIncoming(data);
            this.sendOutgoings(out.outgoings, activeGame);
            for (const event of out.events) {
                this.handlers.onEvent(event);
            }
        } catch (e) {
            log.error("processIncoming failed:", e);
        }
    }

    sendOutgoings(outgoings: BmOutgoing[], activeGame: BmRegistryInfo | null) {
        for (const o of outgoings) {
            const isGameTarget = !!activeGame && o.targetDeviceId === activeGame.device.deviceId;
            const gameSupportsUdp = isGameTarget && activeGame!.deviceAddress.unreliablePort !== 0;
            if (isGameTarget && gameSupportsUdp && o.reliability === 0) {
                this.transport.send('game-unreliable', o.payload);
            } else {
                this.transport.send(isGameTarget ? 'game' : 'registry', o.payload);
            }
        }
    }

    resetFramer(label: string) {
        if (label === 'game' || label === 'game-unreliable') this.gameFramer.reset();
        else this.registryFramer.reset();
    }
}
