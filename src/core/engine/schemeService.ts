// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { ControlScheme } from '../../bmrender/proto/scheme';
import { SchemeAssemblerWasm } from '../../wasm/bronze_monkey';

export class SchemeService {
    private assembler: SchemeAssemblerWasm | null = null;

    private get(): SchemeAssemblerWasm {
        return (this.assembler ??= new SchemeAssemblerWasm());
    }

    offer(setId: string, blob: Uint8Array): { scheme: ControlScheme | null, initial: boolean } {
        const result = this.get().offer(setId, blob) as { type: string, scheme?: Uint8Array, initial?: boolean };
        if (result.type === 'Updated' && result.scheme) {
            return { scheme: ControlScheme.decode(result.scheme), initial: result.initial ?? false };
        }
        return { scheme: null, initial: false };
    }

    reset() {
        this.assembler?.reset();
    }
}
