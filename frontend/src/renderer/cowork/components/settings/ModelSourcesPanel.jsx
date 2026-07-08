import { useEffect, useState } from 'react';
import Ico from '../Icons';
import {
  fetchProviderRegistry,
  createProviderEntry,
  updateProviderEntry,
  deleteProviderEntry,
  pingProviderEntry,
  fetchProviderEntryModels,
} from '../../api';

// Anthropic was removed as an addable source type
// (2026-07-04, user decision): Claude runs via the Claude Code CLI
// coworker (subscription, no API key).
const TYPE_LABELS = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  'openai-compatible': 'OpenAI-compatible (NVIDIA NIM, Groq, OpenRouter, …)',
};
const TYPES = Object.keys(TYPE_LABELS);
const NEEDS_BASE_URL = new Set(['openai-compatible']);

const rowStyle = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
  border: '1px solid var(--border-subtle)', borderRadius: 10, marginBottom: 8,
};
const inputStyle = {
  fontSize: 12.5, padding: '6px 8px', borderRadius: 6,
  border: '1px solid var(--border-subtle)', background: 'var(--surface)',
  color: 'var(--text-strong)', width: '100%',
};
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'block' };
const btn = { fontSize: 12, padding: '5px 10px' };

function EmptyForm(overrides = {}) {
  return {
    slug: '', type: 'openai-compatible', label: '', apiKey: '', baseUrl: '',
    models: '', priority: 100, ...overrides,
  };
}

export default function ModelSourcesPanel({ onChanged }) {
  const [entries, setEntries] = useState(null); // null = loading
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EmptyForm());
  const [busySlug, setBusySlug] = useState(null);
  const [status, setStatus] = useState({}); // slug -> { kind: 'ping'|'models'|'error', text }
  const [error, setError] = useState('');

  // Every mutation (create/update/delete/toggle) below calls this, not just
  // fetchProviderRegistry — App.jsx's composer model list is only refetched
  // on mount otherwise, so a provider added here wouldn't show up in the
  // picker until a full page reload.
  const refresh = () => fetchProviderRegistry().then(setEntries).then(() => onChanged?.());
  useEffect(() => { refresh(); }, []);

  const setEntryStatus = (slug, kind, text) =>
    setStatus((s) => ({ ...s, [slug]: { kind, text } }));

  const handlePing = async (slug) => {
    setBusySlug(slug);
    try {
      const r = await pingProviderEntry(slug);
      setEntryStatus(slug, 'ping', r.status === 'ok' ? 'Reachable' : `Failed — ${r.detail || ''}`);
    } catch (e) {
      setEntryStatus(slug, 'ping', `Failed — ${e.message}`);
    } finally {
      setBusySlug(null);
    }
  };

  const handleFetchModels = async (slug) => {
    setBusySlug(slug);
    try {
      const models = await fetchProviderEntryModels(slug);
      if (models && models.length > 0) {
        await updateProviderEntry(slug, { models });
        await refresh();
        setEntryStatus(slug, 'models', `Loaded ${models.length} models`);
      } else {
        setEntryStatus(slug, 'models', 'No models returned — check the key/URL, or enter model ids manually.');
      }
    } catch (e) {
      setEntryStatus(slug, 'models', `Failed — ${e.message}`);
    } finally {
      setBusySlug(null);
    }
  };

  const handleToggleEnabled = async (row) => {
    await updateProviderEntry(row.slug, { enabled: !row.enabled });
    refresh();
  };

  const handleDelete = async (slug) => {
    if (!window.confirm(`Remove '${slug}'? Conversations pinned to it will fall back to your other sources.`)) return;
    await deleteProviderEntry(slug);
    refresh();
  };

  const handlePriorityChange = async (slug, priority) => {
    await updateProviderEntry(slug, { priority: Number(priority) || 100 });
    refresh();
  };

  const handleCreate = async () => {
    setError('');
    const models = form.models.split(',').map((m) => m.trim()).filter(Boolean);
    if (!form.slug.trim()) { setError('Slug is required (e.g. "nvidia", "gemini-work").'); return; }
    if (!form.apiKey.trim()) { setError('API key is required.'); return; }
    if (NEEDS_BASE_URL.has(form.type) && !form.baseUrl.trim()) {
      setError(`${TYPE_LABELS[form.type]} needs a base URL.`);
      return;
    }
    try {
      await createProviderEntry({
        slug: form.slug.trim(),
        type: form.type,
        label: form.label.trim() || form.slug.trim(),
        apiKey: form.apiKey.trim(),
        baseUrl: form.baseUrl.trim() || null,
        models,
        priority: Number(form.priority) || 100,
      });
      setForm(EmptyForm());
      setAdding(false);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Model sources you've added here — each is one API key + model list. Add the same
        provider type more than once (e.g. two Gemini accounts) to double free-tier quota;
        the composer's model picker offers every model from every enabled source, and a
        turn automatically fails over to the next source if one is rate-limited or unreachable.
      </p>

      {entries === null && <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Loading…</p>}
      {entries && entries.length === 0 && !adding && (
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No model sources configured yet.</p>
      )}

      {entries && entries.map((row) => (
        <div key={row.slug} style={rowStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 13 }}>{row.label}</strong>{' '}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {TYPE_LABELS[row.type] || row.type} · {row.slug}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <input type="checkbox" checked={row.enabled} onChange={() => handleToggleEnabled(row)} />
              Enabled
            </label>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {row.hasApiKey ? 'Key configured' : 'No key set'}
            {row.baseUrl ? ` · ${row.baseUrl}` : ''}
          </div>

          <div style={{ fontSize: 11.5 }}>
            Models: {row.models.length > 0 ? row.models.join(', ') : <em>none — fetch or add below</em>}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11 }}>
              Priority (lower = tried first){' '}
              <input
                type="number"
                defaultValue={row.priority}
                onBlur={(e) => handlePriorityChange(row.slug, e.target.value)}
                style={{ ...inputStyle, width: 64, display: 'inline-block' }}
              />
            </label>
            <button type="button" className="btn-secondary" style={btn} disabled={busySlug === row.slug}
              onClick={() => handlePing(row.slug)}>Test connection</button>
            <button type="button" className="btn-secondary" style={btn} disabled={busySlug === row.slug}
              onClick={() => handleFetchModels(row.slug)}>Fetch live models</button>
            <button type="button" className="btn-secondary" style={btn} onClick={() => handleDelete(row.slug)}>
              {Ico.close(11)} Remove
            </button>
          </div>
          {status[row.slug] && (
            <div style={{ fontSize: 11, color: status[row.slug].text.startsWith('Failed') ? 'var(--danger)' : 'var(--text-muted)' }}>
              {status[row.slug].text}
            </div>
          )}
        </div>
      ))}

      {!adding && (
        <button type="button" className="btn-secondary" style={btn} onClick={() => setAdding(true)}>
          {Ico.plus(12)} Add model source
        </button>
      )}

      {adding && (
        <div style={rowStyle}>
          <div>
            <span style={labelStyle}>Type</span>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              style={inputStyle}
            >
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Slug (id used internally — lowercase, hyphens)</span>
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="e.g. nvidia, gemini-personal, gemini-work"
              style={inputStyle}
            />
          </div>
          <div>
            <span style={labelStyle}>Display label</span>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. NVIDIA NIM"
              style={inputStyle}
            />
          </div>
          <div>
            <span style={labelStyle}>API key</span>
            <input
              type="password"
              placeholder="paste key here"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              style={inputStyle}
            />
          </div>
          {form.type !== 'gemini' && (
            <div>
              <span style={labelStyle}>Base URL{form.type === 'openai-compatible' ? ' (required)' : ''}</span>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="e.g. https://integrate.api.nvidia.com/v1"
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <span style={labelStyle}>Models (comma-separated — you can fetch live ones after saving)</span>
            <input
              value={form.models}
              onChange={(e) => setForm((f) => ({ ...f, models: e.target.value }))}
              placeholder="e.g. meta/llama-3.3-70b-instruct"
              style={inputStyle}
            />
          </div>
          {error && <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" style={btn} onClick={handleCreate}>Save</button>
            <button type="button" className="btn-secondary" style={btn}
              onClick={() => { setAdding(false); setForm(EmptyForm()); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
