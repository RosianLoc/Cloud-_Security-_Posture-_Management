import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from 'react';
import { getDashboardSummary, getFindings, getSpamIps, remediateFinding } from './lib/api';

const navItems = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon, active: true },
  { id: 'assets', label: 'Assets', icon: LayersIcon },
  { id: 'alerts', label: 'Alerts', icon: BellIcon },
  { id: 'settings', label: 'Settings', icon: CogIcon }
];

const initialSummary = {
  security_score: 0,
  total_resources_scanned: 0,
  total_assets: 0,
  passed: 0,
  warning: 0,
  failed: 0,
  unknown: 0,
  open_findings: 0,
  resolved_findings: 0,
  last_updated: null
};

const severityOptions = ['All', 'Fail', 'Warning', 'Pass'];
const statusOptions = ['All', 'Open', 'Resolved'];

function App() {
const [search, setSearch] = useState('');
const [severity, setSeverity] = useState('All');
const [service, setService] = useState('All');
const [status, setStatus] = useState('All');
const [summary, setSummary] = useState(initialSummary);
const [findings, setFindings] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [actionFindingId, setActionFindingId] = useState('');
const [spamData, setSpamData] = useState(null);
const deferredSearch = useDeferredValue(search);
const [spamIps, setSpamIps] = useState([]);
const [spamLoading, setSpamLoading] = useState(true);

useEffect(() => {
    const controller = new AbortController();
    async function loadSpamIps() {
      setSpamLoading(true);
      try {
        const data = await getSpamIps(controller.signal);
       setSpamData(data);
      } catch (e) {
        if (e.name !== 'AbortError') setSpamIps([]);
      } finally {
        setSpamLoading(false);
      }
    }
    loadSpamIps();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const [summaryPayload, findingsPayload] = await Promise.all([
          getDashboardSummary(controller.signal),
          getFindings(controller.signal)
        ]);

        startTransition(() => {
          setSummary(summaryPayload.summary);
          setFindings(findingsPayload.findings);
        });
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message || 'Unable to load dashboard data.');
        }
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, []);

  const serviceOptions = useMemo(() => {
    const uniqueServices = Array.from(new Set(findings.map((item) => item.service)));
    return ['All', ...uniqueServices];
  }, [findings]);

  const distribution = useMemo(() => {
    const total = summary.passed + summary.warning + summary.failed + summary.unknown;

    return [
      {
        label: 'Pass',
        value: summary.passed,
        color: 'var(--mint)',
        muted: 'var(--mint-soft)',
        share: total ? Math.round((summary.passed / total) * 100) : 0
      },
      {
        label: 'Warning',
        value: summary.warning,
        color: 'var(--amber)',
        muted: 'var(--amber-soft)',
        share: total ? Math.round((summary.warning / total) * 100) : 0
      },
      {
        label: 'Fail',
        value: summary.failed,
        color: 'var(--coral)',
        muted: 'var(--coral-soft)',
        share: total ? Math.round((summary.failed / total) * 100) : 0
      },
      {
        label: 'Unknown',
        value: summary.unknown,
        color: 'var(--slate)',
        muted: 'var(--slate-soft)',
        share: total ? Math.round((summary.unknown / total) * 100) : 0
      }
    ];
  }, [summary]);

  const filteredFindings = useMemo(() => {
    return findings.filter((item) => {
      const matchesSearch =
        !deferredSearch ||
        item.title.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        item.time.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        item.rule_name.toLowerCase().includes(deferredSearch.toLowerCase());
      const matchesSeverity = severity === 'All' || item.severity === severity;
      const matchesService = service === 'All' || item.service === service;
      const matchesStatus = status === 'All' || item.status === status;

      return matchesSearch && matchesSeverity && matchesService && matchesStatus;
    });
  }, [findings, deferredSearch, severity, service, status]);

  const pieGradient = createPieGradient(distribution);
  const activityLabel = summary.resolved_findings
    ? `${summary.resolved_findings} resolved`
    : 'Awaiting review';

  async function handleRemediate(findingId) {
    setActionFindingId(findingId);
    setError('');

    try {
      await remediateFinding(findingId);
      const [summaryPayload, findingsPayload] = await Promise.all([
        getDashboardSummary(),
        getFindings()
      ]);

      startTransition(() => {
        setSummary(summaryPayload.summary);
        setFindings(findingsPayload.findings);
      });
    } catch (actionError) {
      setError(actionError.message || 'Unable to remediate the selected finding.');
    } finally {
      setActionFindingId('');
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <aside className="sidebar">
        <div className="sidebar-brand">
          <UserIcon />
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map(({ id, label, icon: Icon, active }) => (
            <button
              key={id}
              className={`nav-chip${active ? ' is-active' : ''}`}
              type="button"
              aria-label={label}
              title={label}
            >
              <Icon />
            </button>
          ))}
        </nav>
      </aside>

      <main className="dashboard">
        <header className="topbar panel">
          <div className="topbar-glow">
            <div className="topbar-copy">
              <span className="eyebrow">Cloud posture command center</span>
              <h1>Security Overview</h1>
            </div>

            <div className="topbar-actions">
              <button className="ghost-button" type="button">
                Local API
              </button>
              <button className="primary-button" type="button">
                Dashboard Online
              </button>
            </div>
          </div>
        </header>

        {!!error && (
          <div className="error-banner">
            <strong>Backend issue:</strong> {error}
          </div>
        )}

        <section className="stats-grid">
          <article className="panel metric-card score-card">
            <div className="card-header">
              <h2>Security Score</h2>
              <p>Realtime control posture</p>
            </div>

            <div className="score-content">
              <div
                className="progress-ring"
                style={{ '--progress': `${summary.security_score}%` }}
                aria-label={`Security score ${summary.security_score}%`}
              >
                <div className="progress-ring__inner">
                  <strong>{summary.security_score}/100%</strong>
                </div>
              </div>

              <span className="delta-pill">{activityLabel}</span>
            </div>
          </article>

          <article className="panel metric-card pie-card">
            <div className="card-header align-right">
              <div>
                <p className="eyebrow">Coverage breakdown</p>
              </div>
              <h2>Pie Chart</h2>
            </div>

            <div className="pie-card__body">
              <div className="pie-ring" style={{ '--pie-gradient': pieGradient }}>
                <div className="pie-ring__inner">
                  <strong>{summary.total_assets}</strong>
                  <span>Assets</span>
                </div>
              </div>

              <div className="legend-list">
                {distribution.slice(0, 3).map((item) => (
                  <div
                    key={item.label}
                    className="legend-item"
                    style={{ '--legend-color': item.color, '--legend-bg': item.muted }}
                  >
                    <span className="legend-dot" />
                    <span className="legend-text">
                      {item.label} {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="panel metric-card bar-card">
            <div className="card-header align-right">
              <div>
                <p className="eyebrow">Control status ratio</p>
              </div>
              <h2>Bar Chart</h2>
            </div>

            <div className="bar-chart">
              <div className="bar-chart__axis">
                <span>100</span>
                <span>50</span>
                <span>0</span>
              </div>

              <div className="bar-chart__plot">
                {distribution.map((item) => (
                  <div key={item.label} className="bar-column">
                    <div className="bar-rail">
                      <div
                        className="bar-fill"
                        style={{
                          '--bar-height': `${item.value > 0 ? Math.max(item.share, 6) : 0}%`,
                          '--bar-color': item.color,
                          '--bar-glow': item.muted
                        }}
                      />
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="panel findings-panel" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Spam IP Detection</h2>
            </div>
            {!spamLoading && spamData && (
              <span style={{
                background: spamData.current.length ? 'rgba(220,53,69,0.12)' : 'rgba(25,200,100,0.12)',
                color: spamData.current.length ? '#dc3545' : '#19c864',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {spamData.current.length
                  ? `${spamData.current.length} threat${spamData.current.length > 1 ? 's' : ''} detected`
                  : 'Clean'}
              </span>
            )}
          </div>

          {spamLoading && (
            <div className="loading-state">
              <ShieldIcon />
              <p>Scanning CloudWatch logs...</p>
            </div>
          )}

          {!spamLoading && spamData && (
            <>
              {spamData.current.length === 0 ? (
                <div className="empty-state">
                  <ShieldIcon />
                  <p>No spam IPs detected in this window.</p>
                </div>
              ) : (
                <div className="finding-list">
                  {spamData.current
                    .sort((a, b) => b.count - a.count)
                    .map((item, index) => (
                      <article key={item.ip} className="finding-row" style={{ animationDelay: `${index * 60}ms` }}>
                        <div className="finding-copy">
                          <h3 style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}>{item.ip}</h3>
                          <p>
                            {item.count} requests {' '}
                            {new Date(item.window_from).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            {' to '}
                            {new Date(item.window_to).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className="status-chip status-chip--fail">
                          {item.count > 10 ? 'Critical' : item.count > 5 ? 'High' : 'Medium'}
                        </span>
                        <button
                          type="button"
                          className="action-button"
                          onClick={() => navigator.clipboard?.writeText(item.ip)}
                        >
                          Copy IP
                        </button>
                      </article>
                    ))}
                </div>
              )}

              {/* History */}
              {spamData.history.length > 0 && (
                <details style={{ marginTop: '1rem' }}>
                  <summary style={{
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary, #aaa)',
                    cursor: 'pointer',
                    padding: '6px 0',
                    userSelect: 'none'
                  }}>
                    History · {spamData.history.length} entries
                  </summary>
                  <div className="finding-list" style={{ marginTop: '0.5rem' }}>
                    {spamData.history.map((entry) => (
                      <article key={entry.id} className="finding-row">
                        <div className="finding-copy">
                         
                            <h3 key={entry.ip} style={{ fontFamily: 'monospace', letterSpacing: '0.03em', marginBottom: '2px' }}>
                              {entry.ip}
                            </h3>
                        
                          <p>
                             {' from '}
                            {new Date(entry.window_from).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            {' to '}
                            {new Date(entry.window_to).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            {' day '}
                            {new Date(entry.window_from).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                        <span className="status-chip status-chip--fail">
                          {(`${entry.count} request`)}
                        </span>
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </section>
        <section className="panel findings-panel">
          <div className="search-shell">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search assets, rules, timestamps..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="filter-row">
            <FilterSelect
              label="Severity"
              value={severity}
              options={severityOptions}
              onChange={setSeverity}
            />
            <FilterSelect
              label="Service"
              value={service}
              options={serviceOptions}
              onChange={setService}
            />
            <FilterSelect
              label="Status"
              value={status}
              options={statusOptions}
              onChange={setStatus}
            />
          </div>

          <div className="results-meta">
            <span>
              Showing <strong>{filteredFindings.length}</strong> findings
            </span>
            <span className="inline-pill">
              {summary.last_updated
                ? `Last updated ${formatLastUpdated(summary.last_updated)}`
                : 'Waiting for backend'}
            </span>
          </div>

          <div className="finding-list">
            {loading && (
              <div className="loading-state">
                <ShieldIcon />
                <p>Loading live data from backend...</p>
              </div>
            )}

            {!loading &&
              filteredFindings.map((item, index) => (
                <article
                  key={item.id}
                  className="finding-row"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <div className="finding-copy">
                    <h3>{item.title}</h3>
                    <p>{item.time}</p>
                  </div>

                  <span className={`status-chip status-chip--${item.severity.toLowerCase()}`}>
                    {item.severity}
                  </span>

                  <button
                    type="button"
                    disabled={item.severity === 'Pass' || actionFindingId === item.id}
                    className={`action-button${item.severity === 'Pass' ? ' is-muted' : ''}`}
                    onClick={() => handleRemediate(item.id)}
                  >
                    {actionFindingId === item.id ? 'Applying...' : item.action}
                  </button>
                </article>
              ))}

            {!loading && !filteredFindings.length && (
              <div className="empty-state">
                <ShieldIcon />
                <p>No findings match your filters right now.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="filter-box">
      <span>{label}:</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function createPieGradient(items) {
  const total = items.reduce((accumulator, item) => accumulator + item.value, 0);

  if (!total) {
    return 'conic-gradient(var(--slate) 0deg 360deg)';
  }

  let current = 0;
  const stops = items
    .map((item) => {
      const next = current + (item.value / total) * 360;
      const stop = `${item.color} ${current}deg ${next}deg`;
      current = next;
      return stop;
    })
    .join(', ');

  return `conic-gradient(${stops})`;
}

function formatLastUpdated(timestamp) {
  const date = new Date(timestamp);

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false
  }).format(date);
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="4" width="6" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="18" width="6" height="2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 4 8 4-8 4-8-4 8-4Zm8 8-8 4-8-4m16 4-8 4-8-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 10a6 6 0 0 1 12 0v4l1.5 2.5H4.5L6 14Zm4 8a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 8.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5Zm8 3-.9-.2a7 7 0 0 0-.7-1.6l.5-.8a1 1 0 0 0-.1-1.2l-1.4-1.4a1 1 0 0 0-1.2-.1l-.8.5a7 7 0 0 0-1.6-.7l-.2-.9a1 1 0 0 0-1-.8h-2a1 1 0 0 0-1 .8l-.2.9a7 7 0 0 0-1.6.7l-.8-.5a1 1 0 0 0-1.2.1L5.2 7.7a1 1 0 0 0-.1 1.2l.5.8a7 7 0 0 0-.7 1.6l-.9.2a1 1 0 0 0-.8 1v2a1 1 0 0 0 .8 1l.9.2a7 7 0 0 0 .7 1.6l-.5.8a1 1 0 0 0 .1 1.2l1.4 1.4a1 1 0 0 0 1.2.1l.8-.5a7 7 0 0 0 1.6.7l.2.9a1 1 0 0 0 1 .8h2a1 1 0 0 0 1-.8l.2-.9a7 7 0 0 0 1.6-.7l.8.5a1 1 0 0 0 1.2-.1l1.4-1.4a1 1 0 0 0 .1-1.2l-.5-.8a7 7 0 0 0 .7-1.6l.9-.2a1 1 0 0 0 .8-1v-2a1 1 0 0 0-.8-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 5 6v5c0 4.5 2.9 8.6 7 10 4.1-1.4 7-5.5 7-10V6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default App;
