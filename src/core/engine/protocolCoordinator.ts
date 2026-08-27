// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEngine } from '../../bmEngine';
import { HandshakerWasm, PolicySnifferWasm, frame, policyResponse, type FramerWasm } from '../../wasm/bronze_monkey';
import { WebRtcTransport } from '../webRtcTransport';
import type { BmEvent, BmOutgoing, BmVia } from '../../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('ProtocolCoordinator');

export interface ProtocolHandlers {
    onEvent: (event: BmEvent) => void;
    onDeadline: (at: number | null) => void;
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

    private gameSnifferInst: PolicySnifferWasm | null = null;

    private get gameSniffer(): PolicySnifferWasm {
        return (this.gameSnifferInst ??= new PolicySnifferWasm());
    }

    policyHungUp(): boolean {
        return this.gameSnifferInst?.hungUp() ?? false;
    }

    filterPolicyRequest(data: Uint8Array): Uint8Array | null {
        const sniffer = this.gameSniffer;
        if (!sniffer.isWatching) return data;

        const sniff = sniffer.feed(data) as
            | { type: 'Wait' }
            | { type: 'Answer' }
            | { type: 'Passthrough'; data: Uint8Array };
        if (sniff.type === 'Passthrough') return sniff.data;
        if (sniff.type === 'Answer') {
            log.info('Answering a cross domain policy request');
            this.gameFramerInst?.reset();
            this.gameHandshakerInst?.reset();
            this.transport.send('game', policyResponse());
        }
        return null;
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

    processFrame(data: Uint8Array) {
        try {
            // A data channel carries no address, so there is nothing to report
            // about where this came from. The clock is worth reporting either
            // way, since anything the engine decides by it can arrive here.
            const out = this.engine.processIncoming(data, { nowMs: Date.now() });
            this.sendOutgoings(out.outgoings);
            this.handlers.onDeadline(out.nextTimeMs ?? null);
            for (const event of out.events) {
                this.handlers.onEvent(event);
            }
        } catch (e) {
            log.error("processIncoming failed:", e);
        }
    }

    /// The payload is ready to write, so this only has to pick a channel.
    sendOutgoings(outgoings: BmOutgoing[]) {
        for (const o of outgoings) {
            this.transport.send(this.channelFor(o.targetDeviceId, o.via), o.payload);
        }
    }

    // The engine names an address for a datagram; a data channel already leads
    // to the peer, so only the kind of path matters here.
    private channelFor(deviceId: string, via: BmVia): string {
        if (via.type === 'Datagram') return 'game-unreliable';
        return this.gameDeviceId === deviceId ? 'game' : 'registry';
    }

    /// Which peer the game channels lead to. The engine addresses a device;
    /// only this side knows which channel reaches it.
    private gameDeviceId: string | null = null;

    setGameDeviceId(deviceId: string | null) {
        this.gameDeviceId = deviceId;
    }

    resetFramer(label: string) {
        if (label === 'game' || label === 'game-unreliable') {
            this.gameFramerInst?.reset();
            this.gameHandshakerInst?.reset();
            this.gameSnifferInst?.reset();
        } else {
            this.registryFramerInst?.reset();
            this.registryHandshakerInst?.reset();
        }
    }
}
