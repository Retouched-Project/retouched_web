// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useEffect, useMemo, useState } from 'react';
import type { BmRegistryInfo } from '../types';
import slotWifiUrl from '../assets/slotwifi.svg?url';
import serverUrl from '../assets/server.svg?url';
import hostUrl from '../assets/host.svg?url';
import checkmarkUrl from '../assets/checkmark.svg?url';
import crossUrl from '../assets/cross.svg?url';
import logoUrl from '../assets/retouched_logo.svg';

interface GamesTabProps {
    connected: boolean;
    connecting: boolean;
    gameInfos: BmRegistryInfo[];
    onJoinGame: (game: BmRegistryInfo) => void;
    error?: string;
    gamePort: number;
    needsSensorPermission: boolean;
    sensorPermissionGranted: boolean | null;
    onRequestSensorPermission: () => void;
}

const BadgedIcon: React.FC<{ mainSrc: string; positive: boolean }> = ({ mainSrc, positive }) => (
    <div style={styles.badgedIcon}>
        <img src={mainSrc} alt="" style={styles.badgedMain} />
        <img
            src={positive ? checkmarkUrl : crossUrl}
            alt=""
            style={styles.badgedBadge}
        />
    </div>
);

const BackgroundIcons: React.FC<{ connected: boolean; hasGames: boolean }> = ({ connected, hasGames }) => (
    <div style={styles.backgroundIcons} aria-hidden="true">
        <BadgedIcon mainSrc={serverUrl} positive={connected} />
        <BadgedIcon mainSrc={hostUrl} positive={hasGames} />
    </div>
);

const SensorPermissionButton: React.FC<{
    granted: boolean | null;
    onRequest: () => void;
}> = ({ granted, onRequest }) => {
    const isGranted = granted === true;
    return (
        <div style={styles.sensorPermissionBar}>
            <button
                onClick={onRequest}
                disabled={isGranted}
                style={{
                    ...styles.button,
                    backgroundColor: isGranted ? '#222' : '#333',
                    color: isGranted ? '#4caf50' : 'white',
                    opacity: isGranted ? 0.7 : 1,
                    width: '90%',
                    maxWidth: 400,
                }}
            >
                {isGranted ? 'Motion sensors enabled' : 'Enable motion sensors'}
            </button>
        </div>
    );
};

export const GamesTab: React.FC<GamesTabProps> = ({
    connected,
    connecting,
    gameInfos,
    onJoinGame,
    error,
    gamePort,
    needsSensorPermission,
    sensorPermissionGranted,
    onRequestSensorPermission,
}) => {
    console.log("Current Game Port:", gamePort);

    const hasGames = gameInfos.length > 0;

    const sensorButton = needsSensorPermission && (
        <SensorPermissionButton granted={sensorPermissionGranted} onRequest={onRequestSensorPermission} />
    );

    if (error) {
        return (
            <div style={styles.tabRoot}>
                <BackgroundIcons connected={connected} hasGames={hasGames} />
                <div style={styles.topMessage}>
                    <div style={{ color: '#ff5252', textAlign: 'center' }}>
                        <h3 style={{ margin: 0 }}>Connection Error</h3>
                        <p>{error}</p>
                    </div>
                </div>
                <div style={styles.bottomAction}>
                    <button onClick={() => window.location.reload()} style={styles.button}>
                        Retry
                    </button>
                </div>
                {sensorButton}
            </div>
        );
    }

    if (connecting) {
        return (
            <div style={styles.tabRoot}>
                <BackgroundIcons connected={connected} hasGames={hasGames} />
                <div style={styles.topMessage}>
                    <div className="spinner" style={styles.spinner}></div>
                    <p style={{ color: '#aaa', marginTop: 10 }}>Connecting to server...</p>
                </div>
                {sensorButton}
            </div>
        );
    }

    if (!connected) {
        return (
            <div style={styles.tabRoot}>
                <BackgroundIcons connected={connected} hasGames={hasGames} />
                <div style={styles.bottomAction}>
                    <button onClick={() => window.location.reload()} style={styles.button}>
                        Reconnect
                    </button>
                </div>
                {sensorButton}
            </div>
        );
    }

    if (!hasGames) {
        return (
            <div style={styles.tabRoot}>
                <BackgroundIcons connected={connected} hasGames={hasGames} />
                {sensorButton}
            </div>
        );
    }

    return (
        <div style={styles.tabRoot}>
            <BackgroundIcons connected={connected} hasGames={hasGames} />
            <div style={styles.listContainer}>
                {gameInfos.map((game) => (
                    <div
                        key={game.slotId}
                        style={styles.listItem}
                        onClick={() => {
                            if (game.maxPlayers !== undefined && game.maxPlayers > 0 && game.currentPlayers !== undefined && game.currentPlayers >= game.maxPlayers) {
                                alert("Game is full");
                                return;
                            }
                            onJoinGame(game);
                        }}
                    >
                        <div style={styles.iconContainer}>
                            <img
                                src={`/apps/icons/${game.appId}.png`}
                                alt={game.deviceName}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    if (img.src.endsWith(logoUrl)) return;
                                    img.src = logoUrl;
                                }}
                            />
                        </div>
                        <div style={styles.textContainer}>
                            <div style={styles.title}>{game.deviceName}</div>
                        </div>
                        <SlotWifiIcon slotId={game.slotId} currentPlayers={game.currentPlayers} maxPlayers={game.maxPlayers} />
                    </div>
                ))}
            </div>
            {needsSensorPermission && (
                <SensorPermissionButton granted={sensorPermissionGranted} onRequest={onRequestSensorPermission} />
            )}
        </div>
    );
};

const SlotWifiIcon: React.FC<{ slotId: number; currentPlayers: number; maxPlayers: number }> = ({ slotId, currentPlayers, maxPlayers }) => {
    const [svgText, setSvgText] = useState<string | null>(null);

    useEffect(() => {
        fetch(slotWifiUrl)
            .then(r => r.text())
            .then(setSvgText);
    }, []);

    const processedSvgText = useMemo(() => {
        if (!svgText) return null;
        const color = getSlotColor(slotId);
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const box = doc.getElementById("box");
        if (box) {
            box.style.fill = color;
            box.style.fillOpacity = '1';
        }
        return new XMLSerializer().serializeToString(doc);
    }, [svgText, slotId]);

    return (
        <div style={styles.slotContainer}>
            {processedSvgText && (
                <div
                    style={styles.slotSvg}
                    dangerouslySetInnerHTML={{ __html: processedSvgText }}
                />
            )}
            <span style={styles.playerCount}>{currentPlayers}/{maxPlayers}</span>
        </div>
    );
};

const getSlotColor = (slotId: number): string => {
    const colors = [
        '#666666',
        '#FF6900', '#FED000', '#FF2C9B', '#FF0066',
        '#D500FF', '#969C00', '#9B96CE', '#00CD97',
        '#009B00', '#00C9FF', '#112F68', '#8AFF00',
        '#D01300', '#76D061', '#7400FF'
    ];
    return colors[slotId] || '#666666';
};

const styles = {
    tabRoot: {
        position: 'relative' as const,
        width: '100%',
        height: '100%',
        overflow: 'hidden' as const,
    },
    backgroundIcons: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: '16px',
        opacity: 0.5,
        pointerEvents: 'none' as const,
        zIndex: 0,
    },
    badgedIcon: {
        position: 'relative' as const,
        width: 110,
        height: 110,
    },
    badgedMain: {
        width: '100%',
        height: '100%',
    },
    badgedBadge: {
        position: 'absolute' as const,
        right: -6,
        bottom: -6,
        width: 72,
        height: 72,
    },
    topMessage: {
        position: 'relative' as const,
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        textAlign: 'center' as const,
        padding: '40px 20px 20px 20px',
    },
    bottomAction: {
        position: 'absolute' as const,
        bottom: 30,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 1,
    },
    spinner: {
        width: 30,
        height: 30,
        border: '3px solid rgba(255,255,255,0.3)',
        borderRadius: '50%',
        borderTopColor: '#fff',
        animation: 'spin 1s ease-in-out infinite',
    },
    button: {
        padding: '10px 20px',
        backgroundColor: '#333',
        color: 'white',
        border: 'none',
        borderRadius: 5,
        cursor: 'pointer',
        fontSize: '1rem',
    },
    listContainer: {
        position: 'relative' as const,
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        width: '100%',
        height: '100%',
        overflowY: 'auto' as const,
    },
    listItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '15px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
    },
    iconContainer: {
        width: 48,
        height: 48,
        marginRight: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        flex: 1,
    },
    title: {
        color: '#fff',
        fontSize: '1rem',
        fontWeight: 500,
    },
    subtitle: {
        color: '#888',
        fontSize: '0.8rem',
        marginTop: 4,
    },
    slotContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    playerCount: {
        color: '#aaa',
        fontSize: '0.9rem',
    },
    slotSvg: {
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sensorPermissionBar: {
        position: 'absolute' as const,
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 2,
    },
};
