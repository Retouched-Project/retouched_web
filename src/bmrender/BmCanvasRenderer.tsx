// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useEffect, useState } from 'react';
import { DisplayObject } from './proto/scheme';
import { ControlOrientation, SamplingMode, getRotation, getSamplingMode } from './proto/schemeExtensions';
import { assetManager } from './assetManager';
import { computeDpadState, computeDpadDrag } from './controls/dpadUtils';
import type { RendererProps } from './rendererProps';

interface DpadLiveState {
    stateIndex: number;
    dragOffset: { x: number; y: number };
}

interface HitTarget {
    id: number;
    type: string;
    hitRect: { left: number; top: number; width: number; height: number };
    visualWidth: number;
    functionHandler?: string;
    obj: DisplayObject;
}

export const BmCanvasRenderer: React.FC<RendererProps> = ({
    scheme, width, height, onButtonPress, onDpadUpdate,
    pressedButtons, baseW, baseH, floatingDpadEnabled, preserveDpadDragEnabled, onTouchSet,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeDpadPointers = useRef<Map<number, number>>(new Map());
    const pointerPositions = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pointerStates = useRef<Map<number, { id: number; x: number; y: number; state: number }>>(new Map());
    const currentlyPressedRef = useRef<Set<string>>(new Set());
    const hitTargetsRef = useRef<HitTarget[]>([]);
    const inverseRef = useRef<DOMMatrix | null>(null);
    const recalculateHitsRef = useRef<(() => void) | null>(null);

    const dpadStatesRef = useRef<Map<number, DpadLiveState>>(new Map());
    const dpadBoundsRef = useRef<Map<number, string>>(new Map());
    const lastDpadSentRef = useRef<Map<number, number>>(new Map());

    const [dpadTick, setDpadTick] = useState(0);

    const onButtonPressRef = useRef(onButtonPress);
    const onDpadUpdateRef = useRef(onDpadUpdate);
    const floatingDpadRef = useRef(floatingDpadEnabled);
    const onTouchSetRef = useRef(onTouchSet);
    useEffect(() => {
        onButtonPressRef.current = onButtonPress;
        onDpadUpdateRef.current = onDpadUpdate;
        floatingDpadRef.current = floatingDpadEnabled;
        onTouchSetRef.current = onTouchSet;
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const newBounds = new Map<number, string>();
        for (const obj of scheme.displayObjects || []) {
            if (obj.type === 'dpad') {
                const id = obj.id ?? 0;
                newBounds.set(id, `${(obj.left ?? 0) * baseW},${(obj.top ?? 0) * baseH},${(obj.width ?? 0) * baseW},${(obj.height ?? 0) * baseH}`);
            }
        }
        const prevBounds = dpadBoundsRef.current;
        dpadBoundsRef.current = newBounds;

        const states = dpadStatesRef.current;

        if (!preserveDpadDragEnabled) {
            for (const id of states.keys()) {
                if (!newBounds.has(id)) {
                    states.delete(id);
                }
            }
        }

        if (!preserveDpadDragEnabled) {
            for (const [id, bounds] of newBounds) {
                const existing = states.get(id);
                if (!existing) continue;
                if (prevBounds.get(id) !== bounds) {
                    states.delete(id);
                }
            }
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        let bW = baseW;
        let bH = baseH;
        const rotation = getRotation(scheme);
        let rotated = false;
        if (rotation === ControlOrientation.Landscape && bW < bH) {
            rotated = true;
            const t = bW; bW = bH; bH = t;
        }

        const scale = Math.min(width / bW, height / bH);
        const offsetX = (width - bW * scale) / 2;
        const offsetY = (height - bH * scale) / 2;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);

        if (rotated) {
            ctx.translate(offsetX + bW * scale / 2, offsetY + bH * scale / 2);
            ctx.rotate(Math.PI / 2);
            ctx.scale(scale, scale);
            ctx.translate(-bH / 2, -bW / 2);
        } else {
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);
        }

        inverseRef.current = ctx.getTransform().inverse();

        for (const obj of scheme.displayObjects || []) {
            if (obj.hidden) continue;
            const px = (obj.left ?? 0) * bW;
            const py = (obj.top ?? 0) * bH;
            const pw = (obj.width ?? 0) * bW;
            const ph = (obj.height ?? 0) * bH;

            if (obj.type === 'dpad') {
                drawDpad(ctx, obj, px, py, pw, ph, dpadStatesRef.current.get(obj.id ?? 0));
            } else if (obj.type === 'text') {
                drawText(ctx, obj, px, py, pw, ph, bH);
            } else {
                const isPressed = obj.functionHandler && pressedButtons.has(obj.functionHandler);
                const bmp = resolveBitmap(obj, isPressed ? 'down' : 'up') || resolveBitmap(obj, 'up');
                if (bmp) {
                    ctx.imageSmoothingEnabled = getSamplingMode(obj) === SamplingMode.Bilinear;
                    if ((obj.width ?? 0) > 0.95) {
                        drawSliced(ctx, bmp, px, py, pw, ph);
                    } else {
                        ctx.drawImage(bmp, px, py, pw, ph);
                    }
                }
            }
        }
        ctx.restore();

        const targets: HitTarget[] = [];
        for (const obj of scheme.displayObjects || []) {
            if (obj.hidden || (!obj.functionHandler && obj.type !== 'dpad')) continue;
            let hx = (obj.left ?? 0) * bW, hy = (obj.top ?? 0) * bH;
            let hw = (obj.width ?? 0) * bW, hh = (obj.height ?? 0) * bH;
            if (obj.hasHitRect) {
                hx = (obj.hitLeft ?? obj.left ?? 0) * bW;
                hy = (obj.hitTop ?? obj.top ?? 0) * bH;
                hw = (obj.hitWidth ?? obj.width ?? 0) * bW;
                hh = (obj.hitHeight ?? obj.height ?? 0) * bH;
            }
            targets.push({
                id: obj.id ?? 0, type: obj.type ?? '',
                hitRect: { left: hx, top: hy, width: hw, height: hh },
                visualWidth: (obj.width ?? 0) * bW,
                functionHandler: obj.functionHandler, obj,
            });
        }
        hitTargetsRef.current = targets.reverse();
        if (pointerPositions.current.size > 0) {
            recalculateHitsRef.current?.();
        }
    }, [scheme, width, height, pressedButtons, baseW, baseH, preserveDpadDragEnabled, dpadTick]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const toDesign = (cx: number, cy: number) => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const inv = inverseRef.current;
            if (inv) {
                const pt = inv.transformPoint(new DOMPoint((cx - rect.left) * dpr, (cy - rect.top) * dpr));
                return { x: pt.x, y: pt.y };
            }
            return { x: cx - rect.left, y: cy - rect.top };
        };

        const sendDpadDirection = (dpadId: number, stateIndex: number) => {
            const prevSent = lastDpadSentRef.current.get(dpadId) ?? 4;
            if (stateIndex !== prevSent) {
                lastDpadSentRef.current.set(dpadId, stateIndex);
                const nx = (stateIndex % 3) - 1;
                const ny = Math.floor(stateIndex / 3) - 1;
                onDpadUpdateRef.current(nx, ny);
            }
        };

        const recalculateHits = () => {
            const currentHits = new Set<string>();

            for (const t of hitTargetsRef.current) {
                if (!t.functionHandler) continue;
                for (const [, pos] of pointerPositions.current.entries()) {
                    if (pos.x >= t.hitRect.left && pos.x <= t.hitRect.left + t.hitRect.width &&
                        pos.y >= t.hitRect.top && pos.y <= t.hitRect.top + t.hitRect.height) {
                        currentHits.add(t.functionHandler);
                        break;
                    }
                }
            }

            for (const h of currentHits) {
                if (!currentlyPressedRef.current.has(h)) {
                    currentlyPressedRef.current.add(h);
                    onButtonPressRef.current(h, true);
                }
            }
            for (const h of currentlyPressedRef.current) {
                if (!currentHits.has(h)) {
                    currentlyPressedRef.current.delete(h);
                    onButtonPressRef.current(h, false);
                }
            }

            let dpadChanged = false;
            activeDpadPointers.current.forEach((pid, dpadId) => {
                const target = hitTargetsRef.current.find(t => t.id === dpadId);
                if (!target) return;
                const rawPos = pointerPositions.current.get(pid);
                if (!rawPos) return;
                const cx = target.hitRect.left + target.hitRect.width / 2;
                const cy = target.hitRect.top + target.hitRect.height / 2;
                const ds = dpadStatesRef.current.get(dpadId);
                const dx = ds?.dragOffset?.x ?? 0;
                const dy = ds?.dragOffset?.y ?? 0;
                const state = computeDpadState(rawPos.x, rawPos.y, cx + dx, cy + dy, target.visualWidth, target.obj.deadzone ?? 0.25, target.obj.radial ?? true);
                const drag = floatingDpadRef.current
                    ? computeDpadDrag(rawPos.x, rawPos.y, cx, cy, dx, dy, target.visualWidth, target.hitRect, 1.0)
                    : { x: 0, y: 0 };

                dpadStatesRef.current.set(dpadId, { stateIndex: state, dragOffset: drag });
                sendDpadDirection(dpadId, state);
                dpadChanged = true;
            });

            if (dpadChanged) setDpadTick(t => t + 1);
        };
        recalculateHitsRef.current = recalculateHits;

        const flushTouch = () => {
            const fn = onTouchSetRef.current;
            if (!fn) return;
            const touches = Array.from(pointerStates.current.values());
            if (touches.length === 0) return;
            fn(touches);
            for (const t of touches) {
                if (t.state === 4 || t.state === 5) pointerStates.current.delete(t.id);
                else if (t.state === 1 || t.state === 2) pointerStates.current.set(t.id, { ...t, state: 3 });
            }
        };

        const onDown = (e: PointerEvent) => {
            e.preventDefault();
            const local = toDesign(e.clientX, e.clientY);
            for (const t of hitTargetsRef.current) {
                if (t.type === 'dpad' &&
                    local.x >= t.hitRect.left && local.x <= t.hitRect.left + t.hitRect.width &&
                    local.y >= t.hitRect.top && local.y <= t.hitRect.top + t.hitRect.height) {
                    activeDpadPointers.current.set(t.id, e.pointerId);
                    break;
                }
            }
            pointerPositions.current.set(e.pointerId, local);
            pointerStates.current.set(e.pointerId, { id: e.pointerId, ...local, state: 1 });
            recalculateHits();
            flushTouch();
        };

        const onMove = (e: PointerEvent) => {
            if (!pointerPositions.current.has(e.pointerId)) return;
            
            const rect = canvas.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom) {
                onUp(e);
                return;
            }

            const local = toDesign(e.clientX, e.clientY);
            pointerPositions.current.set(e.pointerId, local);
            pointerStates.current.set(e.pointerId, { id: e.pointerId, ...local, state: 2 });
            recalculateHits();
            flushTouch();
        };

        const onUp = (e: PointerEvent) => {
            const local = toDesign(e.clientX, e.clientY);
            pointerPositions.current.delete(e.pointerId);
            pointerStates.current.set(e.pointerId, { id: e.pointerId, ...local, state: 4 });

            let dpadChanged = false;
            activeDpadPointers.current.forEach((pid, dpadId) => {
                if (pid === e.pointerId) {
                    const ds = dpadStatesRef.current.get(dpadId);
                    const dragOutput = ds?.dragOffset || { x: 0, y: 0 };
                    dpadStatesRef.current.set(dpadId, { stateIndex: 4, dragOffset: dragOutput });
                    lastDpadSentRef.current.set(dpadId, 4);
                    onDpadUpdateRef.current(0, 0);
                    activeDpadPointers.current.delete(dpadId);
                    dpadChanged = true;
                }
            });

            recalculateHits();
            flushTouch();
            if (dpadChanged) setDpadTick(t => t + 1);
        };

        const noCtx = (e: Event) => e.preventDefault();

        canvas.addEventListener('pointerdown', onDown, { passive: false });
        canvas.addEventListener('pointermove', onMove, { passive: false });
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('contextmenu', noCtx);
        canvas.addEventListener('touchstart', noCtx, { passive: false });
        canvas.addEventListener('touchmove', noCtx, { passive: false });

        return () => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            canvas.removeEventListener('contextmenu', noCtx);
            canvas.removeEventListener('touchstart', noCtx);
            canvas.removeEventListener('touchmove', noCtx);
            recalculateHitsRef.current = null;
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
        />
    );
};

function resolveBitmap(obj: DisplayObject, suffix: string): ImageBitmap | undefined {
    const asset = (obj.assets || []).find(a => a.name === suffix);
    return asset ? assetManager.getBitmap(asset.resourceRef ?? -1) : undefined;
}

function drawDpad(
    ctx: CanvasRenderingContext2D, obj: DisplayObject,
    x: number, y: number, w: number, h: number,
    state: DpadLiveState | undefined,
) {
    const suffixes = ['left_up', 'up', 'right_up', 'left', 'inactive', 'right', 'left_down', 'down', 'right_down'];
    const bmp = resolveBitmap(obj, suffixes[state?.stateIndex ?? 4] || 'inactive');
    if (bmp) {
        ctx.imageSmoothingEnabled = getSamplingMode(obj) === SamplingMode.Bilinear;
        ctx.drawImage(bmp, x + (state?.dragOffset?.x ?? 0), y + (state?.dragOffset?.y ?? 0), w, h);
    }
}

function drawText(
    ctx: CanvasRenderingContext2D, obj: DisplayObject,
    x: number, y: number, _w: number, h: number, designH: number,
) {
    const fontSize = (obj.textSize || 0.03) * designH;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = obj.color !== undefined
        ? '#' + (obj.color & 0xFFFFFF).toString(16).padStart(6, '0')
        : '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(obj.text || '', x, y + h);
}

function drawSliced(
    ctx: CanvasRenderingContext2D, bmp: ImageBitmap,
    x: number, y: number, w: number, h: number,
) {
    const srcW = bmp.width;
    const srcH = bmp.height;
    const srcX1 = srcW * 0.45;
    const srcX2 = srcW * 0.55;

    const scaleY = h / srcH;
    const dstX1 = srcX1 * scaleY;
    const rightPanelW = (srcW - srcX2) * scaleY;
    const dstX2 = w - rightPanelW;

    ctx.drawImage(bmp, 0, 0, srcX1, srcH, x, y, dstX1, h);
    ctx.drawImage(bmp, srcX1, 0, srcX2 - srcX1, srcH,
        x + dstX1 - 0.5, y, dstX2 - dstX1 + 1, h);
    ctx.drawImage(bmp, srcX2, 0, srcW - srcX2, srcH, x + dstX2, y, rightPanelW, h);
}
