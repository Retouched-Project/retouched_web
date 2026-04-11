// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export class WebRtcTransport {
    private pc: RTCPeerConnection | null = null;
    private channels = new Map<string, RTCDataChannel>();
    private signalingUrl: string;
    private closed = false;

    public onMessage?: (label: string, data: Uint8Array) => void;
    public onOpen?: (label: string) => void;
    public onClose?: (label: string) => void;
    public onError?: (error: unknown) => void;

    constructor(signalingUrl: string) {
        this.signalingUrl = signalingUrl;
    }

    async connect(): Promise<void> {
        this.closed = false;
        if (this.pc) this.close();

        console.log('[WebRtcTransport] Creating RTCPeerConnection...');
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.createChannel('registry');
        this.createChannel('game');
        this.createChannel('game-unreliable', { ordered: false, maxRetransmits: 0 });

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        await this.waitGatheringComplete();

        if (!this.pc || this.closed) return;

        console.log('[WebRtcTransport] Sending offer to signaling server...');
        try {
            const response = await fetch(this.signalingUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdp: this.pc.localDescription?.sdp,
                    type: this.pc.localDescription?.type
                })
            });

            if (!this.pc || this.closed) return;

            if (!response.ok) {
                const err = `Signaling failed: ${response.status} ${response.statusText}`;
                this.onError?.(err);
                throw new Error(err);
            }

            const answer = await response.json();

            if (this.pc && !this.closed) {
                console.log('[WebRtcTransport] Received answer, setting remote description');
                await this.pc.setRemoteDescription(answer);
            }
        } catch (err) {
            this.onError?.(err);
            throw err;
        }
    }

    send(label: string, data: Uint8Array): void {
        const chan = this.channels.get(label);
        if (chan?.readyState === 'open') {
            chan.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
        } else {
            console.warn(`[WebRtcTransport] Channel '${label}' is not open (state: ${chan?.readyState})`);
        }
    }

    close(): void {
        this.closed = true;
        console.log('[WebRtcTransport] Closing connection...');
        this.channels.forEach(chan => {
            chan.onmessage = null;
            chan.onopen = null;
            chan.onclose = null;
            chan.close();
        });
        this.channels.clear();

        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
    }

    private createChannel(label: string, options?: RTCDataChannelInit): void {
        if (!this.pc) return;

        const chan = this.pc.createDataChannel(label, options);
        chan.binaryType = 'arraybuffer';

        chan.onopen = () => {
            console.log(`[WebRtcTransport] Channel '${label}' open`);
            this.onOpen?.(label);
        };

        chan.onclose = () => {
            console.log(`[WebRtcTransport] Channel '${label}' closed`);
            this.onClose?.(label);
        };

        chan.onmessage = (event) => {
            const data = new Uint8Array(event.data);
            this.onMessage?.(label, data);
        };

        this.channels.set(label, chan);
    }

    private waitGatheringComplete(): Promise<void> {
        return new Promise<void>(resolve => {
            if (!this.pc || this.pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const check = () => {
                    if (this.pc?.iceGatheringState === 'complete') {
                        this.pc?.removeEventListener('icegatheringstatechange', check);
                        resolve();
                    }
                };
                this.pc.addEventListener('icegatheringstatechange', check);
                setTimeout(resolve, 2000);
            }
        });
    }

    getConnectionStatus(): RTCPeerConnectionState {
        return this.pc?.connectionState ?? 'closed';
    }

    isChannelOpen(label: string): boolean {
        return this.channels.get(label)?.readyState === 'open';
    }
}
