// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEngine } from '../../bmEngine';
import { HandshakerWasm, frame, type FramerWasm } from '../../wasm/bronze_monkey';
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

    // Created on first use: the wasm module is not loaded when this is built.
    private registryFramerInst: FramerWasm | null = null;
    private gameFramerInst: FramerWasm | null = null;

    private get registryFramer(): FramerWasm {
        return (this.registryFramerInst ??= this.engine.createFramer());
    }

    private get gameFramer(): FramerWasm {
        return (this.gameFramerInst ??= this.engine.createFramer());
    }

    // A controller waits for the other side and answers, on both links.
    private registryHandshakerInst: HandshakerWasm | null = null;
    private gameHandshakerInst: HandshakerWasm | null = null;

    private handshakerFor(label: string): HandshakerWasm {
        if (label === 'registry') {
            return (this.registryHandshakerInst ??= new HandshakerWasm(1));
        }
        return (this.gameHandshakerInst ??= new HandshakerWasm(1));
    }

    /// Answers a version exchange, returning true when the message was one.
    handleHandshake(label: string, message: Uint8Array): boolean {
        const outcome = this.handshakerFor(label).onMessage(message) as
            | { type: 'Passthrough' }
            | { type: 'Received'; check: string; reply: Uint8Array | null };
        if (outcome.type !== 'Received') return false;

        if (outcome.reply) {
            this.transport.send(label === 'registry' ? 'registry' : 'game', frame(outcome.reply));
        }
        if (outcome.check !== 'Compatible') {
            log.error(`${label} version is not compatible: ${outcome.check}`);
        }
        return true;
    }

    constructor(engine: BmEngine, transport: WebRtcTransport, handlers: ProtocolHandlers) {
        this.engine = engine;
        this.transport = transport;
        this.handlers = handlers;
    }

    /// Returns whole messages, which is often none while one is still arriving.
    handleIncomingData(label: string, data: Uint8Array): Uint8Array[] {
        const framer = label === 'game' || label === 'game-unreliable' ? this.gameFramer : this.registryFramer;
        try {
            return framer.feed(data);
        } catch (e) {
            // The stream is out of step and the next boundary cannot be found.
            log.error(`${label} stream out of step:`, e);
            framer.reset();
            return [];
        }
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
            if (isGameTarget && o.prefersDatagram) {
                // A datagram carries the message as it is.
                this.transport.send('game-unreliable', o.payload);
            } else {
                // A stream needs the length in front.
                this.transport.send(isGameTarget ? 'game' : 'registry', frame(o.payload));
            }
        }
    }

    resetFramer(label: string) {
        if (label === 'game' || label === 'game-unreliable') {
            this.gameFramerInst?.reset();
            this.gameHandshakerInst?.reset();
        } else {
            this.registryFramerInst?.reset();
            this.registryHandshakerInst?.reset();
        }
    }
}
