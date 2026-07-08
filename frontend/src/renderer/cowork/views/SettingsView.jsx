import { useState, useEffect, useRef, useId } from 'react';
import Ico from '../components/Icons';
import { validateSettings, revealSettingKey, testProviders, fetchHealth } from '../api';
import { providerTypeToKeyField, providerValueToType } from '../lib/settingsTransform';
import { ConfirmModal } from '../components/ConfirmModal';
import ModelSourcesPanel from '../components/settings/ModelSourcesPanel';
import CliAgentsPanel from '../components/settings/CliAgentsPanel';
import { host } from '../../platform/host';
import { SKINS, normalizeSkin } from '../../lib/skins';
import { getUIVersion, isElectron } from '../../platform/host';

// Provider preset → underlying canonical fields. The Settings UI uses
// hyphenated provider types; the API layer translates those to the
// server's enum values when saving.
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

const PROVIDER_PRESETS = [
  { value: 'anthropic',         label: 'Anthropic' },
  { value: 'openai',            label: 'OpenAI' },
  { value: 'gemini',            label: 'Gemini' },
  { value: 'openai-compatible', label: 'Compatible' },
];

// Default models we drop into the planning/coding fields when the user
// switches providers. Empty strings mean "user must fill in" (true for
// generic openai-compatible where the model name depends
// on the deployment).
const PROVIDER_DEFAULTS = {
  anthropic:           { planning: 'claude-sonnet-4-6', coding: 'claude-haiku-4-5-20251001' },
  openai:              { planning: 'gpt-5.5',           coding: 'gpt-5.5-mini' },
  gemini:              { planning: 'gemini-2.5-pro',    coding: 'gemini-2.5-flash' },
  'openai-compatible': { planning: '',                  coding: '' },
};

// Known model lists per provider — surfaced as quick-pick chips below
// the text input so users can swap models without typing.
const PROVIDER_MODELS = {
  anthropic:     ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  openai:        ['gpt-5.5', 'gpt-5.5-mini', 'o3', 'o4-mini'],
  gemini:        ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-flash-preview'],
};

// Per-provider credential relevance map. Drives the Required / Optional /
// Unused badges and the dimming of unrelated rows in the Credentials card.
const CREDENTIAL_RELEVANCE = {
  anthropic: {
    anthropicApiKey: 'required',
    openaiApiKey:    'unused',
    openaiBaseUrl:   'unused',
  },
  openai: {
    anthropicApiKey: 'unused',
    openaiApiKey:    'required',
    openaiBaseUrl:   'unused',
  },
  gemini: {
    anthropicApiKey: 'unused',
    openaiApiKey:    'required',
    openaiBaseUrl:   'auto',
  },
  'openai-compatible': {
    anthropicApiKey: 'unused',
    openaiApiKey:    'required',
    openaiBaseUrl:   'required',
  },
};

function inferProviderPreset(s) {
  const provider = s.planningProvider || 'anthropic';
  const baseUrl = (s.openaiBaseUrl || '').trim();
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  if (provider === 'openai-compatible' || provider === 'openai_compatible') {
    if (baseUrl.startsWith('https://generativelanguage.googleapis.com/')) return 'gemini';
    return 'openai-compatible';
  }
  return 'anthropic';
}

// True iff the credentials needed for `preset` are present in `s`.
function isProviderConfigured(preset, s) {
  const trim = (v) => (typeof v === 'string' ? v.trim() : '');
  if (preset === 'anthropic') return Boolean(trim(s.anthropicApiKey));
  if (preset === 'openai') return Boolean(trim(s.openaiApiKey));
  if (preset === 'gemini') return Boolean(trim(s.openaiApiKey));
  if (preset === 'openai-compatible') return Boolean(trim(s.openaiApiKey) && trim(s.openaiBaseUrl));
  return false;
}

function applyProviderPreset(preset, settings, setSetting) {
  if (preset === 'anthropic') {
    setSetting('planningProvider', 'anthropic');
    setSetting('codingProvider', 'anthropic');
  } else if (preset === 'openai') {
    setSetting('planningProvider', 'openai');
    setSetting('codingProvider', 'openai');
    setSetting('openaiBaseUrl', '');
  } else if (preset === 'gemini') {
    setSetting('planningProvider', 'openai-compatible');
    setSetting('codingProvider', 'openai-compatible');
    setSetting('openaiBaseUrl', GEMINI_BASE_URL);
  } else if (preset === 'openai-compatible') {
    setSetting('planningProvider', 'openai-compatible');
    setSetting('codingProvider', 'openai-compatible');
    if ((settings.openaiBaseUrl || '').startsWith('https://generativelanguage.googleapis.com/')) {
      setSetting('openaiBaseUrl', '');
    }
  }

  const recPair = settings.recommendedPair?.[preset];
  const defaults = recPair
    ? { planning: recPair[0] || '', coding: recPair[1] || '' }
    : (PROVIDER_DEFAULTS[preset] || { planning: '', coding: '' });
  setSetting('planningModel', defaults.planning);
  setSetting('defaultModel', defaults.planning);
  setSetting('codingModel', defaults.coding);
}

function Section({ title, subtitle, children }) {
  return (
    <div className="settings-section" style={{
      display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24,
      padding: '16px 0',
      alignItems: 'flex-start',
    }}>
      <div>
        <h3 style={{
          margin: 0, padding: 0,
          fontSize: 14, fontWeight: 600, color: 'var(--text-strong)',
          fontFamily: 'inherit', lineHeight: 1.3,
        }}>{title}</h3>
        {subtitle && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// Collapsible group of sections. Defaults to open; click the header to
// toggle. Uses the theme tokens so it reads well in light + dark.
function CollapsibleGroup({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const headingId = useId();
  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      background: 'var(--surface-glass)',
      WebkitBackdropFilter: 'blur(var(--surface-glass-blur))',
      backdropFilter: 'blur(var(--surface-glass-blur))',
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      {/* W3C "Accordion" pattern: heading wraps the toggle button so the
          group surfaces in SR heading navigation, while the button still
          owns interaction. h3 margin reset to keep the visual layout. */}
      <h2 id={headingId} style={{ margin: 0, padding: 0, fontWeight: 'inherit', fontSize: 'inherit' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 18px', background: 'transparent', border: 0,
            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{
            display: 'inline-flex', width: 14, height: 14,
            color: 'var(--text-muted)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 180ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}>{Ico.chevronRight ? Ico.chevronRight(12) : '›'}</span>
          <span style={{ flex: 1 }}>{title}</span>
        </button>
      </h2>
      {open && (
        <div id={panelId} role="region" aria-labelledby={headingId} style={{ padding: '0 18px 8px' }}>{children}</div>
      )}
    </div>
  );
}

function Segmented({ value, onChange, options, style, groupLabel }) {
  // Use radiogroup semantics when a label is supplied — AT announces the
  // group and reads each option's checked state. Without a label, fall
  // back to a plain group so AT users at least hear the boundary.
  const groupRole = groupLabel ? 'radiogroup' : 'group';
  return (
    <div
      className="segmented"
      role={groupRole}
      aria-label={groupLabel}
      style={style}
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'active' : ''}
            onClick={() => onChange(o.value)}
            title={o.title}
            aria-label={o.ariaLabel || o.title}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ value, onChange, title, ariaLabel }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      title={title}
      className={`toggle${value ? ' on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

function TextInput({ value, onChange, placeholder, title, ariaLabel }) {
  return (
    <input
      className="field-input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
    />
  );
}

// Drop-in for TextInput in Credentials rows. Adds a × button inside the
// field that empties the value — pairs with the trash icon on the API
// key fields so the whole Credentials card uses one clear gesture.
// Save settings still has to be clicked to commit the deletion to env.
function ClearableTextInput({ value, onChange, placeholder, ariaLabel }) {
  const v = value ?? '';
  const hasValue = v.length > 0;
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="field-input"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={hasValue ? { paddingRight: 36 } : undefined}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Clear (commits on Save settings)"
          aria-label="Clear value"
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 26, borderRadius: 6,
            border: 0, background: 'transparent', cursor: 'pointer',
            color: 'var(--ink-3)', padding: 0,
          }}
        >
          {Ico.close(13)}
        </button>
      )}
    </div>
  );
}

// Masked credential input. The backend returns "***" as a sentinel for
// stored keys (the real value never leaves disk on a plain GET), so the
// eye icon does two things:
//   (a) toggles the input type between password and text, and
//   (b) when revealing a sentinel and `revealName` is set, asks the
//       server for the real stored value via /settings/reveal-key.
// The fetched value is held in local component state — we never push it
// into the parent settings object, so saving an untouched revealed value
// still sends "***" and the server skips overwriting the stored key.
function ApiKeyInput({ value, onChange, placeholder, disabled, revealName }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealedValue, setRevealedValue] = useState(null); // null = no fetched override
  const [revealing, setRevealing] = useState(false);

  const stored = value ?? '';
  const isSentinel = stored === '***';
  // What the input renders. While the user hasn't toggled reveal we show
  // `stored` (typically "***" if the server has a key, or "" if not).
  // After a successful reveal we show the fetched value.
  const v = revealedValue ?? stored;
  const hasValue = v.length > 0;
  // Copy is gated on what the input is *displaying* — not the prop. After
  // a reveal, `v` is the real key (held locally; we never push it up to
  // the parent) so `stored` still equals "***" but the user can copy the
  // resolved value. Using `v === '***'` here keeps the "reveal first"
  // hint while the field still shows the masked sentinel.
  const isDisplayingSentinel = v === '***';
  const canCopy = hasValue && !isDisplayingSentinel;

  const onCopy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable in some browser sandboxes */
    }
  };

  const onToggleShow = async () => {
    if (!show && revealName && isSentinel && revealedValue === null) {
      // Reveal the real stored key from the loopback server.
      setRevealing(true);
      try {
        const real = await revealSettingKey(revealName);
        if (real) setRevealedValue(real);
      } finally {
        setRevealing(false);
      }
    }
    if (show) {
      // Going back to hidden — drop any fetched value so the next
      // reveal re-fetches (and we don't keep a plaintext key around).
      setRevealedValue(null);
    }
    setShow((s) => !s);
  };

  // If the user types, treat that as a fresh local edit. Clear any
  // revealed-from-server value and forward straight to the parent.
  const onInput = (next) => {
    if (revealedValue !== null) setRevealedValue(null);
    onChange(next);
  };

  // Trash → empty the field locally. The change only hits the server
  // on Save settings, where update_settings sees an empty string and
  // routes the key to its delete branch (`_stage_string_env` / the API
  // key block). Also resets reveal state so we don't keep a fetched
  // plaintext copy around.
  const onClearField = () => {
    setRevealedValue(null);
    setShow(false);
    onChange('');
  };

  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 26, borderRadius: 6,
    border: 0, background: 'transparent', cursor: 'pointer',
    color: 'var(--ink-3)', padding: 0,
  };
  const btnStyleActive = { ...btnStyle, color: 'var(--text-strong)', background: 'var(--surface-2, rgba(255,255,255,0.04))' };

  // When the field is holding the server sentinel and the user hasn't
  // toggled reveal, render the input as empty + a long bullet placeholder.
  // The literal "***" rendered as type=password is only 3 dots wide, which
  // looks like an almost-empty field rather than "a stored key is here."
  // Typing replaces the (empty) value cleanly — no asterisk contamination.
  const showSentinelAsMask = !show && v === '***';

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="field-input mono"
        type={show ? 'text' : 'password'}
        value={showSentinelAsMask ? '' : v}
        onChange={(e) => onInput(e.target.value)}
        placeholder={showSentinelAsMask ? '••••••••••••••••' : (placeholder || '••••••••••••••••••')}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label={revealName ? `${revealName} API key` : 'API key'}
        style={{ paddingRight: 108 }}
      />
      <div style={{
        position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
        display: 'inline-flex', alignItems: 'center', gap: 2,
      }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            onClick={onCopy}
            disabled={!canCopy}
            title={
              isDisplayingSentinel ? 'Reveal the key first to copy it'
              : copied              ? 'Copied'
              :                       'Copy to clipboard'
            }
            aria-label={copied ? 'Copied to clipboard' : 'Copy key to clipboard'}
            style={canCopy ? btnStyle : { ...btnStyle, opacity: 0.35, cursor: 'not-allowed' }}
          >
            {copied ? Ico.check(13) : Ico.copy(13)}
          </button>
          {copied && (
            <span
              role="status"
              aria-live="polite"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: '50%',
                padding: '3px 8px',
                fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#7CC4B6',
                background: 'rgba(20,28,28,0.92)',
                border: '1px solid rgba(124,196,182,0.45)',
                borderRadius: 6,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                animation: 'copied-pop 1.5s ease forwards',
                zIndex: 5,
              }}
            >Copied</span>
          )}
        </span>
        <button
          type="button"
          onClick={onToggleShow}
          disabled={revealing}
          title={show ? 'Hide key' : (revealing ? 'Revealing…' : 'Reveal key')}
          aria-label={show ? 'Hide key' : 'Reveal key'}
          aria-pressed={show}
          style={show ? btnStyleActive : btnStyle}
        >
          {show ? Ico.eyeOff(13) : Ico.eye(13)}
        </button>
        <button
          type="button"
          onClick={onClearField}
          disabled={!hasValue}
          title="Clear this key (commits on Save settings)"
          aria-label="Clear key"
          style={hasValue ? btnStyle : { ...btnStyle, opacity: 0.35, cursor: 'not-allowed' }}
        >
          {Ico.close(13)}
        </button>
      </div>
    </div>
  );
}

// Pill that hangs off a credential row's title to show whether the field
// is required, optional, auto-managed, or unused for the active provider.
// Drives the eye flow toward what matters for the current selection.
function RelevanceBadge({ status }) {
  if (!status || status === 'unused') return null;
  const palette = {
    required: { fg: '#E5B57A', bg: 'rgba(229,181,122,0.12)', bd: 'rgba(229,181,122,0.30)', label: 'Required' },
    optional: { fg: 'var(--text-muted)', bg: 'rgba(127,127,127,0.10)', bd: 'var(--border-subtle)', label: 'Optional' },
    auto:     { fg: 'var(--sage-500, #5d9287)', bg: 'rgba(93,146,135,0.12)', bd: 'rgba(93,146,135,0.30)', label: 'Auto' },
  }[status];
  if (!palette) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      marginLeft: 8, padding: '1px 7px',
      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: palette.fg, background: palette.bg,
      border: `1px solid ${palette.bd}`, borderRadius: 999,
      verticalAlign: 'middle',
    }}>{palette.label}</span>
  );
}

// Small green pill that confirms a credential is stored. Pairs with the
// Required / Optional relevance badge so users can answer two questions
// at a glance: "do I need this?" and "is it filled in?". Independent of
// reveal — driven purely by whether the field has a non-empty value
// (which for API keys means either the "***" sentinel from the server
// or a freshly typed key not yet saved).
//
// `active` lifts the badge visually when the credential is on the
// active provider's hot path (required / optional / auto-managed for
// this preset). Idle rows that just happen to still hold a value keep
// the muted look so the eye is drawn to what's currently in use.
function SetBadge({ hasValue, active }) {
  if (!hasValue) return null;
  return (
    <span
      title={active
        ? 'Stored and used by the active provider'
        : 'A value is stored, but the active provider does not use it'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        marginLeft: 8, padding: '1px 8px 1px 7px',
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: active ? '#7CC4B6' : 'var(--sage-500, #5d9287)',
        background: active ? 'rgba(124,196,182,0.18)' : 'rgba(93,146,135,0.10)',
        border: `1px solid ${active ? 'rgba(124,196,182,0.55)' : 'rgba(93,146,135,0.28)'}`,
        borderRadius: 999, verticalAlign: 'middle',
        // When active, the box-shadow comes from the set-badge-pulse
        // keyframes; the static value would never paint. When inactive
        // we explicitly clear any inherited shadow.
        boxShadow: active ? undefined : 'none',
        animation: active ? 'set-badge-pulse 2.4s ease-in-out infinite' : 'none',
        transition: 'box-shadow .2s ease, background .2s ease, color .2s ease',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 999,
        background: active ? '#7CC4B6' : 'var(--sage-500, #5d9287)',
        boxShadow: active
          ? '0 0 8px #7CC4B6, 0 0 14px rgba(124,196,182,0.6)'
          : '0 0 4px rgba(93,146,135,0.45)',
      }} />
      Set
    </span>
  );
}

// ───────────────────────── Multi-provider helpers ─────────────────────────

const PROVIDER_TYPE_ORDER = ['anthropic', 'openai', 'gemini', 'openai-compatible'];

const PROVIDER_TYPE_DESC = {
  anthropic: 'Use Claude models with your Anthropic API key.',
  openai: 'Use GPT models with your OpenAI API key.',
  gemini: 'Use Gemini models through Google\'s OpenAI-compatible endpoint.',
  'openai-compatible': 'Any OpenAI-compatible server (Ollama, vLLM, Together, Groq, etc).',
};

const GET_KEY_URL = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
  'openai-compatible': null,
};

function makeEmptyProvider(type) {
  const base = { type, apiKey: '', isDefault: false };
  if (type === 'openai-compatible') base.baseUrl = '';
  return base;
}

function dedupeByType(arr) {
  const map = {};
  for (const p of arr) map[p.type] = p;
  return Object.values(map);
}

function setOneDefault(arr, type) {
  return arr.map((p) => ({ ...p, isDefault: p.type === type }));
}

function ensureDefaultInvariant(arr) {
  if (!arr.length) return arr;
  if (arr.some((p) => p.isDefault)) {
    let found = false;
    return arr.map((p) => {
      if (p.isDefault && !found) { found = true; return p; }
      if (p.isDefault) return { ...p, isDefault: false };
      return p;
    });
  }
  return arr.map((p, i) => ({ ...p, isDefault: i === 0 }));
}

const PROVIDER_LABELS_LOCAL = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  'openai-compatible': 'OpenAI-compatible',
};

// Wrapper that dims a Section row when the credential is unused for the
// active provider. Built on the existing Section grid so layout stays
// consistent.
function CredentialRow({ title, subtitle, status, hasValue, children }) {
  const dimmed = status === 'unused';
  // The Set badge only glows when this credential is on the active
  // provider's actual auth path — i.e. the active preset *requires* it
  // (or auto-manages it). `optional` credentials and `unused` ones show
  // Set in a muted style so
  // the glow stays meaningful: "this is what's authenticating you now."
  const setActive = hasValue && (status === 'required' || status === 'auto');
  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 4 }}>
      {title}
      <RelevanceBadge status={status} />
      <SetBadge hasValue={hasValue} active={setActive} />
    </span>
  );
  return (
    <div style={{ opacity: dimmed ? 0.5 : 1, transition: 'opacity .15s ease' }}>
      <Section title={titleNode} subtitle={subtitle}>{children}</Section>
    </div>
  );
}

export default function SettingsView({ settings, setSetting, onSave, theme, onThemeChange, skin, onSkinChange, customTheme, onCustomThemeChange, agentLabel, onModelSourcesChanged }) {
  const [saved, setSaved] = useState(false);
  const [validation, setValidation] = useState(null);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  // Per-role "use a typed model id" flag. Sticky so picking Other…
  // keeps the text input visible even when the typed value is empty.
  const [modelInputMode, setModelInputMode] = useState({ planning: false, coding: false });
  const [uiVersion, setUiVersion] = useState('');
  const [serverVersion, setServerVersion] = useState('');
  useEffect(() => { getUIVersion().then(setUiVersion).catch(() => {}); }, []);
  useEffect(() => { fetchHealth().then((h) => setServerVersion(h?.server_version || '')).catch(() => {}); }, []);
  // Tracks whether any LLM-affecting setting changed since the last
  // successful Save. Used to skip provider tests on a no-op Save so a
  // user just toggling appearance doesn't pay the network round-trip.
  const [llmDirty, setLlmDirty] = useState(false);
  // Snapshot of the last-saved settings JSON. While `settings` matches
  // this snapshot the Save button reads "Saved" — flips back to "Save
  // settings" the moment the user changes anything.
  const [lastSavedJson, setLastSavedJson] = useState(null);
  const currentJson = JSON.stringify(settings);
  const settingsDirty = lastSavedJson !== null && currentJson !== lastSavedJson;
  // Ref-mirror of `settings` so the post-Save snapshot can read the
  // freshly-refetched value (the closure's `settings` is stale after
  // the await but the ref tracks every render).
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; });

  // First load: snapshot once `settings` is populated so the resting
  // state is "Saved" until the user touches anything.
  useEffect(() => {
    if (lastSavedJson === null && settings && Object.keys(settings).length > 0) {
      setLastSavedJson(currentJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJson]);
  const configReady = validation?.configReady ?? settings.configReady;
  const configError = validation?.configError || settings.configError;

  // Providers state — surfaced from the server, edited inline, committed
  // on Save settings. The save handler routes through the providers path
  // when `providers` is included on the patch.
  const providers = Array.isArray(settings.providers) ? settings.providers : [];
  const modelMode = settings.modelMode === 'custom' ? 'custom' : 'default';
  const overrides = settings.modelOverrides || {};
  const recommendedModels = settings.recommendedModels || {};
  const recommendedPair = settings.recommendedPair || {};
  const typeLabels = settings.providerTypeLabels || PROVIDER_LABELS_LOCAL;

  const updateProviders = (next) => setSetting('providers', dedupeByType(next));
  const availableTypesForAdd = PROVIDER_TYPE_ORDER.filter(
    (t) => !providers.some((p) => p.type === t),
  );

  const roleOverride = (role) => {
    if (modelMode !== 'custom') return null;
    const override = overrides[role];
    if (!override || typeof override !== 'object') return null;
    return { ...override, providerType: providerValueToType(override.providerType) };
  };
  const canonicalProviderForRole = (role) => providerValueToType(
    role === 'planning' ? settings.planningProvider : settings.codingProvider,
  ) || 'anthropic';
  const canonicalModelForRole = (role) => {
    if (role === 'planning') return settings.planningModel ?? settings.defaultModel ?? '';
    return settings.codingModel ?? '';
  };
  const roleProviderType = (role) => roleOverride(role)?.providerType || canonicalProviderForRole(role);
  const roleModelValue = (role, fallback = '') => {
    const override = roleOverride(role);
    if (override && Object.prototype.hasOwnProperty.call(override, 'model')) {
      return override.model || '';
    }
    return canonicalModelForRole(role) || fallback || '';
  };
  const setRoleDriver = (role, providerType, model) => {
    const normalizedType = providerValueToType(providerType) || 'anthropic';
    const nextModel = model || '';
    if (role === 'planning') {
      setSetting('planningProvider', normalizedType);
      setSetting('planningModel', nextModel);
      setSetting('defaultModel', nextModel);
    } else {
      setSetting('codingProvider', normalizedType);
      setSetting('codingModel', nextModel);
    }
  };

  // A provider is usable once it carries the credential it needs: an
  // API key for the hosted providers, or a base URL for an
  // OpenAI-compatible endpoint (key optional there). Mirrors the
  // server's _provider_configured. Note keys arrive masked ('***'),
  // which is still truthy — exactly what "has a key" should mean.
  const providerConfigured = (p) => (
    p.type === 'openai-compatible'
      ? !!(p.baseUrl || '').trim()
      : !!(p.apiKey || '').trim()
  );

  const defaultModeProviderType = (() => {
    const configured = providers.find(providerConfigured);
    return configured ? configured.type : 'anthropic';
  })();

  // Which provider types actually drive planning + coding right now.
  // Planning and coding can pick *different* providers, so the active
  // set is the union of both roles. A role with no explicit override
  // implicitly falls back to the default-mode provider (matches the
  // server's _resolve_role logic) — include that in the set so the
  // test still pings it. Used by the per-row dot, runProviderTests,
  // and the banner's effective-ready calculation.
  const activeProviderTypes = (() => {
    const types = new Set();
    if (modelMode === 'custom') {
      types.add(overrides.planning?.providerType || defaultModeProviderType);
      types.add(overrides.coding?.providerType   || defaultModeProviderType);
    } else {
      types.add(defaultModeProviderType);
    }
    return types;
  })();

  // Custom providers must carry a non-empty name. Pre-compute so the
  // Models dropdown can show the name and the Save button knows to
  // block when any custom row is missing one.
  const providerDisplayName = (p) => {
    if (p.type === 'openai-compatible') return (p.name || '').trim() || 'OpenAI-compatible';
    return typeLabels[p.type] || p.type;
  };
  const missingCustomNames = providers.some(
    (p) => p.type === 'openai-compatible' && !(p.name || '').trim(),
  );

  const googleOAuthClientId = settings.google_oauth_client_id ?? '';
  const googleOAuthClientSecret = settings.google_oauth_client_secret ?? '';
  const googleUnlockActive = Boolean(googleOAuthClientId.trim() && googleOAuthClientSecret.trim());
  // Auto-dismiss the status banner ~3s after a clean success. Failures
  // stay sticky so the user actually sees what's broken. Cancelled on
  // re-test by the dependency change.
  useEffect(() => {
    if (!bannerVisible || testing || !tested) return;
    const activeStatuses = Array.from(activeProviderTypes)
      .map((t) => (settings.providerStatus || {})[t] || 'untested');
    const allActiveOk = activeStatuses.length > 0 && activeStatuses.every((s) => s === 'ok');
    if (!(configReady && allActiveOk)) return;
    const t = setTimeout(() => setBannerVisible(false), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerVisible, testing, tested, configReady, settings.providerStatus]);

  const updateProviderField = (type, key, value) => {
    setLlmDirty(true);
    updateProviders(providers.map((p) => (p.type === type ? { ...p, [key]: value } : p)));
    // Sync provider card API keys to the individual settings so both
    // stay in sync. Without this, the providers JSON blob gets the new
    // key but the individual openai_api_key / anthropic_api_key
    // setting stays stale.
    if (key === 'apiKey' && value !== '***') {
      const settingKey = providerTypeToKeyField(type);
      if (settingKey) setSetting(settingKey, value);
    }
    if (key === 'baseUrl' && (type === 'openai-compatible' || type === 'gemini')) {
      setSetting('openaiBaseUrl', value);
    }
  };
  const addProviderOfType = (type) => {
    if (providers.some((p) => p.type === type)) return;
    setLlmDirty(true);
    updateProviders(providers.concat([makeEmptyProvider(type)]));
    setAddPickerOpen(false);
  };
  const removeProvider = (type) => {
    setLlmDirty(true);
    const next = providers.filter((p) => p.type !== type);
    updateProviders(next);
  };

  // Tests only the providers currently driving the planning + coding
  // roles. Each role contributes its driver (its custom override, or
  // the canonical role setting), so if planning picks Anthropic and
  // coding picks OpenAI, both get pinged. Inactive registered
  // providers keep their previous status (no point hammering OpenAI
  // when the user isn't using it). Sends the active providers' live
  // state so Test works on un-committed edits; the server merges
  // results into the persisted status map so dots survive a reload.
  const runProviderTests = async () => {
    const activeProviders = providers.filter((p) => activeProviderTypes.has(p.type));
    if (activeProviders.length === 0) return null;

    // Flip only the active providers' dots to the transient
    // "testing" state — preserve everyone else's persisted color.
    const pendingStatuses = { ...(settings.providerStatus || {}) };
    const pendingDetails  = { ...(settings.providerStatusDetails || {}) };
    for (const p of activeProviders) {
      pendingStatuses[p.type] = 'testing';
      delete pendingDetails[p.type];
    }
    setSetting('providerStatus', pendingStatuses);
    setSetting('providerStatusDetails', pendingDetails);

    const result = await testProviders(activeProviders);
    if (result && result.providerStatus) {
      setSetting('providerStatus', { ...pendingStatuses, ...result.providerStatus });
    }
    if (result && result.providerStatusDetails) {
      setSetting('providerStatusDetails', { ...pendingDetails, ...result.providerStatusDetails });
    }
    return result;
  };

  const save = async () => {
    // Save runs a validation pass so the banner reflects whether the
    // new config is usable. Provider tests only fire when the LLM
    // settings actually changed since the last Save — no point hitting
    // the network when the user just toggled the dot grid.
    const shouldTestLlm = llmDirty;
    setBannerVisible(true);
    setTesting(true);
    setTested(false);
    try {
      await onSave(settings);
      const tasks = [validateSettings()];
      if (shouldTestLlm) tasks.push(runProviderTests());
      const [result] = await Promise.all(tasks);
      setValidation(result);
      setTested(true);
      if (shouldTestLlm) setLlmDirty(false);
      // Snapshot the now-current settings so the Save button flips to
      // "Saved" until the user makes another edit. settingsRef tracks
      // the latest re-rendered value (the closure's `settings` is the
      // pre-save copy and stale by now).
      setLastSavedJson(JSON.stringify(settingsRef.current));
      setSaved(true);
      setTimeout(() => setTested(false), 2400);
    } catch (err) {
      setValidation({
        status: 'error',
        configReady: false,
        configError: err.message || 'Settings could not be saved.',
      });
      setSaved(false);
    } finally {
      setTesting(false);
    }
  };

  // Re-validate config against the server. Without explicit progress +
  // success states the button looks dead when the config was already
  // green (the banner has nothing to flip to), so we drive a brief
  // "Testing…" → "Tested" sequence on the button itself.
  const validate = async () => {
    if (testing) return;
    setBannerVisible(true);
    setTesting(true);
    setTested(false);
    try {
      const [result] = await Promise.all([
        validateSettings(),
        runProviderTests(),
      ]);
      setValidation(result);
      setTested(true);
      setTimeout(() => setTested(false), 2400);
    } catch (err) {
      setValidation({
        status: 'error',
        configReady: false,
        configError: err.message || 'Settings could not be validated.',
      });
    } finally {
      setTesting(false);
    }
  };

  const testButtonLabel = testing
    ? 'Testing…'
    : tested
      ? (<><span style={{ display: 'inline-flex', marginRight: 6, verticalAlign: 'middle' }}>{Ico.check(13)}</span>Tested</>)
      : 'Test';

  // Sign out: clears the persisted refresh token + every credential
  // in ~/.anton/.env (ANTON_TERMS_CONSENT and prefs stay), then
  // reloads so App.tsx re-routes the user to the onboarding flow.
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        position: 'relative', minHeight: 0,
      }}>
        <div className="scroll-clean settings-scroll" style={{
          flex: 1, overflowY: 'auto',
          padding: '28px 28px 96px',
        }}>
          <div style={{ maxWidth: 820 }}>
            <h1 className="page-title" style={{ marginTop: 0, marginBottom: 6 }}>Settings</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
              {`${agentLabel || 'Anton'} configuration and local desktop preferences.`}
            </div>

            {/* Status banner — only shown after Save or Test. While
                `testing` is true the banner enters a neutral "checking"
                state with a spinner; on success/failure it flips to the
                configured/needs-config palette and briefly pulses. The
                X button on the right dismisses the banner; the next
                Save or Test will re-open it. */}
            {bannerVisible && (() => {
              // Banner reflects only the providers actually driving
              // planning + coding (computed once at the component level).
              const activeTypes = Array.from(activeProviderTypes);
              const activeStatuses = activeTypes.map((t) => (settings.providerStatus || {})[t] || 'untested');
              const anyActiveFail = activeStatuses.some((s) => s === 'fail');
              const allActiveOk  = activeStatuses.length > 0 && activeStatuses.every((s) => s === 'ok');

              const effectiveReady = configReady && !anyActiveFail;

              const tone = testing
                ? { border: 'rgba(127,127,127,0.40)', bg: 'rgba(127,127,127,0.10)',
                    icoFg: 'var(--text-muted)', icoBg: 'rgba(127,127,127,0.16)' }
                : effectiveReady
                  ? { border: 'rgba(93,146,135,0.45)', bg: 'rgba(93,146,135,0.10)',
                      icoFg: 'var(--sage-500)', icoBg: 'rgba(93,146,135,0.16)' }
                  : { border: 'rgba(211,80,80,0.40)', bg: 'rgba(211,80,80,0.08)',
                      icoFg: '#E07060', icoBg: 'rgba(211,80,80,0.14)' };
              const title = testing
                ? 'Testing configuration…'
                : anyActiveFail
                  ? `${agentLabel || 'Anton'} needs a valid LLM provider and API key to work`
                  : tested
                    ? (effectiveReady ? `${agentLabel || 'Anton'} setup correctly` : 'Test failed')
                    : effectiveReady ? `${agentLabel || 'Anton'} setup correctly` : `${agentLabel || 'Anton'} needs configuration`;
              const subtitle = testing
                ? 'Talking to the active provider — hold on.'
                : anyActiveFail
                  ? 'The provider driving your planning or coding role failed its last test. Check the red row below.'
                  : (allActiveOk ? 'Active provider passed the test.' : (configError || 'Provider, model, and credentials are ready.'));
              const icon = testing
                ? (<span className="spinner" style={{ width: 15, height: 15 }} />)
                : effectiveReady ? Ico.check(15) : Ico.key(15);
              // Failure states use role="alert" (assertive) so AT users hear
              // them immediately; success/progress use role="status"
              // (polite) so they queue behind in-progress speech.
              const bannerRole = anyActiveFail || (tested && !effectiveReady) ? 'alert' : 'status';
              return (
                <div
                  role={bannerRole}
                  aria-live={bannerRole === 'alert' ? 'assertive' : 'polite'}
                  aria-atomic="true"
                  style={{
                    padding: 14, marginBottom: 22,
                    border: `1px solid ${tone.border}`,
                    background: tone.bg,
                    borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 12,
                    animation: tested && !testing ? 'set-badge-pulse 1.6s ease-out 1' : 'none',
                    transition: 'background .2s ease, border-color .2s ease',
                  }}
                >
                  <span aria-hidden="true" style={{
                    width: 30, height: 30, borderRadius: 8,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: tone.icoFg, background: tone.icoBg,
                    transition: 'background .2s ease, color .2s ease',
                  }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-strong)' }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={validate}
                    disabled={testing}
                    aria-busy={testing}
                    title="Re-run the configuration and active-provider tests."
                    style={testing ? { opacity: 0.7, cursor: 'progress' } : undefined}
                  >{testButtonLabel}</button>
                  <button
                    type="button"
                    onClick={() => setBannerVisible(false)}
                    disabled={testing}
                    title="Dismiss"
                    aria-label="Dismiss banner"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 8,
                      border: 0, background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: testing ? 'not-allowed' : 'pointer',
                      opacity: testing ? 0.4 : 1,
                    }}
                  >{Ico.close(13)}</button>
                </div>
              );
            })()}

            <CollapsibleGroup title="Google Sign-In (one-time unlock)">
              <Section
                title="Google Sign-In (one-time unlock)"
                subtitle="Provide a Google client ID and secret once so Google connectors can sign in with one click."
              >
                <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    1) Go to console.cloud.google.com, create or pick a project, and enable Gmail, Ads, Analytics, Drive, and Calendar APIs.
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    2) Open OAuth consent screen, choose External, and add yourself as a test user.
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    3) Create OAuth credentials → Desktop app, then paste the Client ID and Client secret here. Google may show an unverified app warning in test mode — click Continue, it is your own app.
                  </div>
                </div>
                {googleUnlockActive && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 999,
                    background: 'rgba(92, 184, 92, 0.12)',
                    border: '1px solid rgba(92, 184, 92, 0.24)',
                    color: '#295127',
                    marginBottom: 16,
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    Unlocked — Google connectors are one-click now
                  </div>
                )}
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>
                      Client ID
                    </div>
                    <ClearableTextInput
                      value={googleOAuthClientId}
                      onChange={(v) => setSetting('google_oauth_client_id', v)}
                      placeholder="Enter Google Client ID"
                      ariaLabel="Google client ID"
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>
                      Client secret
                    </div>
                    <ApiKeyInput
                      value={googleOAuthClientSecret}
                      onChange={(v) => setSetting('google_oauth_client_secret', v)}
                      placeholder="Enter Google Client secret"
                      revealName="google_oauth_client_secret"
                    />
                  </div>
                </div>
              </Section>
            </CollapsibleGroup>

            <CollapsibleGroup title="Model Sources">
              <ModelSourcesPanel onChanged={onModelSourcesChanged} />
            </CollapsibleGroup>

            <CollapsibleGroup title="CLI Agents">
              <CliAgentsPanel />
            </CollapsibleGroup>

            {/* The global Agent/Harness selector was removed (2026-07-03):
                execution choice is per-conversation via the composer's
                coworker picker (Settings = configuration, Conversation =
                execution choice). The backend `harness` setting remains
                only as the fallback default for API clients and channels
                that don't send a per-request harness. */}

            <CollapsibleGroup title="Appearance">
              <Section title="Theme" subtitle="Light or dark — also drives the animated background.">
                <Segmented
                  value={theme || 'dark'}
                  onChange={(v) => onThemeChange?.(v)}
                  groupLabel="Theme"
                  options={[
                    {
                      value: 'light',
                      label: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Ico.sun(13)} Light</span>),
                      ariaLabel: 'Light theme',
                      title: 'Use the light theme.',
                    },
                    {
                      value: 'dark',
                      label: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Ico.moon(13)} Dark</span>),
                      ariaLabel: 'Dark theme',
                      title: 'Use the dark theme.',
                    },
                  ]}
                />
              </Section>
              <Section title="Style" subtitle="Normal, 8-Bit, or design your own with Custom. Combines with light and dark.">
                <Segmented
                  value={normalizeSkin(skin)}
                  onChange={(v) => onSkinChange?.(v)}
                  groupLabel="Style"
                  options={SKINS.map((s) => ({
                    value: s.id,
                    label: s.icon && Ico[s.icon]
                      ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Ico[s.icon](13)} {s.label}</span>)
                      : s.label,
                    ariaLabel: `${s.label} style`,
                    title: s.title,
                  }))}
                />
              </Section>
              {normalizeSkin(skin) === 'custom' && customTheme && (
                <>
                  <Section title="Accent color" subtitle="Buttons, highlights, focus — the brand color of your theme.">
                    <input
                      type="color"
                      value={customTheme.accent}
                      onChange={(e) => onCustomThemeChange?.({ ...customTheme, accent: e.target.value })}
                      aria-label="Custom accent color"
                      style={{ width: 64, height: 32, padding: 2, border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer' }}
                    />
                  </Section>
                  <Section title="Background" subtitle="Pick a base color — surfaces and text shades derive from it — or follow the Light/Dark theme.">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        type="color"
                        value={customTheme.bg || (theme === 'light' ? '#fafafa' : '#080d18')}
                        onChange={(e) => onCustomThemeChange?.({ ...customTheme, bg: e.target.value })}
                        disabled={customTheme.bg === null}
                        aria-label="Custom background color"
                        style={{ width: 64, height: 32, padding: 2, border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', opacity: customTheme.bg === null ? 0.45 : 1 }}
                      />
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={customTheme.bg === null}
                          onChange={(e) => onCustomThemeChange?.({ ...customTheme, bg: e.target.checked ? null : (theme === 'light' ? '#fafafa' : '#080d18') })}
                        />
                        Follow Light/Dark
                      </label>
                    </div>
                  </Section>
                  <Section title="Corners" subtitle="How sharp the surfaces feel.">
                    <Segmented
                      value={String(customTheme.radius)}
                      onChange={(v) => onCustomThemeChange?.({ ...customTheme, radius: Number(v) })}
                      groupLabel="Corner radius"
                      options={[
                        { value: '0', label: 'Square', ariaLabel: 'Square corners', title: 'Sharp pixel corners.' },
                        { value: '6', label: 'Soft', ariaLabel: 'Soft corners', title: 'Gently rounded.' },
                        { value: '12', label: 'Round', ariaLabel: 'Round corners', title: 'Fully rounded.' },
                      ]}
                    />
                  </Section>
                  <Section title="Typeface" subtitle="Standard UI font, or mono everywhere for the terminal feel.">
                    <Segmented
                      value={customTheme.font}
                      onChange={(v) => onCustomThemeChange?.({ ...customTheme, font: v })}
                      groupLabel="Custom typeface"
                      options={[
                        { value: 'standard', label: 'Standard', ariaLabel: 'Standard font', title: 'Inter for UI text.' },
                        { value: 'mono', label: 'Mono', ariaLabel: 'Mono font', title: 'JetBrains Mono everywhere.' },
                      ]}
                    />
                  </Section>
                  <Section title="Scanlines" subtitle="A faint CRT scanline overlay across the app.">
                    <Toggle
                      value={customTheme.scanlines}
                      onChange={(v) => onCustomThemeChange?.({ ...customTheme, scanlines: v })}
                      title="Toggle the CRT scanline overlay."
                      ariaLabel="Scanline overlay"
                    />
                  </Section>
                </>
              )}
              <Section title="Greeting" subtitle="The line shown when you start a new task.">
                <TextInput
                  value={settings.greeting}
                  onChange={(v) => setSetting('greeting', v)}
                  title="Shown above the task input when you start a new task."
                  ariaLabel="Greeting text"
                />
              </Section>
              <div className="settings-hide-mobile">
                <Section title="Animated background" subtitle="Toggle off if you prefer a flat surface instead of an animated grid.">
                  <Toggle
                    value={settings.showDots}
                    onChange={(v) => setSetting('showDots', v)}
                    title="Toggle the animated grid background."
                    ariaLabel="Animated background"
                  />
                </Section>
                <Section title="Show nav-panel counters" subtitle="Badge counts on Projects / Scheduled / Artifacts / Connected apps, plus the time-since label on each Recent row.">
                  <Toggle
                    value={settings.showCounters !== false}
                    onChange={(v) => setSetting('showCounters', v)}
                    title="Show badge counts on Projects, Scheduled, Artifacts and Connected apps."
                    ariaLabel="Nav-panel counters"
                  />
                </Section>
              </div>
            </CollapsibleGroup>

            {/* Legacy single-provider Models + Credentials block kept
                here for the transition window while old installs migrate. */}
            {false && (() => {
              const activePreset = inferProviderPreset(settings);
              const activeLabel = PROVIDER_PRESETS.find((p) => p.value === activePreset)?.label || activePreset;
              const configuredForActive = isProviderConfigured(activePreset, settings);
              const relevance = CREDENTIAL_RELEVANCE[activePreset] || {};
              const quickPicks = PROVIDER_MODELS[activePreset] || [];
              const has = (field) => Boolean(String(settings[field] ?? '').trim());
              const ChipRow = ({ items, current, onPick }) => items.length === 0 ? null : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {items.map((m) => (
                    <button key={m} type="button" onClick={() => onPick(m)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '3px 8px', borderRadius: 999, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>{m}</button>
                  ))}
                </div>
              );
              return (
                <>
                  <CollapsibleGroup title="Models (legacy)">
                    {/* Provider row + active-state summary. The segmented
                        control spans the full row so the 5 presets fit on
                        one line instead of wrapping. */}
                    <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>Provider</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, maxWidth: 480 }}>
                            Drives planning + coding. Gemini is a preset that maps to OpenAI-compatible with the right base URL.
                          </div>
                        </div>
                        {/* Active-provider status pill */}
                        <div
                          title={configuredForActive ? 'Credentials present for this provider' : 'This provider is missing credentials'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '4px 10px', borderRadius: 999,
                            fontSize: 12, fontWeight: 600,
                            color: configuredForActive ? 'var(--sage-500, #5d9287)' : '#E07060',
                            background: configuredForActive ? 'rgba(93,146,135,0.10)' : 'rgba(211,80,80,0.08)',
                            border: `1px solid ${configuredForActive ? 'rgba(93,146,135,0.30)' : 'rgba(211,80,80,0.30)'}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{
                            width: 7, height: 7, borderRadius: 999,
                            background: configuredForActive ? 'var(--sage-500, #5d9287)' : '#E07060',
                            boxShadow: configuredForActive ? '0 0 6px rgba(93,146,135,0.6)' : 'none',
                          }} />
                          {activeLabel}
                          <span style={{ fontWeight: 500, color: 'inherit', opacity: 0.85 }}>
                            · {configuredForActive ? 'Active' : 'Needs key'}
                          </span>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <Segmented
                          value={activePreset}
                          onChange={(v) => applyProviderPreset(v, settings, setSetting)}
                          options={PROVIDER_PRESETS}
                          style={{ display: 'inline-flex', flexWrap: 'wrap' }}
                        />
                      </div>
                    </div>

                    <Section title="Planning model" subtitle="Used for reasoning, orchestration, and responses.">
                      <TextInput
                        value={settings.planningModel ?? settings.defaultModel ?? ''}
                        onChange={(v) => {
                          setSetting('planningModel', v);
                          setSetting('defaultModel', v);
                        }}
                        placeholder={recommendedPair[activePreset]?.[0] || PROVIDER_DEFAULTS[activePreset]?.planning || 'model-id'}
                      />
                      <ChipRow
                        items={quickPicks}
                        current={settings.planningModel ?? settings.defaultModel ?? ''}
                        onPick={(m) => { setSetting('planningModel', m); setSetting('defaultModel', m); }}
                      />
                    </Section>
                    <Section title="Coding model" subtitle="Used for scratchpad code generation.">
                      <TextInput
                        value={settings.codingModel ?? ''}
                        onChange={(v) => setSetting('codingModel', v)}
                        placeholder={recommendedPair[activePreset]?.[1] || PROVIDER_DEFAULTS[activePreset]?.coding || 'model-id'}
                      />
                      <ChipRow
                        items={quickPicks}
                        current={settings.codingModel ?? ''}
                        onPick={(m) => setSetting('codingModel', m)}
                      />
                    </Section>
                  </CollapsibleGroup>

                  <CollapsibleGroup title="Credentials">
                    <CredentialRow
                      title="Anthropic API key"
                      subtitle="Required for Claude models."
                      status={relevance.anthropicApiKey}
                      hasValue={has('anthropicApiKey')}
                    >
                      <ApiKeyInput
                        value={settings.anthropicApiKey ?? ''}
                        onChange={(v) => setSetting('anthropicApiKey', v)}
                        placeholder="sk-ant-••••••••"
                        revealName="anthropic"
                      />
                    </CredentialRow>
                    <CredentialRow
                      title="OpenAI API key"
                      subtitle="Required for GPT, Gemini, and OpenAI-compatible providers."
                      status={relevance.openaiApiKey}
                      hasValue={has('openaiApiKey')}
                    >
                      <ApiKeyInput
                        value={settings.openaiApiKey ?? ''}
                        onChange={(v) => setSetting('openaiApiKey', v)}
                        placeholder="sk-••••••••"
                        revealName="openai"
                      />
                    </CredentialRow>
                    <CredentialRow
                      title="OpenAI-compatible base URL"
                      subtitle={relevance.openaiBaseUrl === 'auto'
                        ? 'Auto-managed by the selected preset.'
                        : 'Required for OpenAI-compatible providers.'}
                      status={relevance.openaiBaseUrl}
                      hasValue={has('openaiBaseUrl')}
                    >
                      <ClearableTextInput
                        value={settings.openaiBaseUrl ?? ''}
                        onChange={(v) => setSetting('openaiBaseUrl', v)}
                        placeholder="https://example.com/v1"
                      />
                    </CredentialRow>
                  </CollapsibleGroup>
                </>
              );
            })()}

            <CollapsibleGroup title="Memory" defaultOpen={false}>
              <Section title="Memory mode" subtitle={`How ${agentLabel || 'Anton'} updates its long-term memory.`}>
                <Segmented
                  value={settings.memoryMode ?? 'autopilot'}
                  onChange={(v) => setSetting('memoryMode', v)}
                  groupLabel="Memory mode"
                  options={[
                    { value: 'autopilot', label: 'Autopilot', title: `${agentLabel || 'Anton'} updates long-term memory automatically.` },
                    { value: 'copilot',   label: 'Copilot',   title: `${agentLabel || 'Anton'} suggests memory updates for you to confirm.` },
                    { value: 'off',       label: 'Off',       title: 'Disable long-term memory updates.' },
                  ]}
                />
              </Section>
              <Section title="Episodic memory" subtitle="Save conversation history for future recall.">
                <Toggle
                  value={settings.episodicMemory ?? true}
                  onChange={(v) => setSetting('episodicMemory', v)}
                  title={`Save conversation history so ${agentLabel || 'Anton'} can recall past tasks.`}
                  ariaLabel="Episodic memory"
                />
              </Section>
              <Section title="Proactive dashboards" subtitle="Auto-generate HTML reports from scratchpad output.">
                <Toggle
                  value={settings.proactiveDashboards ?? false}
                  onChange={(v) => setSetting('proactiveDashboards', v)}
                  title="Auto-generate HTML reports from scratchpad output."
                  ariaLabel="Proactive dashboards"
                />
              </Section>
            </CollapsibleGroup>

            <CollapsibleGroup title="Updates" defaultOpen={false}>
              <Section
                title="Current version"
                subtitle="The app, UI bundle, and server versions currently running."
              >
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 12.5,
                  color: 'var(--text-strong)',
                }}>
                  <span>
                    <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>App</span>
                    {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}
                  </span>
                  {isElectron && uiVersion && uiVersion !== 'bundled' && uiVersion !== 'web' && (
                    <span>
                      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>UI</span>
                      {uiVersion}
                      {uiVersion !== (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '') && (
                        <span style={{ color: 'var(--text-warning, #c49000)', marginLeft: 6, fontSize: 11 }}>
                          (differs from app)
                        </span>
                      )}
                    </span>
                  )}
                  {isElectron && uiVersion === 'bundled' && (
                    <span>
                      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>UI</span>
                      bundled
                    </span>
                  )}
                  {serverVersion && (
                    <span>
                      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Server</span>
                      {serverVersion}
                    </span>
                  )}
                </div>
              </Section>
              <Section
                title="UI updates"
                subtitle="How over-the-air UI updates are applied when a new version is published. Server updates are always applied automatically on launch."
              >
                <Segmented
                  value={settings.uiUpdateMode ?? 'auto'}
                  onChange={(v) => setSetting('uiUpdateMode', v)}
                  groupLabel="UI update mode"
                  options={[
                    { value: 'auto',   label: 'Auto',   title: 'Download and apply UI updates automatically.' },
                    { value: 'manual', label: 'Manual', title: 'Only apply UI updates when triggered manually.' },
                  ]}
                />
              </Section>
            </CollapsibleGroup>



            {/* ── Experimental ────────────────────────────── */}
            <CollapsibleGroup title="Experimental" defaultOpen={false}>
              <Section>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0',
                }}>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>HomeOS (Beta)</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Use the new AI Chief of Staff home screen. Replaces the current home view.
                    </div>
                  </div>
                  <label style={{
                    position: 'relative', display: 'inline-block',
                    width: 44, height: 24, flexShrink: 0, marginLeft: 16,
                  }}>
                    <input
                      type="checkbox"
                      checked={window.localStorage.getItem('useHomeOS') === 'true'}
                      onChange={(e) => {
                        window.localStorage.setItem('useHomeOS', e.target.checked ? 'true' : 'false');
                        window.location.reload();
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer',
                      top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: window.localStorage.getItem('useHomeOS') === 'true'
                        ? 'var(--accent, #2563eb)' : 'var(--border, #d1d5db)',
                      borderRadius: 24, transition: 'background-color 0.2s',
                    }}>
                      <span style={{
                        position: 'absolute', height: 18, width: 18,
                        left: window.localStorage.getItem('useHomeOS') === 'true' ? 22 : 3,
                        bottom: 3, backgroundColor: 'white',
                        borderRadius: '50%', transition: 'left 0.2s',
                      }} />
                    </span>
                  </label>
                </div>
              </Section>
            </CollapsibleGroup>

            {/* Build stamp — Vite-baked globals, verifies the running renderer is fresh. */}
            <div style={{
              marginTop: 20, textAlign: 'center',
              fontSize: 11, color: 'var(--text-muted)', opacity: 0.75,
              fontFamily: 'var(--font-mono)',
            }}>
              Build {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}
              {typeof __GIT_HASH__ !== 'undefined' && __GIT_HASH__ ? ` · ${__GIT_HASH__}` : ''}
              {typeof __BUILD_TIME__ !== 'undefined' && __BUILD_TIME__ ? ` · ${__BUILD_TIME__}` : ''}
            </div>
          </div>
        </div>



        {/* Sticky save bar — sits at the bottom of the panel, glassy
            translucent backdrop so the gravity field hints through it.
            Primary button glows in dark mode (token-driven). */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 28px',
          background: 'var(--surface-glass)',
          WebkitBackdropFilter: 'blur(var(--surface-glass-blur))',
          backdropFilter: 'blur(var(--surface-glass-blur))',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              flex: 1, fontSize: 13, fontWeight: 500,
              color: 'var(--text-muted)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {testing && (<span aria-hidden="true" className="spinner" style={{ width: 12, height: 12 }} />)}
            {!testing && tested && configReady && (
              <span aria-hidden="true" style={{ color: 'var(--sage-500, #5d9287)', display: 'inline-flex' }}>{Ico.check(13)}</span>
            )}
            {!testing && saved && !tested && (
              <span aria-hidden="true" style={{ color: 'var(--sage-500, #5d9287)', display: 'inline-flex' }}>{Ico.check(13)}</span>
            )}
            <span>
              {testing
                ? 'Testing configuration…'
                : tested
                  ? (configReady ? 'Test passed — provider, model, and credentials look good.' : (configError || 'Test reported a problem.'))
                  : saved
                    ? 'Settings saved.'
                    : configError
                      ? configError
                      : 'Changes apply on save.'}
            </span>
          </div>
          <button
            className="btn-secondary"
            onClick={validate}
            title="Re-run the configuration and active-provider tests."
          >Test</button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={!settingsDirty || testing || missingCustomNames}
            title={
              missingCustomNames ? 'Each custom provider needs a name'
              : testing ? 'Saving…'
              : !settingsDirty ? 'No unsaved changes'
              : 'Save changes and re-run provider tests.'
            }
            style={{
              width: 140,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: (!settingsDirty || testing || missingCustomNames) ? 0.55 : 1,
              cursor: (!settingsDirty || testing || missingCustomNames) ? 'default' : 'pointer',
            }}
          >
            {testing
              ? 'Saving…'
              : settingsDirty
                ? 'Save settings'
                : (<>{Ico.check(14)} Saved</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
