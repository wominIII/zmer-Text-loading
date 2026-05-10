import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const SETTINGS_KEY = 'streamScrambleText';
const LOG_PREFIX = '[Stream Scramble Text]';

const EXTENSION_PATH = (() => {
  const pathname = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/\/$/, '');
  const marker = '/scripts/extensions/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex !== -1) return pathname.slice(markerIndex + marker.length);
  return 'third-party/stream-scramble-text';
})();

const DEFAULT_SETTINGS = {
  enabled: true,
  charset: 'blocks',
  customChars: '',
  duration: 520,
  frameRate: 35,
  tailLength: 42,
  glow: true,
};

const CHARSETS = {
  blocks: '░▒▓█',
  matrix: 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789',
  symbols: '!<>-_\\/[]{}—=+*^?#________',
  numbers: '0123456789',
  mixed: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?#$%&*',
};

const state = {
  observer: null,
  nodeData: new WeakMap(),
  selfWrites: new WeakMap(),
  pendingNodes: new Set(),
  flushTimer: null,
  settings: null,
  reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)'),
};

function getSettings() {
  extension_settings[SETTINGS_KEY] ||= { ...DEFAULT_SETTINGS };
  state.settings = Object.assign({}, DEFAULT_SETTINGS, extension_settings[SETTINGS_KEY]);
  extension_settings[SETTINGS_KEY] = state.settings;
  return state.settings;
}

function saveSetting(key, value) {
  state.settings[key] = value;
  extension_settings[SETTINGS_KEY] = state.settings;
  saveSettingsDebounced();
  updateGlowClass();
}

function getChars() {
  const custom = state.settings.customChars.trim();
  if (state.settings.charset === 'custom' && custom) return custom;
  return CHARSETS[state.settings.charset] || CHARSETS.blocks;
}

function shouldAnimate() {
  return state.settings.enabled && !state.reduceMotion?.matches;
}

function isSkippableTextNode(node) {
  if (!node?.nodeValue?.trim()) return true;
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest('pre, code, script, style, textarea, input, .edit_textarea'));
}

function randomChar(chars) {
  return chars[Math.floor(Math.random() * chars.length)] || '█';
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

function writeNode(node, value) {
  state.selfWrites.set(node, value);
  node.nodeValue = value;
}

function animateTextNode(node) {
  if (isSkippableTextNode(node) || !shouldAnimate()) {
    state.nodeData.set(node, { finalText: node.nodeValue });
    return;
  }

  const finalText = node.nodeValue;
  const previous = state.nodeData.get(node);
  const previousFinal = previous?.finalText || '';
  const start = Math.max(0, commonPrefixLength(previousFinal, finalText) - 2);
  const tailStart = Math.max(start, finalText.length - state.settings.tailLength);
  const revealStart = Math.min(start, tailStart);
  const chars = getChars();
  const duration = Math.max(80, state.settings.duration);
  const frameMs = Math.max(16, Math.round(1000 / Math.max(1, state.settings.frameRate)));

  if (previous?.timer) clearInterval(previous.timer);

  if (finalText.length === 0 || revealStart >= finalText.length) {
    state.nodeData.set(node, { finalText });
    return;
  }

  node.parentElement?.classList.toggle('stream-scramble-active', state.settings.glow);

  const startedAt = performance.now();
  const timer = setInterval(() => {
    const progress = Math.min(1, (performance.now() - startedAt) / duration);
    const revealCount = Math.floor((finalText.length - revealStart) * progress);
    const settledUntil = revealStart + revealCount;
    let output = finalText.slice(0, settledUntil);

    for (let i = settledUntil; i < finalText.length; i++) {
      const original = finalText[i];
      output += /\s/.test(original) ? original : randomChar(chars);
    }

    writeNode(node, output);

    if (progress >= 1) {
      clearInterval(timer);
      writeNode(node, finalText);
      node.parentElement?.classList.remove('stream-scramble-active');
      state.nodeData.set(node, { finalText });
    }
  }, frameMs);

  state.nodeData.set(node, { finalText, timer });
}

function collectTextNodes(root, result = []) {
  if (!root) return result;
  if (root.nodeType === Node.TEXT_NODE) {
    result.push(root);
    return result;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.matches?.('pre, code, script, style, textarea, input, .edit_textarea')) {
    return result;
  }
  for (const child of root.childNodes) collectTextNodes(child, result);
  return result;
}

function queueNode(node) {
  if (!node) return;
  if (state.selfWrites.get(node) === node.nodeValue) return;
  state.pendingNodes.add(node);
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    const nodes = [...state.pendingNodes];
    state.pendingNodes.clear();
    state.flushTimer = null;
    nodes.forEach(animateTextNode);
  }, 30);
}

function handleMutations(mutations) {
  if (!shouldAnimate()) return;

  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      queueNode(mutation.target);
      continue;
    }

    for (const added of mutation.addedNodes) {
      collectTextNodes(added).forEach(queueNode);
    }
  }
}

function startObserver() {
  state.observer?.disconnect();
  const chat = document.getElementById('chat');
  if (!chat) return;

  state.observer = new MutationObserver(handleMutations);
  state.observer.observe(chat, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function updateGlowClass() {
  document.documentElement.classList.toggle('stream-scramble-glow-enabled', Boolean(state.settings?.glow));
}

async function renderSettings() {
  const html = await renderExtensionTemplateAsync(EXTENSION_PATH, 'settings');
  $('#extensions_settings2').append(html);

  const bindCheckbox = (selector, key) => {
    const input = document.querySelector(selector);
    input.checked = Boolean(state.settings[key]);
    input.addEventListener('change', () => saveSetting(key, input.checked));
  };

  const bindRange = (selector, labelSelector, key, suffix = '') => {
    const input = document.querySelector(selector);
    const label = document.querySelector(labelSelector);
    const sync = () => label.textContent = `${input.value}${suffix}`;
    input.value = state.settings[key];
    sync();
    input.addEventListener('input', () => {
      saveSetting(key, Number(input.value));
      sync();
    });
  };

  bindCheckbox('#stream_scramble_enabled', 'enabled');
  bindCheckbox('#stream_scramble_glow', 'glow');
  bindRange('#stream_scramble_duration', '#stream_scramble_duration_value', 'duration', 'ms');
  bindRange('#stream_scramble_fps', '#stream_scramble_fps_value', 'frameRate', 'fps');
  bindRange('#stream_scramble_tail', '#stream_scramble_tail_value', 'tailLength');

  const charset = document.querySelector('#stream_scramble_charset');
  charset.value = state.settings.charset;
  charset.addEventListener('change', () => saveSetting('charset', charset.value));

  const custom = document.querySelector('#stream_scramble_custom');
  custom.value = state.settings.customChars;
  custom.addEventListener('input', () => saveSetting('customChars', custom.value));
}

jQuery(async () => {
  try {
    getSettings();
    await renderSettings();
    updateGlowClass();
    startObserver();

    const chatWaiter = new MutationObserver(() => {
      if (document.getElementById('chat') && !state.observer) startObserver();
    });
    chatWaiter.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed during initialization`, error);
  }
});
