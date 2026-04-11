// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { GameClient } from './gameClient';
import type { GameClientState } from './gameClient';
import type { SensorStatus } from './core/sensorProcessor';
import { ControlScheme } from './bmrender/proto/scheme';
import { getOptions, getRotation, ControlOrientation } from './bmrender/proto/schemeExtensions';
import { BmRenderView } from './bmrender/BmRenderView';
import { UnlockSlider } from './bmrender/controls/UnlockSlider';
import type { UnlockSliderHandle } from './bmrender/controls/UnlockSlider';
import { LoadingLogo } from './LoadingLogo';

import menuDefaultIcon from './assets/retouched_logo.svg';
import menuDisconnectIcon from './assets/menu_disconnect.svg';
import menuHelpIcon from './assets/menu_help.svg';
import menuMusicOffIcon from './assets/menu_music_off.svg';
import menuMusicOnIcon from './assets/menu_music.svg';
import menuResetIcon from './assets/menu_reset.svg';
import menuSoundOffIcon from './assets/menu_sound_off.svg';
import menuSoundOnIcon from './assets/menu_sound_on.svg';

const MENU_ICONS: Record<number, string> = {
    0: menuDefaultIcon,
    1: menuResetIcon,
    2: menuHelpIcon,
    3: menuSoundOnIcon,
    4: menuSoundOffIcon,
    5: menuMusicOnIcon,
    6: menuMusicOffIcon,
};

interface Props {
    client: GameClient;
    onDisconnect: () => void;
    floatingDpadEnabled: boolean;
    smartWidescreenEnabled: boolean;
    preserveDpadDragEnabled: boolean;
}

export const GameSessionView: React.FC<Props> = ({
    client,
    onDisconnect,
    floatingDpadEnabled,
    smartWidescreenEnabled,
    preserveDpadDragEnabled,
}) => {
    const [scheme, setScheme] = useState<ControlScheme | null>(null);
    const [progress, setProgress] = useState(0);
    const [showPauseMenu, setShowPauseMenu] = useState(false);
    const [sensorStatus, setSensorStatus] = useState<SensorStatus>('idle');
    const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

    useEffect(() => {
        const handler = (state: GameClientState) => {
            setScheme(state.scheme ?? null);
            setProgress(state.progress);
            if (state.sensorStatus) setSensorStatus(state.sensorStatus);
            if (!state.activeGame) {
                onDisconnect();
            }
        };
        client.addListener(handler);
        return () => client.removeListener(handler);
    }, [client, onDisconnect]);

    const sliderRef = useRef<UnlockSliderHandle>(null);
    const isLandscapeRef = useRef(false);

    const lockedRotationRef = React.useRef<ControlOrientation | null>(null);
    useEffect(() => {
        if (!scheme) return;
        const rotation = getRotation(scheme);
        if (lockedRotationRef.current === rotation) return;
        lockedRotationRef.current = rotation;

        const so = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
        if (!so?.lock) return;

        if (rotation === ControlOrientation.Landscape) {
            so.lock('landscape').catch(() => { });
        } else if (rotation === ControlOrientation.Portrait) {
            so.lock('portrait').catch(() => { });
        }
    }, [scheme]);

    useEffect(() => {
        return () => {
            lockedRotationRef.current = null;
            const so = screen.orientation as ScreenOrientation & { unlock?: () => void };
            so?.unlock?.();
        };
    }, []);

    useEffect(() => {
        if (!client) return;
        const handleVisibilityChange = () => {
            if (document.hidden) {
                client.sendPause();
            } else {
                client.sendResume();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [client]);

    useEffect(() => {
        history.pushState(null, '', location.href);
        const handlePopState = () => {
            history.pushState(null, '', location.href);
            sliderRef.current?.nudge();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => { });
            }
            if (isLandscapeRef.current) {
                const so = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
                so?.lock?.('landscape').catch(() => { });
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const handleUnlocked = useCallback(() => {
        client.sendPause();
        setShowPauseMenu(true);
    }, [client]);

    const sendMenuEvent = useCallback((evt: string) => {
        if (client && evt) {
            client.sendMenuEvent(evt);
        }
    }, [client]);

    const handleDisconnect = useCallback(() => {
        if (client) {
            client.disconnectGame();
        }
        onDisconnect();
    }, [client, onDisconnect]);

    const closePauseMenu = useCallback(() => {
        setShowPauseMenu(false);
        client.sendResume();
    }, [client]);

    const isLandscape = scheme ? getRotation(scheme) === ControlOrientation.Landscape : false;
    const sliderRightOffset = isLandscape ? 60 : 12;

    useEffect(() => {
        isLandscapeRef.current = isLandscape;
    }, [isLandscape]);

    if (!scheme) {
        const percent = Math.round(progress * 100);
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: '#000',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontFamily: "'Inter', sans-serif",
            }}>
                <LoadingLogo progress={progress} size={140} />
                <div style={{ height: 24 }} />
                <div style={{ fontSize: 16, color: '#fff', opacity: 0.9 }}>
                    Loading and parsing controls...
                </div>
                <div style={{ height: 8 }} />
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    {percent}%
                </div>
            </div>
        );
    }

    const options = getOptions(scheme);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: '#000',
                position: 'relative',
                overflow: 'hidden',
                touchAction: 'none'
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
        >
            {/* Controls */}
            <BmRenderView
                client={client}
                onExit={handleDisconnect}
                floatingDpadEnabled={floatingDpadEnabled}
                smartWidescreenEnabled={smartWidescreenEnabled}
                preserveDpadDragEnabled={preserveDpadDragEnabled}
            />

            {/* Unlock slider */}
            <div style={{
                position: 'absolute',
                top: isLandscape ? 12 : 56,
                right: sliderRightOffset,
                zIndex: 100,
            }}>
                <UnlockSlider ref={sliderRef} onUnlocked={handleUnlocked} />
            </div>

            {/* Status banners */}
            <StatusBanners
                sensorStatus={sensorStatus}
                dismissed={dismissedBanners}
                onDismiss={(key) => setDismissedBanners(prev => new Set(prev).add(key))}
                isLandscape={isLandscape}
            />

            {/* Pause menu overlay */}
            {showPauseMenu && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 200,
                    }}
                    onClick={closePauseMenu}
                >
                    <div
                        style={{
                            backgroundColor: '#1e1e2e',
                            borderRadius: 12,
                            maxWidth: 320,
                            width: '90%',
                            overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Scheme context menu options */}
                        {options.map((opt, i) => {
                            const iconUrl = MENU_ICONS[opt.iconResId] ?? MENU_ICONS[0];
                            return (
                                <button
                                    key={i}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        width: '100%',
                                        padding: '14px 16px',
                                        border: 'none',
                                        outline: 'none',
                                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                                        backgroundColor: 'transparent',
                                        color: '#fff',
                                        fontSize: 15,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontFamily: "'Inter', sans-serif",
                                    }}
                                    onPointerDown={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                                    onPointerUp={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        sendMenuEvent(opt.event);
                                        if (opt.closeOnSelect) closePauseMenu();
                                    }}
                                    onPointerLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <img src={iconUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                                    <span>{opt.title || 'Menu Item'}</span>
                                </button>
                            );
                        })}

                        {/* Disconnect button */}
                        <button
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                width: '100%',
                                padding: '14px 16px',
                                border: 'none',
                                outline: 'none',
                                backgroundColor: 'transparent',
                                color: '#ff6b6b',
                                fontSize: 15,
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontFamily: "'Inter', sans-serif",
                            }}
                            onPointerDown={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,107,107,0.15)')}
                            onPointerUp={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                handleDisconnect();
                            }}
                            onPointerLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <img src={menuDisconnectIcon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                            <span>Disconnect</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatusBanners: React.FC<{
    sensorStatus: SensorStatus;
    dismissed: Set<string>;
    onDismiss: (key: string) => void;
    isLandscape: boolean;
}> = ({ sensorStatus, dismissed, onDismiss, isLandscape }) => {
    const banners: { key: string; text: string; color: string }[] = [];

    if (sensorStatus === 'permission_denied' && !dismissed.has('sensor')) {
        banners.push({
            key: 'sensor',
            text: 'Motion sensor permission denied \u2014 tilt controls disabled',
            color: '#ef4444',
        });
    }
    if (sensorStatus === 'unavailable' && !dismissed.has('sensor')) {
        banners.push({
            key: 'sensor',
            text: 'Motion sensors not available on this device',
            color: '#f59e0b',
        });
    }

    if (banners.length === 0) return null;

    return (
        <div style={{
            position: 'absolute',
            bottom: isLandscape ? 8 : 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 150,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            pointerEvents: 'none',
            maxWidth: '90vw',
        }}>
            {banners.map(b => (
                <div key={b.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: 'rgba(0,0,0,0.75)',
                    borderLeft: `3px solid ${b.color}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    pointerEvents: 'auto',
                    backdropFilter: 'blur(4px)',
                }}>
                    <span style={{
                        color: '#fff',
                        fontSize: 13,
                        fontFamily: "'Inter', sans-serif",
                        flex: 1,
                        whiteSpace: 'nowrap',
                    }}>{b.text}</span>
                    <button
                        onClick={() => onDismiss(b.key)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: 16,
                            cursor: 'pointer',
                            padding: '0 4px',
                            lineHeight: 1,
                        }}
                    >\u2715</button>
                </div>
            ))}
        </div>
    );
};
