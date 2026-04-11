// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { ControlScheme } from '../../bmrender/proto/scheme';
import { mergeSchemes } from '../../bmrender/proto/schemeExtensions';
import { WasmEngineBridge } from './wasmEngineBridge';
import type { BmAction } from '../../types';

export class SchemeService {
    private engine: WasmEngineBridge;
    private lastUpdateXml: string | null = null;
    private currentScheme: ControlScheme | null = null;

    constructor(engine: WasmEngineBridge) {
        this.engine = engine;
    }

    parseChunk(action: BmAction & { type: 'ChunkComplete' }): { scheme: ControlScheme | null, xml: string | null, isUpdate: boolean } {
        if (action.blob.length === 0) return { scheme: null, xml: null, isUpdate: false };

        let scheme: ControlScheme | null = null;
        let xml: string | null = null;
        try {
            try { xml = new TextDecoder().decode(action.blob); } catch { }
            if (xml && xml.includes('<BMApplicationScheme')) {
                const pb = this.engine.parseControlSchemeXml(xml);
                if (pb.length > 0) scheme = ControlScheme.decode(pb);
            } else {
                scheme = ControlScheme.decode(action.blob);
            }
        } catch (e) {
            console.error('[SchemeService] Chunk parse fail:', e);
            return { scheme: null, xml: null, isUpdate: false };
        }

        if (!scheme) return { scheme: null, xml: null, isUpdate: false };

        if (action.setId === 'testXML') {
            this.lastUpdateXml = null;
            this.currentScheme = scheme;
            return { scheme, xml, isUpdate: false };
        } else if (action.setId === 'updateXML') {
            if (xml && xml === this.lastUpdateXml) return { scheme: this.currentScheme, xml, isUpdate: true };
            this.lastUpdateXml = xml;
            this.currentScheme = this.currentScheme ? mergeSchemes(this.currentScheme, scheme) : scheme;
            return { scheme: this.currentScheme, xml, isUpdate: true };
        }

        return { scheme, xml, isUpdate: false };
    }

    getCurrentScheme() { return this.currentScheme; }
    reset() {
        this.currentScheme = null;
        this.lastUpdateXml = null;
    }
}
