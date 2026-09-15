import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
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

type Page = 'today' | 'history' | 'settings';
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// Capture and remove the one-time fragment before React effects or any network request.
const initialPair = new URLSearchParams(window.location.hash.slice(1)).get('pair');
if (initialPair)
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
let pairingPromise: Promise<unknown> | undefined;
function pairOnce() {
  return (pairingPromise ??= request('/pair', {
    method: 'POST',
    body: JSON.stringify({ token: initialPair }),
  }));
}
function Illustration({ className = '' }: { className?: string }) {
  return <img className={className} src="/assets/quiet-desk.svg" alt="" aria-hidden="true" />;
}
function Brand() {
  return (
    <a className="brand" href="#today" aria-label="nemu home">
      <span>
        nemu
        <Leaf size={21} />
      </span>
      <small>your day, remembered softly.</small>
    </a>
  );
}
function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <aside className="sidebar">
      <Brand />
      <nav aria-label="Main navigation">
        {(
          [
            { id: 'today', label: 'Today', icon: Home },
            { id: 'history', label: 'History', icon: History },
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
        <div className="plant" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
        <p>
          a little less noise.
          <br />a little more presence.
        </p>
        <div className="private-label">
          <ShieldCheck size={14} /> private by nature
        </div>
        <span className="version">
          nemu v1 <span lang="ja">· ねむ</span>
        </span>
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
            <p>Look for ねむ in your menu bar.</p>
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
      jp: '使用時間',
      icon: Clock3,
      value: day ? duration(day.activeSeconds) : '—',
      detail: hasData
        ? `${Math.round((day!.activeSeconds / total) * 100)}% of recorded time`
        : 'Time with your foreground app',
      color: 'rose',
    },
    {
      title: 'Idle time',
      jp: '離席時間',
      icon: Coffee,
      value: day ? duration(day.idleSeconds) : '—',
      detail: hasData
        ? `${Math.round((day!.idleSeconds / total) * 100)}% of recorded time`
        : 'A little time away',
      color: 'sand',
    },
    {
      title: 'Longest session',
      jp: '最長セッション',
      icon: Star,
      value: day ? duration(day.longestSession.seconds) : '—',
      detail: day?.longestSession.appName
        ? `in ${day.longestSession.appName}`
        : 'One app, one stretch of time',
      color: 'gold',
    },
    {
      title: 'App switches',
      jp: 'アプリ切替',
      icon: ArrowRight,
      value: day ? String(day.appSwitches) : '—',
      detail: hasData ? 'Foreground app changes' : 'The little transitions',
      color: 'sage',
    },
  ];
  return (
    <section className="metrics" aria-label="Day summary">
      {items.map(({ title, jp, icon: Icon, value, detail, color }) => (
        <article className="metric" key={title}>
          <div className="metric-top">
            <span className={`metric-icon ${color}`}>
              <Icon size={21} strokeWidth={1.6} />
            </span>
            <span className="jp" lang="ja">
              {jp}
            </span>
          </div>
          <h2>{title}</h2>
          <strong className="metric-value">{value}</strong>
          <p>{detail}</p>
          <div className={`metric-rule ${color}`} aria-hidden="true" />
        </article>
      ))}
    </section>
  );
}
function TopApps({ day, onAll }: { day?: Day; onAll: () => void }) {
  const apps = day?.apps ?? [];
  return (
    <section className="panel apps-panel">
      <div className="panel-heading">
        <h2>
          Top apps <span lang="ja">よく使うアプリ</span>
        </h2>
        {apps.length > 5 && (
          <button className="text-button" onClick={onAll}>
            View all <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      <div className="table-head">
        <span>Application</span>
        <span>Active time</span>
        <span>Share</span>
      </div>
      {apps.length ? (
        <div className="app-rows">
          {apps.slice(0, 5).map((app, index) => (
            <div className="app-row" key={app.bundleId}>
              <span className="app-name">
                <span className={`app-avatar tone-${index % 4}`}>{app.name.slice(0, 1)}</span>
                {app.name}
              </span>
              <span>{duration(app.seconds)}</span>
              <span className="share">
                <span>{Math.round(app.percentage)}%</span>
                <i>
                  <b style={{ width: `${app.percentage}%` }} />
                </i>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-apps">
          <span className="empty-icon">
            <Monitor size={26} strokeWidth={1.2} />
          </span>
          <h3>A place for your everyday apps.</h3>
          <p>
            Your most-used apps will find their way here.
            <br />
            Only the app in front counts.
          </p>
          <div className="empty-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      )}
      <div className="panel-foot">
        <span className="small-dot" />
        Foreground time, simply observed.
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
        <h2>
          Timeline <span lang="ja">タイムライン</span>
        </h2>
        <span className="tag">{rows.length ? `${rows.length} moments` : 'Your day, in order'}</span>
      </div>
      {rows.length ? (
        <>
          <ol className="timeline">
            {rows.slice(0, expanded ? undefined : 8).map((row) => (
              <li key={row.id} className={row.kind === 'idle' ? 'idle-row' : ''}>
                <time>
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
          {rows.length > 8 && (
            <button className="text-button timeline-more" onClick={onExpand}>
              {expanded ? 'Show less' : 'See the whole day'} <ChevronDown size={15} />
            </button>
          )}
        </>
      ) : (
        <div className="empty-timeline">
          <div className="timeline-illustration" aria-hidden="true">
            <div className="dotted-line" />
            <span>
              <Sun size={17} />
            </span>
            <i />
            <i />
            <span>
              <Moon size={15} />
            </span>
          </div>
          <h3>
            {day?.archived ? 'The details have faded softly.' : 'Every day has its own rhythm.'}
          </h3>
          <p>
            {day?.archived ? (
              'Detailed timelines expire after 30 days. Your saved totals are still here.'
            ) : (
              <>
                Your apps, pauses, and little transitions
                <br />
                will appear here after a sync.
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
        <span className="eyebrow">A QUIETER KIND OF JOURNAL</span>
        <p>
          Not more to do.
          <br />
          Just a little room to reflect.
        </p>
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
export function App() {
  const [zone, setZone] = useState(browserZone);
  const [page, setPage] = useState<Page>('today');
  const [date, setDate] = useState(localDate());
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
  const selected = page === 'today' ? today : date;
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
  const title = page === 'settings' ? 'your space' : page === 'history' ? 'a look back' : 'today';
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
        <header className="hero">
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
              {page === 'history'
                ? 'a little space to remember.'
                : page === 'settings'
                  ? 'simple by design. private by nature.'
                  : 'make a little room for your day.'}
            </p>
            <h1>
              {title}
              <span lang="ja">
                {page === 'today' ? '今日' : page === 'history' ? '履歴' : '設定'}
              </span>
            </h1>
            <div className="date-line">
              {page === 'settings' ? 'Your journal. Your rhythm.' : formatted}
              {page === 'history' && (
                <input
                  aria-label="Choose a day"
                  type="date"
                  value={date}
                  max={today}
                  min={localDate(new Date(Date.now() - 365 * 86400000))}
                  onChange={(e) => {
                    if (e.target.value) setDate(e.target.value);
                  }}
                />
              )}
            </div>
          </div>
          <span className="hero-note">
            one day at a time <Leaf size={14} />
          </span>
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
              {state.kind === 'unpaired' && (
                <section className="connection-banner">
                  <span className="banner-icon">
                    <Link2 size={22} />
                  </span>
                  <div>
                    <h2>Your journal begins with a small connection.</h2>
                    <p>Pair your Mac to remember your digital day. No account needed.</p>
                  </div>
                  <button className="button primary" onClick={() => setPairOpen(true)}>
                    Pair your Mac <ArrowUpRight size={16} />
                  </button>
                </section>
              )}
              {state.kind === 'ready' && !hasData && (
                <section className="connection-banner listening">
                  <span className="banner-icon">
                    <Leaf size={23} />
                  </span>
                  <div>
                    <h2>
                      {page === 'today'
                        ? 'nemu is listening quietly.'
                        : 'A quiet page in your journal.'}
                    </h2>
                    <p>
                      {page === 'today'
                        ? 'Your day will appear after the next sync. Until then, make yourself at home.'
                        : 'There’s no uploaded activity for this day.'}
                    </p>
                  </div>
                  <span className="tag">
                    <span className="small-dot connected" />{' '}
                    {page === 'today' ? 'Paired with your Mac' : 'No activity'}
                  </span>
                </section>
              )}
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
              {state.kind === 'loading' && (
                <div className="loading-notice" role="status">
                  <LoaderCircle size={16} className="spin" />
                  {pairing ? 'Making a small connection…' : 'Opening your journal…'}
                </div>
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
              Made for a little peace of mind <span lang="ja">ねむ</span>
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
