// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { ControlScheme } from './proto/scheme';

export interface RendererProps {
    scheme: ControlScheme;
    width: number;
    height: number;
    onButtonPress: (handler: string, pressed: boolean) => void;
    onDpadUpdate: (nx: number, ny: number) => void;
    pressedButtons: Set<string>;
    baseW: number;
    baseH: number;
    floatingDpadEnabled: boolean;
    preserveDpadDragEnabled: boolean;
    onTouchSet?: (touches: Array<{ id: number; x: number; y: number; state: number }>) => void;
}
