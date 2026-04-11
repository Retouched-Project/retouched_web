// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

const POLAR_INDEX = [3, 6, 6, 7, 7, 8, 8, 5, 5, 2, 2, 1, 1, 0, 0, 3, 3];

export function computeDpadState(
    px: number, py: number,
    cx: number, cy: number,
    visualWidth: number,
    deadzoneRatio: number,
    radialMode: boolean,
    aspectYScale: number = 1.0,
): number {
    if (radialMode) {
        const ox = px - cx;
        const oy = (py - cy) * aspectYScale;
        const radiusThreshold = visualWidth * deadzoneRatio * 0.5;

        if (Math.sqrt(ox * ox + oy * oy) < radiusThreshold) {
            return 4;
        }

        const angle = Math.atan2(-oy, ox) + Math.PI;
        const idx = Math.floor(angle / (Math.PI / 8));
        const clamped = Math.max(0, Math.min(POLAR_INDEX.length - 1, idx));
        return POLAR_INDEX[clamped];
    }

    const innerF = 1 / 3;
    const halfW = visualWidth / 2;
    const halfH = visualWidth / 2;
    const innerLeft = cx - halfW * innerF;
    const innerRight = cx + halfW * innerF;
    const innerTop = cy - halfH * innerF;
    const innerBottom = cy + halfH * innerF;

    const dzLeft = cx - halfW * deadzoneRatio;
    const dzRight = cx + halfW * deadzoneRatio;
    const dzTop = cy - halfH * deadzoneRatio;
    const dzBottom = cy + halfH * deadzoneRatio;

    if (px >= cx - halfW * innerF && px <= cx + halfW * innerF &&
        py >= cy - halfH * innerF && py <= cy + halfH * innerF) {
        const bx = px < dzLeft ? 0 : (px < dzRight ? 1 : 2);
        const by = py < dzTop ? 0 : (py < dzBottom ? 1 : 2);
        return bx + by * 3;
    }
    const bx = px < innerLeft ? 0 : (px < innerRight ? 1 : 2);
    const by = py < innerTop ? 0 : (py < innerBottom ? 1 : 2);
    return bx + by * 3;
}

export function computeDpadDrag(
    px: number, py: number,
    cx: number, cy: number,
    currentDragX: number, currentDragY: number,
    visualWidth: number,
    hitBounds: { left: number; top: number; width: number; height: number },
    aspectYScale: number = 1.0,
): { x: number; y: number } {
    const drawnCx = cx + currentDragX;
    const drawnCy = cy + currentDragY;

    const ox = px - drawnCx;
    const oy = py - drawnCy;
    const oyScaled = oy * aspectYScale;

    const minR = visualWidth / 2;
    const len = Math.sqrt(ox * ox + oyScaled * oyScaled);

    if (len <= minR) return { x: currentDragX, y: currentDragY };

    const f = (len - minR) / len;
    const deltaX = ox * f;
    const deltaY = (f / aspectYScale) * oyScaled;

    let newDragX = currentDragX + deltaX;
    let newDragY = currentDragY + deltaY;

    const halfW = visualWidth / 2;
    const newCx = cx + newDragX;
    const newCy = cy + newDragY;

    if (newCx - halfW < hitBounds.left) newDragX = hitBounds.left + halfW - cx;
    if (newCx + halfW > hitBounds.left + hitBounds.width) newDragX = hitBounds.left + hitBounds.width - halfW - cx;
    if (newCy - halfW < hitBounds.top) newDragY = hitBounds.top + halfW - cy;
    if (newCy + halfW > hitBounds.top + hitBounds.height) newDragY = hitBounds.top + hitBounds.height - halfW - cy;

    return { x: newDragX, y: newDragY };
}
