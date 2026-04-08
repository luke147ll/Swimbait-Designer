/**
 * @file undo.js
 * Lightweight undo/redo system. Captures design state snapshots
 * and restores them with Ctrl+Z / Ctrl+Shift+Z.
 *
 * State is serialized as JSON — only data, no Three.js objects.
 * On restore, the app rebuilds meshes from the restored state.
 */

const MAX_UNDO = 50;
const undoStack = [];
const redoStack = [];
let captureTimeout = null;
let getStateFn = null;
let restoreStateFn = null;

/**
 * Initialize the undo system.
 * @param {Function} getState - returns the current design state as a plain object
 * @param {Function} restoreState - receives a state object and rebuilds the design
 */
export function initUndo(getState, restoreState) {
  getStateFn = getState;
  restoreStateFn = restoreState;

  // Keyboard handler
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey)) ) {
      e.preventDefault();
      redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  // Capture initial state
  captureNow();
  console.log('[Undo] Initialized');
}

/** Capture a snapshot immediately. */
function captureNow() {
  if (!getStateFn) return;
  const state = JSON.stringify(getStateFn());
  // Don't push if identical to the last snapshot
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === state) return;
  undoStack.push(state);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // any new action clears redo
}

/**
 * Record a state change. Debounced — rapid changes (slider drags, gizmo drags)
 * collapse into a single undo step. Call this after any user action.
 */
export function recordChange() {
  clearTimeout(captureTimeout);
  captureTimeout = setTimeout(captureNow, 300);
}

/** Force an immediate capture (for discrete actions like add/remove). */
export function recordChangeNow() {
  clearTimeout(captureTimeout);
  captureNow();
}

function undo() {
  if (undoStack.length <= 1) return; // need at least initial + one change
  // Save current state to redo
  const current = undoStack.pop();
  redoStack.push(current);
  // Restore previous state
  const prev = undoStack[undoStack.length - 1];
  if (restoreStateFn) restoreStateFn(JSON.parse(prev));
  console.log('[Undo] ←', undoStack.length, 'steps remaining');
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  if (restoreStateFn) restoreStateFn(JSON.parse(next));
  console.log('[Undo] →', redoStack.length, 'redo steps remaining');
}

/** Get the current stack sizes (for UI display). */
export function getUndoInfo() {
  return { undoSteps: Math.max(0, undoStack.length - 1), redoSteps: redoStack.length };
}
