// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { useEffect, useState, useRef, useCallback } from 'react'
import './App.css'
import logo from './assets/retouched_logo_text.svg'
import { bmEngine } from "./bmEngine";
import { GameClient } from './gameClient';
import type { BmRegistryInfo } from './types';
import { GameSessionView } from './GameSessionView';
import { GamesTab } from './tabs/GamesTab';
import { OptionsTab } from './tabs/OptionsTab';
import { AboutTab } from './tabs/AboutTab';

export interface BmAppSettings {
  floatingDpadEnabled: boolean;
  smartWidescreenEnabled: boolean;
  capabilitiesOverride: number | null;
  preserveDpadDragEnabled: boolean;
}

const TTabs = ['games', 'options', 'about'] as const;
type TabName = typeof TTabs[number];

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('games');

  const [connected, setConnected] = useState(false);
  const [gameInfos, setGameInfos] = useState<BmRegistryInfo[]>([]);
  const [activeGame, setActiveGame] = useState<BmRegistryInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [gamePort, setGamePort] = useState<number>(0);

  const [floatingDpadEnabled, setFloatingDpadEnabled] = useState(() => {
    const saved = localStorage.getItem('floatingDpad');
    return saved !== null ? saved === 'true' : true;
  });
  const [smartWidescreenEnabled, setSmartWidescreenEnabled] = useState(() => {
    const saved = localStorage.getItem('smartWidescreen');
    return saved !== null ? saved === 'true' : false;
  });
  const [capabilitiesOverride, setCapabilitiesOverrideState] = useState<number | null>(() => {
    const saved = localStorage.getItem('capabilitiesOverride');
    return saved !== null ? JSON.parse(saved) : null;
  });
  const [preserveDpadDragEnabled, setPreserveDpadDragEnabled] = useState(() => {
    const saved = localStorage.getItem('preserveDpadDrag');
    return saved !== null ? saved === 'true' : false;
  });

  const gameClientRef = useRef<GameClient | null>(null);
  const [gameClient, setGameClient] = useState<GameClient | null>(null);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalDrag = useRef<boolean | null>(null);

  const joinLockRef = useRef<boolean>(false);

  const doConnect = useCallback(async () => {
    if (gameClientRef.current) {
      gameClientRef.current.close();
    }

    setConnecting(true);
    setError(undefined);

    const client = new GameClient();
    client.addListener((state) => {
      setConnected(state.connected);
      setGameInfos(state.games);
      setGamePort(state.port);
    });

    const savedCapsInit = localStorage.getItem('capabilitiesOverride');
    if (savedCapsInit !== null) {
      client.setCapabilitiesOverride(JSON.parse(savedCapsInit));
    }

    gameClientRef.current = client;
    setGameClient(client);

    try {
      await client.connect();
    } catch (e) {
      console.error("Connection failed", e);
      setError("Connection failed. Is the bridge running?");
      setConnecting(false);
    }
    setConnecting(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await bmEngine.init();
        console.log("WASM Initialized");

        if (cancelled) return;
        doConnect();

      } catch (e) {
        console.error("Failed to init WASM", e);
        if (!cancelled) setError("Failed to initialize WASM");
      }
    };
    init();

    const ensureFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => { });
      }
    };
    document.addEventListener('click', ensureFullscreen);
    document.addEventListener('touchstart', ensureFullscreen);

    return () => {
      cancelled = true;
      gameClientRef.current?.close();
      document.removeEventListener('click', ensureFullscreen);
      document.removeEventListener('touchstart', ensureFullscreen);
    };
  }, [doConnect]);

  useEffect(() => {
    localStorage.setItem('floatingDpad', String(floatingDpadEnabled));
  }, [floatingDpadEnabled]);

  useEffect(() => {
    localStorage.setItem('smartWidescreen', String(smartWidescreenEnabled));
  }, [smartWidescreenEnabled]);

  useEffect(() => {
    localStorage.setItem('preserveDpadDrag', String(preserveDpadDragEnabled));
  }, [preserveDpadDragEnabled]);

  const setCapabilitiesOverride = (v: number | null) => {
    setCapabilitiesOverrideState(v);
    localStorage.setItem('capabilitiesOverride', JSON.stringify(v));
    gameClientRef.current?.setCapabilitiesOverride(v);
  };


  const handleJoinGame = async (game: BmRegistryInfo) => {
    if (joinLockRef.current) return;
    if (!gameClientRef.current) return;
    try {
      await gameClientRef.current.joinGame(game);
      setActiveGame(game);
    } catch (e) {
      console.error("Failed to join game", e);
      alert("Failed to join game: " + e);
    }
  };

  const handleExitGame = () => {
    joinLockRef.current = true;
    setTimeout(() => {
      joinLockRef.current = false;
    }, 500);
    setActiveGame(null);
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartX.current = clientX;
    touchStartY.current = clientY;
    isHorizontalDrag.current = null;
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - touchStartX.current;
    const dy = clientY - touchStartY.current;

    if (isHorizontalDrag.current === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
        isHorizontalDrag.current = true;
      } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
        isHorizontalDrag.current = false;
      }
    }

    if (isHorizontalDrag.current) {
      setIsSwiping(true);
      const activeIdx = TTabs.indexOf(activeTab);
      let dampedDx = dx;
      if (activeIdx === 0 && dx > 0) dampedDx = dx * 0.3;
      if (activeIdx === TTabs.length - 1 && dx < 0) dampedDx = dx * 0.3;
      setSwipeOffset(dampedDx);
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current !== null && isHorizontalDrag.current) {
      const threshold = window.innerWidth * 0.15;
      const activeIdx = TTabs.indexOf(activeTab);

      if (swipeOffset < -threshold && activeIdx < TTabs.length - 1) {
        setActiveTab(TTabs[activeIdx + 1]);
      } else if (swipeOffset > threshold && activeIdx > 0) {
        setActiveTab(TTabs[activeIdx - 1]);
      }
    }

    setIsSwiping(false);
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalDrag.current = null;
  };

  if (activeGame && gameClient) {
    return (
      <GameSessionView
        client={gameClient}
        onDisconnect={handleExitGame}
        floatingDpadEnabled={floatingDpadEnabled}
        smartWidescreenEnabled={smartWidescreenEnabled}
        preserveDpadDragEnabled={preserveDpadDragEnabled}
      />
    );
  }

  return (
    <div className="app-container main-ui">
      <header className="app-header">
        <div className="logo">
          <img src={logo} alt="Retouched" className="logo-img" />
        </div>
        <div className="tab-bar" style={{ position: 'relative' }}>
          <button
            className={`tab ${activeTab === 'games' ? 'active' : ''}`}
            onClick={() => setActiveTab('games')}
          >
            <span className="tab-label">GAMES</span>
          </button>
          <button
            className={`tab ${activeTab === 'options' ? 'active' : ''}`}
            onClick={() => setActiveTab('options')}
          >
            <span className="tab-label">OPTIONS</span>
          </button>
          <button
            className={`tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <span className="tab-label">ABOUT</span>
          </button>

          {/* Sliding Tab Indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: `${100 / TTabs.length}%`,
              transform: `translateX(${TTabs.indexOf(activeTab) * 100}%)`,
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            <div style={{
              width: '60%',
              height: 3,
              backgroundColor: '#2196F3',
              borderRadius: '3px 3px 0 0'
            }} />
          </div>
        </div>
      </header>

      <main className="tab-content-wrapper">
        <div
          className="tab-swipe-container"
          style={{
            transform: `translateX(calc(${TTabs.indexOf(activeTab) * -100}% + ${swipeOffset}px))`,
            transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
        >
          <div className="tab-pane">
            <GamesTab
              connected={connected}
              connecting={connecting}
              gameInfos={gameInfos}
              onJoinGame={handleJoinGame}
              error={error}
              gamePort={gamePort}
            />
          </div>
          <div className="tab-pane">
            <OptionsTab
              floatingDpadEnabled={floatingDpadEnabled}
              setFloatingDpadEnabled={setFloatingDpadEnabled}
              smartWidescreenEnabled={smartWidescreenEnabled}
              setSmartWidescreenEnabled={setSmartWidescreenEnabled}
              capabilitiesOverride={capabilitiesOverride}
              setCapabilitiesOverride={setCapabilitiesOverride}
              preserveDpadDragEnabled={preserveDpadDragEnabled}
              setPreserveDpadDragEnabled={setPreserveDpadDragEnabled}
            />
          </div>
          <div className="tab-pane">
            <AboutTab />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
