// Dashboard views and pairing UI. Displayed activity always comes from the day API.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Clock3,
  Coffee,
  History,
  Home,
  Leaf,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Unplug,
  X,
} from 'lucide-react';
import { ApiError, duration, loadDay, localDate, request } from './api';
import type { Day, LoadState } from './types';

type Page = 'today' | 'settings';
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// Capture and remove the one-time fragment before React effects or any network request.
const initialPair = new URLSearchParams(window.location.hash.slice(1)).get('pair');
if (initialPair)
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
let pairingPromise: Promise<unknown> | undefined;
// Share one redemption request across repeated effects: pairing tokens can only be consumed once.
function pairOnce() {
  return (pairingPromise ??= request('/pair', {
    method: 'POST',
    body: JSON.stringify({ token: initialPair }),
  }));
}
// Keep supporting artwork replaceable without changing the dashboard layout.
function Illustration({ className = '' }: { className?: string }) {
  return <img className={className} src="/assets/quiet-desk.svg" alt="" aria-hidden="true" />;
}
function Brand({ onHome }: { onHome: () => void }) {
  return (
    <a
      className="brand"
      href="#today"
      onClick={(e) => {
        e.preventDefault();
        onHome();
      }}
      aria-label="nemu home"
    >
      <span>
        nemu
        <Leaf size={21} />
      </span>
      <small>
        a quieter day.
        <br />a little room to breathe.
      </small>
    </a>
  );
}
function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <aside className="sidebar">
      <Brand onHome={() => setPage('today')} />
      <nav aria-label="Main navigation">
        {(
          [
            { id: 'today', label: 'Today', icon: Home },
            { id: 'settings', label: 'Settings', icon: Settings },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? 'nav-item selected' : 'nav-item'}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            <Icon size={19} />
            {label}
            {page === id && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <p>one day at a time.</p>
        <Illustration className="sidebar-art" />
        <div className="private-label">
          <ShieldCheck size={14} /> private by nature
        </div>
        <span className="version">nemu v1</span>
      </div>
    </aside>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLDialogElement>('dialog');
    dialog?.showModal();
    return () => {
      dialog?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function PairHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="A small connection." onClose={onClose}>
      <p>Pair this browser with the nemu app on your Mac. No email or password needed.</p>
      <ol className="pair-steps">
        <li>
          <span>1</span>
          <div>
            <strong>Open nemu on your Mac</strong>
            <p>Look for nemu in your menu bar.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Choose “Pair this browser”</strong>
            <p>nemu opens a private, one-time pairing link.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Make yourself at home</strong>
            <p>Your day appears after the next hourly sync.</p>
          </div>
        </li>
      </ol>
      <div className="note">
        <LockKeyhole size={17} />
        Pairing links expire after 10 minutes and work once.
      </div>
      <button className="button primary full" onClick={onClose}>
        Got it <Check size={16} />
      </button>
    </Modal>
  );
}
function SummaryCards({ day, hasData }: { day?: Day; hasData: boolean }) {
  const total = (day?.activeSeconds ?? 0) + (day?.idleSeconds ?? 0);
  const items = [
    {
      title: 'Active time',
      icon: Clock3,
      value: day ? duration(day.activeSeconds) : '—',
      detail: hasData
        ? `${Math.round((day!.activeSeconds / total) * 100)}% of recorded time`
        : 'Foreground app time',
      color: 'rose',
    },
    {
      title: 'Idle time',
      icon: Coffee,
      value: day ? duration(day.idleSeconds) : '—',
      detail: hasData
        ? `${Math.round((day!.idleSeconds / total) * 100)}% of recorded time`
        : 'Time away from your Mac',
      color: 'sand',
    },
    {
      title: 'Longest session',
      icon: Star,
      value: day ? duration(day.longestSession.seconds) : '—',
      detail: day?.longestSession.appName
        ? `in ${day.longestSession.appName}`
        : 'Your longest app session',
      color: 'gold',
    },
    {
      title: 'App switches',
      icon: ArrowLeftRight,
      value: day ? String(day.appSwitches) : '—',
      detail: hasData ? 'Foreground app changes' : 'Foreground app changes',
      color: 'sage',
    },
  ];
  return (
    <section className="metrics" aria-label="Day summary">
      {items.map(({ title, icon: Icon, value, detail, color }) => (
        <article className="metric" key={title}>
          <div className="metric-top">
            <span className={`metric-icon ${color}`}>
              <Icon size={21} strokeWidth={1.6} />
            </span>
          </div>
          <h2>{title}</h2>
          <strong className="metric-value">{value}</strong>
          <p>{detail}</p>
        </article>
      ))}
    </section>
  );
}
// Ranking and bars describe uploaded foreground time; empty accounts keep the same table structure.
function TopApps({ day, onAll }: { day?: Day; onAll: () => void }) {
  const apps = day?.apps ?? [];
  return (
    <section className="panel apps-panel" aria-labelledby="top-apps-title">
      <div className="panel-heading">
        <h2 id="top-apps-title">Top apps</h2>
        {apps.length > 5 && (
          <button className="text-button" onClick={onAll}>
            View all <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      <div className="apps-table-wrap">
        <table className="apps-table">
          <caption className="sr-only">Applications ranked by active foreground time</caption>
          <thead>
            <tr>
              <th scope="col">
                <span aria-hidden="true">#</span>
                <span className="sr-only">Rank</span>
              </th>
              <th scope="col">App</th>
              <th scope="col">Active time</th>
              <th scope="col">%</th>
              <th scope="col">
                <span className="sr-only">Share of active time</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {apps.length ? (
              apps.slice(0, 5).map((app, index) => (
                <tr key={app.bundleId}>
                  <td className="rank">{index + 1}</td>
                  <th scope="row">{app.name}</th>
                  <td>{duration(app.seconds)}</td>
                  <td>{Math.round(app.percentage)}%</td>
                  <td className="share-track">
                    <span aria-hidden="true">
                      <i className={`tone-${index % 4}`} style={{ width: `${app.percentage}%` }} />
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="table-empty">
                  <Monitor size={22} strokeWidth={1.3} aria-hidden="true" />
                  <h3>Your everyday apps, gathered here.</h3>
                  <p>App names and time will appear after a sync.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-foot">
        <span className="small-dot" />
        Only the app in front counts.
      </div>
    </section>
  );
}
function Timeline({
  day,
  expanded,
  onExpand,
}: {
  day?: Day;
  expanded: boolean;
  onExpand: () => void;
}) {
  const rows = day?.timeline ?? [];
  return (
    <section className="panel timeline-panel">
      <div className="panel-heading">
        <h2>Timeline</h2>
        {rows.length > 8 && (
          <button className="text-button" onClick={onExpand}>
            {expanded ? 'Show less' : 'View all'}
          </button>
        )}
      </div>
      {rows.length ? (
        <>
          <ol className="timeline">
            {rows.slice(0, expanded ? undefined : 8).map((row) => (
              <li key={row.id} className={row.kind === 'idle' ? 'idle-row' : ''}>
                <time dateTime={row.startedAt}>
                  {new Date(row.startedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
                <div>
                  <span>
                    {row.kind === 'idle' ? (
                      <>
                        <Coffee size={14} /> Away from your Mac
                      </>
                    ) : (
                      row.appName
                    )}
                  </span>
                  <span>{duration(row.seconds)}</span>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="empty-timeline">
          <span className="empty-time-mark" aria-hidden="true">
            <Clock3 size={22} strokeWidth={1.3} />
          </span>
          <h3>
            {day?.archived ? 'The details have faded softly.' : 'A little space for your day.'}
          </h3>
          <p>
            {day?.archived ? (
              'Detailed timelines expire after 30 days. Your saved totals are still here.'
            ) : (
              <>
                Your apps and pauses, in order.
                <br />
                Here after your next sync.
              </>
            )}
          </p>
          <span className="waiting">
            <span className="small-dot" />{' '}
            {day?.archived ? 'Saved daily summary' : 'No activity recorded yet'}
          </span>
        </div>
      )}
      <div className="timeline-footer">
        <LockKeyhole size={13} /> App names and time. Nothing more.
      </div>
    </section>
  );
}
function Reflection() {
  return (
    <section className="reflection">
      <Illustration />
      <div>
        <h2>a little room to reflect.</h2>
        <p>Your day, remembered softly.</p>
        <span className="reflection-leaf">
          <i />
          <Leaf size={16} />
        </span>
      </div>
    </section>
  );
}
function SettingsPage({
  paired,
  onDisconnect,
  onPair,
  zone,
}: {
  paired: boolean;
  onDisconnect: () => void;
  onPair: () => void;
  zone: string;
}) {
  return (
    <section className="settings-content">
      <div className="panel setting-panel">
        <div className="panel-heading">
          <h2>A space that stays yours.</h2>
          <ShieldCheck size={21} />
        </div>
        <div className="setting-row">
          <div>
            <h3>This browser</h3>
            <p>
              {paired
                ? 'Connected to your Mac through a private browser session.'
                : 'Connect your Mac to start your journal.'}
            </p>
          </div>
          <button className="button" onClick={paired ? onDisconnect : onPair}>
            {paired ? 'Disconnect' : 'Pair your Mac'}
            <Link2 size={15} />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <h3>Calendar timezone</h3>
            <p>Days follow this browser’s local timezone.</p>
          </div>
          <span className="tag">{zone.replaceAll('_', ' ')}</span>
        </div>
        <div className="setting-row">
          <div>
            <h3>Recording & sync</h3>
            <p>
              Pause recording or choose Sync now from the nemu menu bar.
              <br />
              Automatic uploads happen once per hour.
            </p>
          </div>
          <Monitor size={23} />
        </div>
      </div>
      <div className="privacy-grid">
        <article className="panel">
          <Leaf size={24} />
          <h2>Only the essentials.</h2>
          <p>
            Application names, session times, and idle intervals. No screenshots, keystrokes, URLs,
            titles, or content.
          </p>
        </article>
        <article className="panel">
          <History size={24} />
          <h2>A short memory, by design.</h2>
          <p>
            Detailed activity expires after 30 days. Saved daily summaries expire after one year.
          </p>
        </article>
      </div>
      <p className="settings-fine">
        A long video without input may appear as idle after five minutes. Sleep time is excluded.
      </p>
    </section>
  );
}
// Pairing stays beneath the date, rather than taking a full-width row away from the journal.
function JournalNotice({
  state,
  pairing,
  onPair,
}: {
  state: LoadState;
  pairing: boolean;
  onPair: () => void;
}) {
  if (state.kind === 'unpaired')
    return (
      <div className="journal-notice">
        <p>Your journal is ready when you are.</p>
        <button className="text-button" onClick={onPair}>
          Pair your Mac <ArrowUpRight size={13} />
        </button>
      </div>
    );
  if (state.kind === 'loading')
    return (
      <div className="journal-notice" role="status">
        <LoaderCircle size={13} className="spin" />
        <p>{pairing ? 'Connecting your browser…' : 'Opening your journal…'}</p>
      </div>
    );
  if (state.kind === 'ready' && state.day.activeSeconds + state.day.idleSeconds === 0)
    return (
      <div className="journal-notice">
        <p>
          <span className="small-dot connected" /> nemu is listening quietly.
          <br />
          <span className="notice-detail">Your day will appear after the next sync.</span>
        </p>
      </div>
    );
  return null;
}
export function App() {
  const [zone, setZone] = useState(browserZone);
  const [page, setPage] = useState<Page>('today');
  const [today, setToday] = useState(localDate());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);
  const [pairOpen, setPairOpen] = useState(false);
  const [allApps, setAllApps] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pairing, setPairing] = useState(Boolean(initialPair));
  const [pairError, setPairError] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  useEffect(() => {
    const tick = window.setInterval(() => {
      setToday(localDate());
      setZone(browserZone());
    }, 30000);
    return () => clearInterval(tick);
  }, []);
  const selected = today;
  useEffect(() => {
    if (pairing) {
      pairOnce()
        .then(() => setPairing(false))
        .catch(() => {
          setPairError(true);
          setState({
            kind: 'error',
            message:
              'This pairing link has expired or was already used. Open a new link from nemu on your Mac.',
          });
          setPairing(false);
        });
      return;
    }
    if (pairError) return;
    // Cancel stale requests when the selected day changes so old results cannot replace the new view.
    const controller = new AbortController();
    setState({ kind: 'loading' });
    loadDay(selected, zone, controller.signal)
      .then((day) => setState({ kind: 'ready', day }))
      .catch((e) => {
        if (e.name === 'AbortError') return;
        if (e instanceof ApiError && e.status === 401) setState({ kind: 'unpaired' });
        else setState({ kind: 'error', message: e.message ?? 'Your journal couldn’t be loaded.' });
      });
    return () => controller.abort();
  }, [selected, zone, refresh, pairing, pairError]);
  useEffect(() => {
    // Refresh the hosted snapshot; this does not trigger an upload from the Mac.
    const refreshOnFocus = () => setRefresh((n) => n + 1);
    window.addEventListener('focus', refreshOnFocus);
    const timer = window.setInterval(refreshOnFocus, 300000);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      clearInterval(timer);
    };
  }, []);
  const day = state.kind === 'ready' ? state.day : undefined;
  const hasData = Boolean(day && day.activeSeconds + day.idleSeconds > 0);
  const paired = state.kind === 'ready';
  function navigate(p: Page) {
    setPage(p);
    setExpanded(false);
  }
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'good morning' : hour < 18 ? 'good afternoon' : 'good evening';
  const formatted = new Date(selected + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const title = page === 'settings' ? 'settings' : 'today';
  async function disconnect() {
    try {
      await request('/logout', { method: 'POST' });
      setState({ kind: 'unpaired' });
      setDisconnectOpen(false);
    } catch {
      setState({ kind: 'error', message: 'Couldn’t disconnect. Please try again.' });
      setDisconnectOpen(false);
    }
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar page={page} setPage={navigate} />
      <main id="main">
        <header className={`hero ${page === 'settings' ? 'settings-hero' : ''}`}>
          <Illustration className="hero-art" />
          <div className="hero-status">
            <span className={`small-dot ${paired ? 'connected' : ''}`} />
            <span>
              {pairing
                ? 'Pairing your browser…'
                : day?.lastSynced
                  ? `Last synced ${new Date(day.lastSynced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : paired
                    ? 'Waiting for the first sync'
                    : 'A quiet space for your day'}
            </span>
            <span className="status-divider" />
            <ShieldCheck size={15} />
          </div>
          <div className="hero-copy">
            <p className="greeting">
              {page === 'settings' ? 'a few things, just for you' : `${greeting},`}{' '}
              {hour < 18 ? <Sun size={16} /> : <Moon size={16} />}
            </p>
            <p className="greeting-sub">
              {page === 'settings'
                ? 'simple by design. private by nature.'
                : 'hope you have a peaceful day.'}
            </p>
            <h1>{title}</h1>
            <div className="date-line">
              {page === 'settings' ? 'Your journal. Your rhythm.' : formatted}
            </div>
            {page === 'today' && (
              <JournalNotice state={state} pairing={pairing} onPair={() => setPairOpen(true)} />
            )}
          </div>
        </header>
        <div className="content">
          {page === 'settings' ? (
            <SettingsPage
              zone={zone}
              paired={paired}
              onPair={() => setPairOpen(true)}
              onDisconnect={() => setDisconnectOpen(true)}
            />
          ) : (
            <>
              {state.kind === 'error' && (
                <section className="connection-banner error" role="alert">
                  <span className="banner-icon">
                    <Unplug size={22} />
                  </span>
                  <div>
                    <h2>Your journal is taking a moment.</h2>
                    <p>{state.message}</p>
                  </div>
                  <button
                    className="button"
                    onClick={() => {
                      if (pairError) setPairOpen(true);
                      else setRefresh((n) => n + 1);
                    }}
                  >
                    {pairError ? 'Pair again' : 'Try again'} <ArrowRight size={15} />
                  </button>
                </section>
              )}
              <SummaryCards day={day} hasData={hasData} />
              <div className="detail-grid">
                <div className="left-column">
                  <TopApps day={day} onAll={() => setAllApps(true)} />
                  <Reflection />
                </div>
                <Timeline day={day} expanded={expanded} onExpand={() => setExpanded((v) => !v)} />
              </div>
            </>
          )}
          <footer className="footer">
            <span>
              <Leaf size={13} /> your day, remembered softly.
            </span>
            <span>
              <ShieldCheck size={13} /> private by nature
            </span>
          </footer>
        </div>
      </main>
      {pairOpen && <PairHelp onClose={() => setPairOpen(false)} />}
      {allApps && day && (
        <Modal title="Your everyday apps" onClose={() => setAllApps(false)}>
          <div className="all-apps">
            {day.apps.map((a) => (
              <div key={a.bundleId}>
                <span>{a.name}</span>
                <strong>{duration(a.seconds)}</strong>
                <span>{Math.round(a.percentage)}%</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {disconnectOpen && (
        <Modal title="Disconnect this browser?" onClose={() => setDisconnectOpen(false)}>
          <p>
            Your Mac will keep recording. You can pair this browser again from the menu bar whenever
            you like.
          </p>
          <button className="button primary full" onClick={disconnect}>
            Disconnect browser <Unplug size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
