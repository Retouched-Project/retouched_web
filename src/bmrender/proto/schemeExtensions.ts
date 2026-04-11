// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { ControlScheme, DisplayObject, AppResource, ContextMenuOption } from './scheme';

export const ControlOrientation = {
    Portrait: 'portrait',
    Landscape: 'landscape',
} as const;
export type ControlOrientation = typeof ControlOrientation[keyof typeof ControlOrientation];

export const SamplingMode = {
    NearestNeighbor: 'nearest',
    Bilinear: 'linear',
} as const;
export type SamplingMode = typeof SamplingMode[keyof typeof SamplingMode];

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function getRotation(scheme: ControlScheme): ControlOrientation {
    return scheme.orientation === 'landscape' ? ControlOrientation.Landscape : ControlOrientation.Portrait;
}

export function isTouchEnabled(scheme: ControlScheme): boolean {
    return scheme.touchEnabled ?? false;
}

export function isAccelerometerEnabled(scheme: ControlScheme): boolean {
    return scheme.accelerometerEnabled ?? false;
}

export function getWidth(scheme: ControlScheme): number {
    return scheme.width ?? 0;
}

export function getHeight(scheme: ControlScheme): number {
    return scheme.height ?? 0;
}

export function getResources(scheme: ControlScheme): AppResource[] {
    return scheme.resources || [];
}

export function getDisplayObjects(scheme: ControlScheme): DisplayObject[] {
    return scheme.displayObjects || [];
}

export function getOptions(scheme: ControlScheme): ContextMenuOption[] {
    return scheme.options || [];
}

export function mergeSchemes(target: ControlScheme, source: ControlScheme): ControlScheme {
    const newScheme: ControlScheme = { ...target };

    if (source.version !== undefined && source.version !== "") newScheme.version = source.version;
    if (source.orientation !== undefined && source.orientation !== "") newScheme.orientation = source.orientation;

    if (source.touchEnabled !== undefined) newScheme.touchEnabled = source.touchEnabled;
    if (source.accelerometerEnabled !== undefined) newScheme.accelerometerEnabled = source.accelerometerEnabled;

    if (source.width !== undefined && source.width !== 0) newScheme.width = source.width;
    if (source.height !== undefined && source.height !== 0) newScheme.height = source.height;

    if (source.resources && source.resources.length > 0) {
        newScheme.resources = [...source.resources];
    }

    if (source.displayObjects && source.displayObjects.length > 0) {
        newScheme.displayObjects = [...source.displayObjects];
    }

    if (source.options && source.options.length > 0) {
        newScheme.options = [...source.options];
    }

    return newScheme;
}

export function getSamplingMode(obj: DisplayObject): SamplingMode {
    if (obj.samplingMode === 'nearest') return SamplingMode.NearestNeighbor;
    return SamplingMode.Bilinear;
}

export function getRect(obj: DisplayObject): Rect {
    return {
        left: obj.left ?? 0,
        top: obj.top ?? 0,
        width: obj.width ?? 0,
        height: obj.height ?? 0
    };
}

export function getHitRect(obj: DisplayObject): Rect {
    if (obj.hasHitRect) {
        return {
            left: obj.hitLeft ?? obj.left ?? 0,
            top: obj.hitTop ?? obj.top ?? 0,
            width: obj.hitWidth ?? obj.width ?? 0,
            height: obj.hitHeight ?? obj.height ?? 0
        };
    }
    return getRect(obj);
}

export function getAssetRef(obj: DisplayObject, name: string): number {
    if (!obj.assets) return -1;
    for (const asset of obj.assets) {
        if (asset.name === name) {
            return asset.resourceRef ?? -1;
        }
    }
    return -1;
}

export function getDisplayObjectTop(obj: DisplayObject): number { return obj.top || 0.0; }
export function getDisplayObjectLeft(obj: DisplayObject): number { return obj.left || 0.0; }
export function getDisplayObjectWidth(obj: DisplayObject): number { return obj.width || 0.0; }
export function getDisplayObjectHeight(obj: DisplayObject): number { return obj.height || 0.0; }

export function getDisplayObjectDeadzone(obj: DisplayObject): number { return obj.deadzone || 0.25; }

