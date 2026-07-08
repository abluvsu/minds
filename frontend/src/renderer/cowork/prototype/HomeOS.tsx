import React, { useState, useEffect, useCallback } from 'react';
import { fetchSessions, fetchInFlightList } from '../api';

/**
 * HomeOS — AI Chief of Staff Home (Strangler Pattern Entry Point)
 *
 * Hybrid architecture:
 * - Callbacks (onSend, onSelectTask, onOpenSettings) come via props from App.jsx
 * - Display data (tasks, in-flight status) fetched directly from api.js
 */

// ── Types ────────────────────────────────────────────────────────────

interface HomeOSProps {
  onSend: (text: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenSettings: () => void;
  greeting?: string;
  agentLabel?: string;
}

interface TaskItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  messages: Array<{ role: string; content?: string }>;
  projectName: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Extract the last user message as a preview for tasks without a title. */
function taskPreview(task: TaskItem): string {
  if (task.title && task.title !== 'Untitled task') return task.title;
  const lastUser = [...(task.messages || [])].reverse().find((m) => m.role === 'user');
  if (lastUser?.content) {
    return lastUser.content.length > 80
      ? lastUser.content.slice(0, 77) + '…'
      : lastUser.content;
  }
  return 'Untitled task';
}

// ── Component ────────────────────────────────────────────────────────

export default function HomeOS({
  onSend,
  onSelectTask,
  onOpenSettings,
  greeting,
  agentLabel,
}: HomeOSProps) {
  const [taskIntent, setTaskIntent] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const label = agentLabel || 'Anton';
  const greetText = greeting || `${getTimeGreeting()}.`;

  // ── Data fetch ───────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const [sessions, inFlight] = await Promise.all([
        fetchSessions(),
        fetchInFlightList(),
      ]);
      if (Array.isArray(sessions)) setTasks(sessions as TaskItem[]);
      setInFlightIds(new Set(Array.isArray(inFlight) ? inFlight : []));
    } catch {
      // Silently fail — stale data is better than a crash
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // ── Derived state ────────────────────────────────────────────────

  const workingTasks = tasks.filter((t) => inFlightIds.has(t.id));
  const recentTasks = tasks
    .filter((t) => !inFlightIds.has(t.id))
    .slice(0, 5);
  // Inbox: tasks where the last message is from assistant asking for input
  // (heuristic: last message role === 'assistant' and task is NOT in-flight)
  const inboxTasks = tasks.filter((t) => {
    if (inFlightIds.has(t.id)) return false;
    const msgs = t.messages || [];
    if (msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    return last.role === 'assistant' || last.role === 'provider_required';
  }).slice(0, 5);

  // ── Send handler ─────────────────────────────────────────────────

  const handleDelegate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskIntent.trim()) return;
    onSend(taskIntent.trim());
    setTaskIntent('');
  };

  // ── Styles ───────────────────────────────────────────────────────

  const sidebarStyle: React.CSSProperties = {
    width: '280px', borderRight: '1px solid var(--border, #e5e5e5)',
    padding: '32px 24px', display: 'flex', flexDirection: 'column',
    backgroundColor: 'var(--bg-sidebar, #fafafa)',
  };

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: '8px', fontWeight: active ? 600 : 500,
    backgroundColor: active ? 'var(--bg-hover, #f5f5f5)' : 'transparent',
    color: active ? 'var(--text-primary, #171717)' : 'var(--text-muted, #737373)',
    display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
    cursor: 'pointer', transition: 'background-color 0.15s',
  });

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', height: '100%',
      backgroundColor: 'var(--bg-primary, #fafafa)',
      color: 'var(--text-primary, #171717)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div style={sidebarStyle}>
        <div style={{
          fontSize: '1.1rem', fontWeight: 600, marginBottom: '48px',
          letterSpacing: '-0.02em',
        }}>
          {label}{' '}
          <span style={{ color: 'var(--text-muted, #737373)', fontWeight: 400 }}>
            Chief of Staff
          </span>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={navItemStyle(true)}>Operating System</div>
          <div style={navItemStyle(false)} onClick={onOpenSettings}>
            Settings
          </div>
          {inboxTasks.length > 0 && (
            <div style={navItemStyle(false)}>
              AI Inbox{' '}
              <span style={{
                background: 'var(--text-primary, #000)', color: 'white',
                padding: '2px 6px', borderRadius: '100px', fontSize: '0.75rem',
              }}>
                {inboxTasks.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <div style={{
        flexGrow: 1, padding: '48px 80px', overflowY: 'auto',
        maxWidth: '900px', margin: '0 auto',
      }}>
        <h1 style={{
          fontSize: '2.2rem', fontWeight: 500,
          letterSpacing: '-0.03em', marginBottom: '12px',
        }}>
          {greetText}
        </h1>

        {loading ? (
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted, #737373)' }}>
            Loading your workspace…
          </p>
        ) : (
          <p style={{
            fontSize: '1.1rem', color: 'var(--text-muted, #737373)',
            marginBottom: '48px', lineHeight: 1.5,
          }}>
            {workingTasks.length > 0 ? (
              <>I am currently working on <b>{workingTasks.length} task{workingTasks.length !== 1 ? 's' : ''}</b>.</>
            ) : (
              <>No tasks running right now.</>
            )}
            {inboxTasks.length > 0 && (
              <>{' '}I need your input on <b>{inboxTasks.length} item{inboxTasks.length !== 1 ? 's' : ''}</b>.</>
            )}
          </p>
        )}

        {/* ── AI Inbox ──────────────────────────────────────── */}
        {inboxTasks.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <h3 style={{
              fontSize: '0.85rem', color: 'var(--text-muted, #737373)',
              fontWeight: 600, textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border, #e5e5e5)',
              paddingBottom: '8px', marginBottom: '16px',
            }}>
              AI Inbox (Waiting for you)
            </h3>

            {inboxTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'flex-start',
                  padding: '16px 0',
                  borderBottom: '1px solid var(--border-light, #f0f0f0)',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId((prev) => prev === task.id ? null : task.id)}
              >
                <div style={{
                  width: '24px', fontSize: '1.2rem', marginRight: '16px',
                  color: '#f59e0b',
                }}>
                  ⚠
                </div>
                <div style={{ flexGrow: 1 }}>
                  <div style={{
                    fontWeight: 500, fontSize: '1.05rem', marginBottom: '4px',
                  }}>
                    {taskPreview(task)}
                  </div>
                  <div style={{
                    fontSize: '0.9rem', color: 'var(--text-muted, #737373)',
                    display: 'flex', gap: '12px', alignItems: 'center',
                  }}>
                    <span style={{
                      fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                      fontWeight: 600, textTransform: 'uppercase' as const,
                      background: '#fef3c7', color: '#92400e',
                    }}>
                      Needs Input
                    </span>
                    <span>{relativeTime(task.updatedAt)}</span>
                  </div>

                  {expandedId === task.id && (
                    <div style={{
                      marginTop: '12px', padding: '16px',
                      background: 'var(--bg-hover, #f8f8f8)',
                      border: '1px solid var(--border, #e5e5e5)',
                      borderRadius: '8px', fontSize: '0.9rem',
                    }}>
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                        <button
                          style={{
                            padding: '6px 12px',
                            background: 'var(--text-primary, #000)', color: 'white',
                            border: 'none', borderRadius: '6px', cursor: 'pointer',
                          }}
                          onClick={(e) => { e.stopPropagation(); onSelectTask(task.id); }}
                        >
                          Open Task
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Currently Working ──────────────────────────────── */}
        {workingTasks.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <h3 style={{
              fontSize: '0.85rem', color: 'var(--text-muted, #737373)',
              fontWeight: 600, textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border, #e5e5e5)',
              paddingBottom: '8px', marginBottom: '16px',
            }}>
              Currently Working
            </h3>

            {workingTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'flex-start',
                  padding: '16px 0',
                  borderBottom: '1px solid var(--border-light, #f0f0f0)',
                  cursor: 'pointer',
                }}
                onClick={() => onSelectTask(task.id)}
              >
                <div style={{
                  width: '24px', fontSize: '1.2rem', marginRight: '16px',
                  color: 'var(--text-primary, #000)',
                }}>
                  ⟳
                </div>
                <div style={{ flexGrow: 1 }}>
                  <div style={{
                    fontWeight: 500, fontSize: '1.05rem', marginBottom: '4px',
                  }}>
                    {taskPreview(task)}
                  </div>
                  <div style={{
                    fontSize: '0.9rem', color: 'var(--text-muted, #737373)',
                    display: 'flex', gap: '12px', alignItems: 'center',
                  }}>
                    <span style={{
                      fontSize: '0.75rem', padding: '2px 6px',
                      background: 'var(--bg-hover, #e5e5e5)', borderRadius: '4px',
                    }}>
                      In Progress
                    </span>
                    <span>Started {relativeTime(task.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Recent Tasks ──────────────────────────────────── */}
        {recentTasks.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <h3 style={{
              fontSize: '0.85rem', color: 'var(--text-muted, #737373)',
              fontWeight: 600, textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border, #e5e5e5)',
              paddingBottom: '8px', marginBottom: '16px',
            }}>
              Recent
            </h3>

            {recentTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'flex-start',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border-light, #f0f0f0)',
                  cursor: 'pointer',
                }}
                onClick={() => onSelectTask(task.id)}
              >
                <div style={{ flexGrow: 1 }}>
                  <div style={{
                    fontWeight: 500, fontSize: '0.95rem', marginBottom: '2px',
                  }}>
                    {taskPreview(task)}
                  </div>
                  <div style={{
                    fontSize: '0.8rem', color: 'var(--text-muted, #737373)',
                  }}>
                    {relativeTime(task.updatedAt)}
                    {task.projectName ? ` · ${task.projectName}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty State ───────────────────────────────────── */}
        {!loading && tasks.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '64px 0',
            color: 'var(--text-muted, #737373)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🚀</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>
              No tasks yet
            </div>
            <div style={{ fontSize: '0.95rem', marginTop: '8px' }}>
              Type below to delegate your first task to {label}.
            </div>
          </div>
        )}
      </div>

      {/* ── Input Bar ───────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: '40px', left: '360px', right: '140px',
        background: 'var(--bg-primary, white)',
        border: '1px solid var(--border, #e5e5e5)', borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
        padding: '8px 16px',
      }}>
        <form onSubmit={handleDelegate} style={{ display: 'flex', width: '100%' }}>
          <input
            type="text"
            value={taskIntent}
            onChange={(e) => setTaskIntent(e.target.value)}
            placeholder="What do you need finished today?"
            style={{
              flexGrow: 1, border: 'none', padding: '12px',
              fontSize: '1.1rem', outline: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-primary, #171717)',
            }}
          />
          {taskIntent.trim() && (
            <button
              type="submit"
              style={{
                padding: '8px 16px', borderRadius: '8px',
                background: 'var(--text-primary, #000)', color: 'white',
                border: 'none', cursor: 'pointer', fontSize: '0.9rem',
                fontWeight: 500, alignSelf: 'center',
              }}
            >
              Delegate
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
