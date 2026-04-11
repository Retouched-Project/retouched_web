// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import unlockSliderSrc from '../../assets/unlock_slider.svg';
import unlockSliderBgSrc from '../../assets/unlock_slider_bg.svg';

const BG_WIDTH = 200;
const BG_HEIGHT = 50;
const HANDLE_SIZE = 56;
const MAX_X = BG_WIDTH - HANDLE_SIZE;

export interface UnlockSliderHandle {
    nudge: () => void;
}

interface Props {
    onUnlocked: () => void;
    unlockThreshold?: number;
}

export const UnlockSlider = forwardRef<UnlockSliderHandle, Props>(({
    onUnlocked,
    unlockThreshold = 0.9,
}, ref) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [active, setActive] = useState(false);
    const [handleX, setHandleX] = useState<number | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragOffsetRef = useRef(0);

    const currentX = handleX ?? MAX_X;

    const show = useCallback(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setActive(true);
    }, []);

    const hideDelayed = useCallback(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setActive(false), 1000);
    }, []);

    useImperativeHandle(ref, () => ({
        nudge: () => { show(); hideDelayed(); },
    }), [show, hideDelayed]);

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = outerRef.current!.getBoundingClientRect();
        dragOffsetRef.current = (e.clientX - rect.left) - currentX;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        show();
        setDragging(true);
    }, [currentX, show]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging || !outerRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = outerRef.current.getBoundingClientRect();
        const relX = e.clientX - rect.left - dragOffsetRef.current;
        setHandleX(Math.max(0, Math.min(MAX_X, relX)));
    }, [dragging]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        hideDelayed();
        const finalX = handleX ?? MAX_X;
        const progress = 1 - (finalX / MAX_X);
        setHandleX(null);
        if (progress >= unlockThreshold) onUnlocked();
    }, [dragging, handleX, unlockThreshold, onUnlocked, hideDelayed]);

    const showBg = dragging || active;

    return (
        <div
            ref={outerRef}
            style={{
                position: 'relative',
                width: BG_WIDTH,
                height: HANDLE_SIZE,
                touchAction: 'none',
                userSelect: 'none',
            }}
        >
            <img
                src={unlockSliderBgSrc}
                alt=""
                draggable={false}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: (HANDLE_SIZE - BG_HEIGHT) / 2,
                    width: BG_WIDTH,
                    height: BG_HEIGHT,
                    pointerEvents: 'none',
                    opacity: showBg ? 1 : 0,
                    transition: showBg ? 'opacity 0.25s linear' : 'opacity 0.35s linear',
                }}
            />
            {/* Gear handle */}
            <div
                style={{
                    position: 'absolute',
                    left: currentX,
                    top: 0,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    cursor: dragging ? 'grabbing' : 'grab',
                    transition: dragging ? 'none' : 'left 0.15s ease-out',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <img
                    src={unlockSliderSrc}
                    alt=""
                    draggable={false}
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                />
            </div>
        </div>
    );
});
