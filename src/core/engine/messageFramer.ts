// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export class MessageFramer {
    private buffer = new Uint8Array(0);
    private handshakeDone = false;

    processIncoming(data: Uint8Array): Uint8Array[] {
        const completeFrames: Uint8Array[] = [];

        const newBuffer = new Uint8Array(this.buffer.length + data.length);
        newBuffer.set(this.buffer);
        newBuffer.set(data, this.buffer.length);
        this.buffer = newBuffer;

        if (!this.handshakeDone) {
            if (this.buffer.length >= 12) {
                completeFrames.push(this.buffer.slice(0, 12));
                this.buffer = this.buffer.slice(12);
                this.handshakeDone = true;
            } else {
                return [];
            }
        }

        while (this.buffer.length >= 4) {
            const dv = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
            const bodyLen = dv.getUint32(0, true);

            if (bodyLen > 100 * 1024 * 1024) {
                console.error('[MessageFramer] Illegal frame length detected:', bodyLen);
                this.reset();
                break;
            }

            const totalLen = 4 + bodyLen;
            if (this.buffer.length >= totalLen) {
                completeFrames.push(this.buffer.slice(0, totalLen));
                this.buffer = this.buffer.slice(totalLen);
            } else {
                break;
            }
        }

        return completeFrames;
    }

    reset(): void {
        this.buffer = new Uint8Array(0);
        this.handshakeDone = false;
    }
}
