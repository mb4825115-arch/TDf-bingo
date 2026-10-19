import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetBingoStateQueryKey,
  getSubscribeBingoEventsQueryKey,
  useGetBingoState,
  useResetBingoGame,
  useSelectBingoCards,
  useStartBingoGame,
  useSubscribeBingoEvents,
} from '@workspace/api-client-react';
import type { BingoCard, BingoGameState } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleHelp, Crown, Dices, LoaderCircle, Radio, RotateCcw, Search, Sparkles, Users, Volume2 } from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const COLUMNS = ['B', 'I', 'N', 'G', 'O'];
const PAGE_SIZE = 40;
type BingoContextValue = {
  sessionId: string;
  state?: BingoGameState;
  loading: boolean;
  error: boolean;
  retry: () => void;
  selected: number[];
  toggleCard: (cardNumber: number) => void;
  selectCards: () => Promise<void>;
  startRound: () => void;
  resetRound: () => void;
  selectionPending: boolean;
  startPending: boolean;
  resetPending: boolean;
  actionError: string;
  clearActionError: () => void;
  calledSet: Set<number>;
};
const BingoContext = createContext<BingoContextValue | null>(null);

function getSessionId() {
  try {
    const existing = localStorage.getItem('tdf-bingo-session');
    if (existing) return existing;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replaceAll('-', '')
      : `tdfbingo${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem('tdf-bingo-session', id);
    return id;
  } catch {
    return `tdfbingo${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function BingoProvider({ children }: { children: ReactNode }) {
  const [sessionId] = useState(getSessionId);
  const client = useQueryClient();
  const stateKey = useMemo(() => getGetBingoStateQueryKey({ sessionId }), [sessionId]);
  const eventKey = useMemo(() => getSubscribeBingoEventsQueryKey({ sessionId }), [sessionId]);
  const gameQuery = useGetBingoState({ sessionId }, {
    query: { queryKey: stateKey, retry: 1, refetchInterval: 12000 },
  });
  const snapshotQuery = useSubscribeBingoEvents({ sessionId }, {
    query: { queryKey: eventKey, retry: 1, refetchInterval: 15000 },
  });
  const [liveSnapshot, setLiveSnapshot] = useState<BingoGameState>();
  const [selected, setSelected] = useState<number[]>([]);
  const selectionInitialized = useRef(false);
  const [actionError, setActionError] = useState('');
  const selectMutation = useSelectBingoCards();
  const startMutation = useStartBingoGame();
  const resetMutation = useResetBingoGame();

  useEffect(() => {
    const snapshot = snapshotQuery.data;
    if (snapshot && typeof snapshot === 'object' && 'status' in snapshot) {
      setLiveSnapshot(snapshot as BingoGameState);
      client.setQueryData(stateKey, snapshot);
    }
  }, [snapshotQuery.data, client, stateKey]);

  useEffect(() => {
    if (!gameQuery.data || selectionInitialized.current) return;
    setSelected(gameQuery.data.myCardNumbers.slice());
    selectionInitialized.current = true;
  }, [gameQuery.data]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/bingo/events?sessionId=${encodeURIComponent(sessionId)}`);
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as BingoGameState | { state?: BingoGameState; data?: BingoGameState };
        const snapshot = ('status' in parsed ? parsed : parsed.state ?? parsed.data) as BingoGameState | undefined;
        if (snapshot?.status) {
          setLiveSnapshot(snapshot);
          client.setQueryData(stateKey, snapshot);
          setActionError('');
        }
      } catch {
        // Ignore keep-alives and non-JSON event frames; snapshot polling remains active.
      }
    };
    source.addEventListener('bingo', ((event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as BingoGameState | { state?: BingoGameState; data?: BingoGameState };
        const snapshot = ('status' in parsed ? parsed : parsed.state ?? parsed.data) as BingoGameState | undefined;
        if (snapshot?.status) {
          setLiveSnapshot(snapshot);
          client.setQueryData(stateKey, snapshot);
        }
      } catch {
        // Snapshot query is the reconnect fallback.
      }
    }) as EventListener);
    source.onerror = () => {
      // EventSource reconnects automatically; the generated snapshot hook also polls.
    };
    return () => source.close();
  }, [sessionId, client, stateKey]);

  const state = liveSnapshot ?? gameQuery.data;
  const toggleCard = (number: number) => {
    setSelected((current) => current.includes(number)
      ? current.filter((item) => item !== number)
      : current.length < 2 ? [...current, number].sort((a, b) => a - b) : current);
  };
  const selectCards = async () => {
    setActionError('');
    try {
      const updated = await selectMutation.mutateAsync({ data: { sessionId, cardNumbers: selected } });
      setLiveSnapshot(updated);
      client.setQueryData(stateKey, updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Those cards could not be reserved. Please try again.');
      throw error;
    }
  };
  const startRound = () => {
    setActionError('');
    startMutation.mutate({ data: { sessionId } }, {
      onSuccess: (updated) => {
        setLiveSnapshot(updated);
        client.setQueryData(stateKey, updated);
      },
      onError: (error) => setActionError(error instanceof Error ? error.message : 'The round could not start. Please try again.'),
    });
  };
  const resetRound = () => {
    setActionError('');
    resetMutation.mutate({ data: { sessionId } }, {
      onSuccess: (updated) => {
        setLiveSnapshot(updated);
        setSelected([]);
        client.setQueryData(stateKey, updated);
      },
      onError: (error) => setActionError(error instanceof Error ? error.message : 'The round could not be reset.'),
    });
  };
  const value: BingoContextValue = {
    sessionId, state, loading: gameQuery.isLoading, error: gameQuery.isError,
    retry: () => { void gameQuery.refetch(); void snapshotQuery.refetch(); },
    selected, toggleCard, selectCards, startRound, resetRound,
    selectionPending: selectMutation.isPending, startPending: startMutation.isPending, resetPending: resetMutation.isPending,
    actionError, clearActionError: () => setActionError(''),
    calledSet: useMemo(() => new Set(state?.calledNumbers ?? []), [state?.calledNumbers]),
  };
  return <BingoContext.Provider value={value}>{children}</BingoContext.Provider>;
}

function useBingo() {
  const value = useContext(BingoContext);
  if (!value) throw new Error('Bingo context is missing');
  return value;
}

function AppShell() {
  const [location] = useLocation();
  const { state, loading, error, retry } = useBingo();
  const isGame = location === '/game';
  useEffect(() => {
    const telegram = (window as Window & { Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } } }).Telegram?.WebApp;
    telegram?.ready?.();
    telegram?.expand?.();
  }, []);
  if (loading) return <LoadingScreen />;
  if (error && !state) return <ErrorScreen retry={retry} />;
  return (
    <main className="app-frame">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <Link href="/" className="brand" aria-label="TDf Bingo home" data-testid="link-brand-home">
          <span className="brand-mark"><span>TDf</span><i /></span>
          <span className="brand-name">BINGO<span>TOGETHER, EVERY CALL.</span></span>
        </Link>
        <div className="topbar-right">
          <span className="demo-label"><span className="demo-dot" /> DEMO ROOM</span>
          <span className="top-divider" />
          <button className="help-button" type="button" title="Demo room information" onClick={() => window.alert('TDf Bingo is a shared demo room. All Birr amounts shown are illustrative only; there are no deposits, charges, or payouts.')} data-testid="button-demo-info">
            <CircleHelp size={17} /><span>How it works</span>
          </button>
        </div>
      </header>
      <div className="mobile-session"><Radio size={14} /> ONE ROOM · ONE CALLER · EVERYONE TOGETHER</div>
      {isGame
        ? <GamePage />
        : <SelectionPage />}
      <footer className="site-foot">
        <span>TDf BINGO <i>•</i> MADE FOR THE ROOM</span>
        <span>Illustrative demo only · No deposits, charges, or payouts</span>
      </footer>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="app-frame loading-frame" aria-label="Loading bingo room">
      <header className="topbar"><div className="brand"><span className="brand-mark"><span>TDf</span><i /></span><span className="brand-name">BINGO</span></div><span className="demo-label"><span className="demo-dot" /> CONNECTING</span></header>
      <section className="loading-content"><div className="skeleton-kicker" /><div className="skeleton-title" /><div className="skeleton-copy" /><div className="skeleton-grid">{Array.from({ length: 15 }, (_, i) => <i key={i} />)}</div></section>
    </main>
  );
}

function ErrorScreen({ retry }: { retry: () => void }) {
  return <main className="app-frame"><header className="topbar"><div className="brand"><span className="brand-mark"><span>TDf</span><i /></span><span className="brand-name">BINGO</span></div></header><section className="error-card"><span className="error-mark">!</span><h1>We can’t reach the room.</h1><p>The shared bingo room didn’t respond. Your session is safe—try connecting again.</p><button className="button-primary" onClick={retry} data-testid="button-retry-room"><RotateCcw size={16} /> Try again</button></section></main>;
}

function SelectionPage() {
  const bingo = useBingo();
  const { state, selected, toggleCard, selectionPending, actionError, clearActionError, selectCards } = bingo;
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const reserved = useMemo(() => new Set(state?.reservedCardNumbers ?? []), [state?.reservedCardNumbers]);
  const filteredCards = useMemo(() => Array.from({ length: 400 }, (_, index) => index + 1)
    .filter((number) => !search || String(number).includes(search.trim()))
    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [search, page]);
  const totalPages = Math.max(1, Math.ceil((search ? Array.from({ length: 400 }, (_, i) => i + 1).filter((n) => String(n).includes(search.trim())).length : 400) / PAGE_SIZE));
  const activeSelection = state?.status !== 'waiting';
  const isAlreadyInRound = state?.myCardNumbers.length;
  const proceed = async () => {
    try {
      await selectCards();
      setLocation('/game');
    } catch {
      // Error is surfaced inline by the provider.
    }
  };
  return (
    <section className="selection-page">
      <div className="intro-copy">
        <p className="eyebrow"><span className="eyebrow-line" /> THE SHARED ROOM <span className="eyebrow-number">01 / 02</span></p>
        <h1>Pick your<br /><em>lucky cards.</em></h1>
        <p className="intro-description">Choose up to two cards. Then settle in—every player hears the very same caller, in the very same round.</p>
        <div className="live-note"><span className="pulse-dot" /> <span>One caller. One shared round.</span><Users size={15} /><b>Everybody plays together</b></div>
      </div>

      <div className="selection-layout">
        <div className="cards-panel">
          <div className="panel-heading">
            <div><span className="section-overline">YOUR SEAT</span><h2>Choose your cards</h2></div>
            <div className="selection-count"><b>{selected.length}</b><span> / 2<br />SELECTED</span></div>
          </div>
          {activeSelection && <div className="notice-strip"><Radio size={15} /> This round is already live. Your cards are shown below.</div>}
          <div className="card-finder">
            <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Find a card number" aria-label="Find a card number" data-testid="input-card-search" /><kbd>1 — 400</kbd></label>
            <span className="available-hint"><i /> Available</span>
          </div>
          <div className="number-grid" aria-label="Choose from card numbers 1 to 400">
            {filteredCards.map((number) => {
              const mine = (state?.myCardNumbers ?? []).includes(number);
              const chosen = selected.includes(number);
              const unavailable = reserved.has(number) && !mine;
              return <button key={number} type="button" className={`number-tile ${chosen ? 'is-selected' : ''} ${unavailable ? 'is-reserved' : ''}`} disabled={unavailable || activeSelection} onClick={() => toggleCard(number)} aria-pressed={chosen} title={unavailable ? `Card ${number} is already taken` : `Select card ${number}`} data-testid={`button-card-${number}`}>
                <span>{String(number).padStart(3, '0')}</span>{chosen && <Check size={13} />}
              </button>;
            })}
          </div>
          <div className="grid-footer">
            <span>{selected.length === 2 ? 'Two cards is the limit for this seat.' : 'You can choose one card or a pair.'}</span>
            <div className="pagination"><button type="button" aria-label="Previous cards" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} data-testid="button-previous-cards"><ChevronLeft size={16} /></button><span>{String(page + 1).padStart(2, '0')} <i>/</i> {String(totalPages).padStart(2, '0')}</span><button type="button" aria-label="Next cards" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} data-testid="button-next-cards"><ChevronRight size={16} /></button></div>
          </div>
        </div>

        <aside className="entry-panel">
          <div className="entry-panel-top"><span className="section-overline">THE ROUND POOL</span><span className="demo-stamp">DEMO ONLY</span></div>
          <div className="entry-amount"><span>Illustrative entry</span><strong>{state?.entryFeeBirr ?? 20}<small> Birr</small></strong><p>per card · no payment is collected</p></div>
          <div className="pool-value"><span>Displayed pool</span><strong>{(state?.displayedPoolBirr ?? 0).toLocaleString()} <small>Birr</small></strong><span className="pool-footnote">Demo total · {state?.selectedCardCount ?? 0} cards in the room</span></div>
          <div className="split-title">DISPLAY SPLIT <span>ILLUSTRATIVE</span></div>
          <div className="split-item"><div className="split-copy"><span className="split-swatch jackpot-swatch" />Jackpot <b>{state?.jackpotPercent ?? 80}%</b></div><div className="split-track"><i style={{ width: `${state?.jackpotPercent ?? 80}%` }} /></div><strong>{(state?.jackpotBirr ?? 0).toLocaleString()} <small>Birr</small></strong></div>
          <div className="split-item derash-split"><div className="split-copy"><span className="split-swatch derash-swatch" />Derash <b>{state?.derashPercent ?? 20}%</b></div><div className="split-track"><i style={{ width: `${state?.derashPercent ?? 20}%` }} /></div><strong>{(state?.derashBirr ?? 0).toLocaleString()} <small>Birr</small></strong></div>
          <div className="selected-cards">
            <span className="section-overline">YOUR PICK</span>
            {selected.length
              ? <div className="selected-chips">{selected.map((number) => <button type="button" key={number} onClick={() => !activeSelection && toggleCard(number)} disabled={activeSelection} aria-label={`Remove card ${number}`} data-testid={`button-remove-card-${number}`}>CARD {number} <i>×</i></button>)}</div>
              : <p>No cards selected yet.</p>}
          </div>
          {actionError && <p className="inline-error" role="alert">{actionError}<button type="button" onClick={clearActionError} aria-label="Dismiss error">×</button></p>}
          {activeSelection ? <button className="button-primary continue-button" onClick={() => setLocation('/game')} data-testid="button-view-round">View live round <ArrowRight size={17} /></button> :
            <button className="button-primary continue-button" onClick={proceed} disabled={!selected.length || selectionPending} data-testid="button-continue-game">
              {selectionPending ? <><LoaderCircle size={16} className="spin" /> Saving cards</> : <>{isAlreadyInRound ? 'Update my cards' : 'Continue to the room'} <ArrowRight size={17} /></>}
            </button>}
          <p className="entry-disclaimer">Demo only. No deposits, charges, or payouts. Displayed amounts are illustrative.</p>
        </aside>
      </div>
    </section>
  );
}

function GamePage() {
  const { state, calledSet, startRound, resetRound, startPending, resetPending, actionError, clearActionError } = useBingo();
  const [, setLocation] = useLocation();
  const [autoDabber, setAutoDabber] = useState(() => {
    try {
      const saved = localStorage.getItem('tdf-bingo-auto-dabber');
      return saved === null || saved === 'true';
    } catch { return true; }
  });
  const [recentNumber, setRecentNumber] = useState<number | null>(null);
  useEffect(() => {
    try { localStorage.setItem('tdf-bingo-auto-dabber', String(autoDabber)); } catch { /* optional preference */ }
  }, [autoDabber]);
  useEffect(() => {
    if (state?.currentNumber) setRecentNumber(state.currentNumber);
  }, [state?.currentNumber]);
  if (!state) return null;
  const called = state.calledNumbers;
  const isComplete = state.status === 'complete';
  const isWaiting = state.status === 'waiting';
  const callerLetter = state.currentNumber ? COLUMNS[Math.floor((state.currentNumber - 1) / 15)] : '—';
  return (
    <section className="game-page">
      <div className="game-heading">
        <div><button className="back-link" type="button" onClick={() => setLocation('/')} data-testid="button-back-to-cards"><ArrowLeft size={15} /> {state.status === 'waiting' ? 'EDIT CARDS' : 'MY CARDS'}</button>
          <p className="eyebrow"><span className="eyebrow-line" /> TDf BINGO <span className="eyebrow-number">02 / 02</span></p>
          <h1>{isComplete ? <>That’s a<br /><em>Bingo!</em></> : isWaiting ? <>The room is<br /><em>ready.</em></> : <>Listen for<br /><em>your number.</em></>}</h1>
          <p className="intro-description">{isComplete ? 'The shared round has ended. See which card called bingo.' : isWaiting ? 'Your cards are in. One tap starts the same live caller for everyone.' : 'One caller, one live round. Every player is following the same calls.'}</p>
        </div>
        <div className={`round-status ${isComplete ? 'status-complete' : isWaiting ? 'status-waiting' : ''}`}><span className={isWaiting ? 'status-dot waiting-dot' : 'status-dot'} />{isComplete ? 'ROUND COMPLETE' : isWaiting ? 'WAITING TO START' : 'CALLING LIVE'}<small>{called.length} <i>/</i> 75 CALLED</small></div>
      </div>

      {isComplete && <div className="winner-banner"><span className="winner-icon"><Crown size={21} /></span><div><span className="section-overline">THE SHARED ROUND IS COMPLETE</span><strong>{state.winnerCardNumbers.length ? `Bingo on card${state.winnerCardNumbers.length > 1 ? 's' : ''} ${state.winnerCardNumbers.join(', ')}` : 'All 75 numbers have been called'}</strong></div><span className="winner-count">{state.winnerCardNumbers.length ? `${state.winnerCardNumbers.length} WINNER${state.winnerCardNumbers.length > 1 ? 'S' : ''}` : '75 / 75'}</span></div>}
      {isWaiting && <div className="waiting-banner"><Sparkles size={18} /><span><b>Ready when you are.</b> Starting begins the shared caller for every player in this room.</span><button className="button-primary" onClick={startRound} disabled={startPending} data-testid="button-start-round">{startPending ? <><LoaderCircle size={15} className="spin" /> Starting</> : <>Start the round <ArrowRight size={16} /></>}</button></div>}
      {actionError && <p className="inline-error game-error" role="alert">{actionError}<button type="button" onClick={clearActionError} aria-label="Dismiss error">×</button></p>}

      <div className="game-layout">
        <div className="caller-column">
          <div className="caller-card">
            <div className="caller-topline"><span className="section-overline">THE SHARED CALLER</span><span className="caller-live"><span className="pulse-dot" /> {isWaiting ? 'ON STANDBY' : isComplete ? 'ROUND ENDED' : 'LIVE'}</span></div>
            <div className="caller-core">
              <div className={`caller-ball ${recentNumber ? 'has-number' : ''}`} key={recentNumber ?? 'empty'}>
                <span>{callerLetter}</span><strong>{state.currentNumber ?? '—'}</strong>
              </div>
              <div className="caller-prompt"><span>{isWaiting ? 'WAITING FOR THE ROOM' : isComplete ? 'FINAL CALL' : 'JUST CALLED'}</span><strong>{state.currentNumber ? `${callerLetter} — ${state.currentNumber}` : 'Caller is ready'}</strong><p>{state.currentNumber ? 'Dab it if it’s on your card.' : 'The first number will appear here.'}</p></div>
            </div>
            <div className="caller-footer"><span><Volume2 size={15} /> {state.drawIntervalSeconds}s between calls</span><span><Users size={15} /> Same calls for everyone</span></div>
          </div>
          <div className="history-card">
            <div className="history-heading"><div><span className="section-overline">THE CALL SHEET</span><h2>Numbers called</h2></div><span className="history-count">{called.length} <i>/ 75</i></span></div>
            <div className="bingo-board">
              {COLUMNS.map((letter, column) => <div className="board-column" key={letter}><div className={`board-letter letter-${letter.toLowerCase()}`}>{letter}</div>{Array.from({ length: 15 }, (_, row) => {
                const number = column * 15 + row + 1;
                const isCalled = calledSet.has(number);
                const isCurrent = state.currentNumber === number;
                return <div key={number} className={`board-number ${isCalled ? 'number-called' : ''} ${isCurrent ? 'number-current' : ''}`} data-testid={`number-called-${number}`}>{number}</div>;
              })}</div>)}
            </div>
            <div className="history-footnote"><span className="pulse-dot" /> Shared call sheet updates for the whole room</div>
          </div>
        </div>

        <aside className="play-column">
          <div className="pool-card">
            <div className="pool-card-heading"><span className="section-overline">ROUND POOL · DEMO ONLY</span><Dices size={17} /></div>
            <strong className="game-pool-total">{state.displayedPoolBirr.toLocaleString()} <small>Birr</small></strong>
            <span className="pool-footnote">Illustrative total · {state.selectedCardCount} cards in the room</span>
            <div className="game-split">
              <div className="game-split-row"><span><i className="split-swatch jackpot-swatch" /> Jackpot <b>{state.jackpotPercent}%</b></span><strong>{state.jackpotBirr.toLocaleString()} <small>Birr</small></strong></div>
              <div className="mini-track"><i style={{ width: `${state.jackpotPercent}%` }} /></div>
              <div className="game-split-row"><span><i className="split-swatch derash-swatch" /> Derash <b>{state.derashPercent}%</b></span><strong>{state.derashBirr.toLocaleString()} <small>Birr</small></strong></div>
              <div className="mini-track derash-track"><i style={{ width: `${state.derashPercent}%` }} /></div>
            </div>
            <p className="pool-disclaimer">Every amount is illustrative demo data only.</p>
          </div>

          <div className="my-cards-heading"><div><span className="section-overline">YOUR SEAT</span><h2>My cards <span>{state.myCards.length}</span></h2></div>
            {state.myCards.length > 0 && <button type="button" className={`auto-toggle ${autoDabber ? 'toggle-on' : ''}`} onClick={() => setAutoDabber(!autoDabber)} aria-pressed={autoDabber} data-testid="button-auto-dabber"><i /><span>Auto-dabber</span></button>}
          </div>
          {!state.myCards.length ? <div className="no-cards"><span className="no-cards-icon"><Dices size={22} /></span><strong>Your seat is waiting.</strong><p>Pick up to two cards to follow along with this round.</p><button className="text-link" onClick={() => setLocation('/')} data-testid="button-choose-cards">Choose cards <ArrowRight size={14} /></button></div> :
            <div className="my-card-list">{state.myCards.map((card) => <BingoCardView key={card.cardNumber} card={card} calledSet={calledSet} autoDabber={autoDabber} winner={state.winnerCardNumbers.includes(card.cardNumber)} />)}</div>}
          {isComplete && <button className="button-primary reset-button" onClick={resetRound} disabled={resetPending} data-testid="button-reset-round">{resetPending ? <><LoaderCircle size={15} className="spin" /> Resetting round</> : <>New shared round <RotateCcw size={15} /></>}</button>}
        </aside>
      </div>
    </section>
  );
}

function BingoCardView({ card, calledSet, autoDabber, winner }: { card: BingoCard; calledSet: Set<number>; autoDabber: boolean; winner: boolean }) {
  return (
    <article className={`bingo-card ${winner ? 'bingo-card-winner' : ''}`}>
      <div className="bingo-card-head"><span>CARD <b>{card.cardNumber}</b></span>{winner ? <span className="winner-tag"><Crown size={12} /> BINGO</span> : <span className="card-live-tag"><i /> IN PLAY</span>}</div>
      <div className="bingo-card-letters">{COLUMNS.map((letter) => <span key={letter}>{letter}</span>)}</div>
      <div className="bingo-cells">{card.numbers.map((number, index) => {
        const isFree = index === 12 || number === 0;
        const marked = isFree || (autoDabber && calledSet.has(number));
        return <div key={`${index}-${number}`} className={`bingo-cell ${isFree ? 'free-cell' : ''} ${marked ? 'dabbed-cell' : ''}`} data-testid={`card-${card.cardNumber}-cell-${index}`}>
          {isFree ? <span>FREE</span> : <>{number}{marked && <i className="dab-mark"><Check size={10} /></i>}</>}
        </div>;
      })}</div>
      {autoDabber && <div className="dabber-note"><span className="pulse-dot" /> Auto-dabber marks called numbers</div>}
    </article>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={SelectionPageRoute} /><Route path="/game" component={GamePageRoute} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function SelectionPageRoute() { return <AppShell />; }
function GamePageRoute() { return <AppShell />; }
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><BingoProvider><Router /></BingoProvider></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
