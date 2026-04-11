// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { GameClient, GameClientState } from '../gameClient';
import { ControlScheme } from './proto/scheme';
import {
    getRotation,
    ControlOrientation,
} from './proto/schemeExtensions';
import { assetManager } from './assetManager';
import { BmCanvasRenderer } from './BmCanvasRenderer';


interface Props {
    client: GameClient;
    onExit: () => void;
    floatingDpadEnabled: boolean;
    smartWidescreenEnabled: boolean;
    preserveDpadDragEnabled: boolean;
}

export const BmRenderView: React.FC<Props> = ({ client, floatingDpadEnabled, smartWidescreenEnabled, preserveDpadDragEnabled }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scheme, setScheme] = useState<ControlScheme | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [effectiveScheme, setEffectiveScheme] = useState<ControlScheme | null>(null);
    const [designW, setDesignW] = useState(0);
    const [designH, setDesignH] = useState(0);

    const [pressedButtons, setPressedButtons] = useState<Set<string>>(new Set());

    const activeButtonsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const handler = (state: GameClientState) => {
            if (state.scheme) {
                setScheme(state.scheme);
            }
        };
        client.addListener(handler);
        return () => client.removeListener(handler);
    }, [client]);

    useEffect(() => {
        if (!scheme) return;

        const loadAndFlip = async () => {
            const neededIds = new Set<number>();
            (scheme.displayObjects || []).forEach(obj => {
                (obj.assets || []).forEach(a => neededIds.add(a.resourceRef ?? -1));
            });
            const resourcesToLoad = (scheme.resources || [])
                .filter(r => r.id !== undefined && r.bitmap !== undefined && neededIds.has(r.id))
                .map(r => ({ id: r.id!, bitmap: r.bitmap! }));

            if (resourcesToLoad.length > 0) {
                await assetManager.loadResources(resourcesToLoad);
            }

            let baseW = scheme.width ?? 0;
            let baseH = scheme.height ?? 0;
            const rotation = getRotation(scheme);

            if (baseW <= 0 || baseH <= 0) {
                if (rotation === ControlOrientation.Landscape) {
                    baseW = 480; baseH = 320;
                } else {
                    baseW = 320; baseH = 480;
                }
            }

            if (rotation === ControlOrientation.Landscape && baseW < baseH) {
                const tmp = baseW;
                baseW = baseH;
                baseH = tmp;
            }

            let workingScheme = scheme;
            if (smartWidescreenEnabled &&
                rotation === ControlOrientation.Landscape &&
                baseW <= 480 &&
                (scheme.displayObjects || []).some(o => o.type === 'dpad')) {

                const cw = window.innerWidth;
                const ch = window.innerHeight;
                if (cw > 0 && ch > 0) {
                    const screenAspect = cw / ch;
                    const targetW = Math.min(baseH * screenAspect, 568);

                    if (targetW > baseW) {
                        const extraW = targetW - baseW;

                        const newObjects = (scheme.displayObjects || []).map(obj => {
                            const newObj = { ...obj, assets: [...(obj.assets || [])] };

                            if (!obj.left && obj.left !== 0) return newObj;
                            if (!obj.width) return newObj;

                            if (obj.width > 0.95) return newObj;

                            const oldPixelL = (obj.left ?? 0) * baseW;
                            const oldPixelW = (obj.width ?? 0) * baseW;
                            const oldCenterX = oldPixelL + oldPixelW / 2;

                            let newPixelL = oldPixelL;
                            if (oldCenterX > baseW * 0.55) {
                                newPixelL += extraW;
                            } else if (oldCenterX > baseW * 0.45) {
                                newPixelL += extraW / 2;
                            }

                            newObj.left = newPixelL / targetW;
                            newObj.width = oldPixelW / targetW;

                            if (obj.hasHitRect) {
                                const oldPixelHitL = (obj.hitLeft ?? 0) * baseW;
                                const oldPixelHitW = (obj.hitWidth ?? 0) * baseW;

                                let hitOffset = 0;
                                if (oldCenterX > (baseW * 0.55)) hitOffset = extraW;
                                else if (oldCenterX > (baseW * 0.45)) hitOffset = extraW / 2;

                                newObj.hitLeft = (oldPixelHitL + hitOffset) / targetW;
                                newObj.hitWidth = oldPixelHitW / targetW;
                            }

                            return newObj;
                        });

                        workingScheme = ControlScheme.create({
                            ...scheme,
                            width: targetW,
                            height: baseH,
                            displayObjects: newObjects,
                        });
                        baseW = targetW;
                    }
                }
            }

            setDesignW(baseW);
            setDesignH(baseH);
            setEffectiveScheme(workingScheme);
            setLoaded(true);

            const newHandlers = new Set(
                (workingScheme.displayObjects || [])
                    .map(o => o.functionHandler)
                    .filter((h): h is string => !!h)
            );
            const oldActive = activeButtonsRef.current;
            for (const handler of oldActive) {
                if (!newHandlers.has(handler)) {
                    client.sendButton(handler, false);
                    oldActive.delete(handler);
                }
            }
        };

        loadAndFlip();

    }, [scheme, smartWidescreenEnabled, client]);

    const handleButtonPress = useCallback((handler: string, pressed: boolean) => {
        if (pressed) {
            if (!activeButtonsRef.current.has(handler)) {
                activeButtonsRef.current.add(handler);
                setPressedButtons(prev => new Set(prev).add(handler));
                client.sendButton(handler, true);
            }
        } else {
            if (activeButtonsRef.current.has(handler)) {
                activeButtonsRef.current.delete(handler);
                setPressedButtons(prev => {
                    const n = new Set(prev);
                    n.delete(handler);
                    return n;
                });
                client.sendButton(handler, false);
            }
        }
    }, [client]);

    const handleDpadUpdate = useCallback((nx: number, ny: number) => {
        client.sendDpad(nx, ny);
    }, [client]);

    const handleTouchSet = useCallback((touches: Array<{ id: number, x: number, y: number, state: number }>) => {
        if (!effectiveScheme) return;

        let w = effectiveScheme.width ?? 0;
        let h = effectiveScheme.height ?? 0;

        if (w <= 0 || h <= 0) {
            const rot = getRotation(effectiveScheme);
            if (rot === ControlOrientation.Landscape) { w = 480; h = 320; }
            else { w = 320; h = 480; }
        }

        if (getRotation(effectiveScheme) === ControlOrientation.Landscape && w < h) {
            const temp = w; w = h; h = temp;
        }

        client.handleTouchSet(touches, w, h);
    }, [client, effectiveScheme]);

    if (!effectiveScheme || !loaded || designW <= 0 || designH <= 0) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: 'black',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '18px',
                fontFamily: 'sans-serif',
            }}>
                Loading Controls...
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="bm-render-view"
            style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: 'black',
                position: 'relative',
                overflow: 'hidden',
                touchAction: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <BmCanvasRenderer
                scheme={effectiveScheme}
                width={window.innerWidth}
                height={window.innerHeight}
                onButtonPress={handleButtonPress}
                onDpadUpdate={handleDpadUpdate}
                pressedButtons={pressedButtons}
                baseW={designW}
                baseH={designH}
                floatingDpadEnabled={floatingDpadEnabled}
                preserveDpadDragEnabled={preserveDpadDragEnabled}
                onTouchSet={handleTouchSet}
            />
        </div>
    );
};
