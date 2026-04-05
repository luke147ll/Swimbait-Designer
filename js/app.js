/**
 * @file app.js
 * Entry point — scene init, renderer, camera, lights, grid, orbit controls,
 * render loop, resize handler, and UI wiring for the primitive-based editor.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { initPrimitiveEditor, setPrimitiveColor, getPrimitives } from './primitives.js';

let scene, cam, ren;
let baitColor = 0x7a8e9a;
let drag = false, px = 0, py = 0, ot = 0.55, op = 0.42, od = 9;

function updateCamera() {
  cam.position.set(od * Math.sin(op) * Math.cos(ot), od * Math.cos(op), od * Math.sin(op) * Math.sin(ot));
  cam.lookAt(0, -.15, 0);
}

function setColor(el) {
  document.querySelectorAll('.cs').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  baitColor = parseInt(el.dataset.c);
  setPrimitiveColor(baitColor);
}

function snapView(view) {
  if (view === 'side')  { ot = Math.PI / 2; op = Math.PI / 2; }
  if (view === 'top')   { ot = 0; op = 0.01; }
  if (view === 'front') { ot = Math.PI; op = Math.PI / 2; }
  updateCamera();
}

function switchTab(btn) {
  const viewId = btn.dataset.view;
  const pnl = document.getElementById('pnlControls');

  document.querySelectorAll('.mob-view').forEach(el => el.classList.remove('active'));

  if (viewId === 'home') {
    if (pnl) pnl.style.display = 'flex';
  } else {
    if (pnl) pnl.style.display = 'none';
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  }

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');

  setTimeout(() => {
    const vp = document.getElementById('vp');
    if (vp && vp.clientWidth > 0) {
      cam.aspect = vp.clientWidth / vp.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(vp.clientWidth, vp.clientHeight);
    }
  }, 50);
}

// ── Panel resize drag ──
function initPanelResize() {
  const handle = document.getElementById('pnlResize');
  if (!handle) return;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const onMove = ev => {
      const w = Math.max(260, Math.min(600, ev.clientX));
      document.documentElement.style.setProperty('--pnl-w', w + 'px');
      const vp = document.getElementById('vp');
      if (vp && vp.clientWidth > 0) {
        cam.aspect = vp.clientWidth / vp.clientHeight;
        cam.updateProjectionMatrix();
        ren.setSize(vp.clientWidth, vp.clientHeight);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
}

function init() {
  const vp = document.getElementById('vp');
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, vp.clientWidth / vp.clientHeight, 0.1, 100);
  ren = new THREE.WebGLRenderer({ antialias: true });
  ren.setSize(vp.clientWidth, vp.clientHeight);
  ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ren.setClearColor(0x0e0e0d);
  ren.toneMapping = THREE.ACESFilmicToneMapping;
  ren.toneMappingExposure = 1.2;
  vp.appendChild(ren.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const d1 = new THREE.DirectionalLight(0xfff0dd, 0.9); d1.position.set(4, 10, 6); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x99aacc, 0.4); d2.position.set(-5, 3, -4); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xffffff, 0.25); d3.position.set(0, -4, 2); scene.add(d3);

  const g = new THREE.GridHelper(16, 32, 0x252522, 0x1a1a17); g.position.y = -2.2; scene.add(g);

  // ── Orbit controls: mouse ──
  vp.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.target === ren.domElement || e.target === vp) {
      drag = true; px = e.clientX; py = e.clientY;
    }
  });
  vp.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') drag = false;
  });
  vp.addEventListener('pointermove', e => {
    if (!drag || e.pointerType === 'touch') return;
    ot -= (e.clientX - px) * .005;
    op = Math.max(.1, Math.min(3.0, op - (e.clientY - py) * .005));
    px = e.clientX; py = e.clientY;
    updateCamera();
  });
  vp.addEventListener('pointerleave', () => { drag = false; });
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    od = Math.max(3, Math.min(22, od + e.deltaY * .007));
    updateCamera();
  }, { passive: false });

  // ── Orbit controls: touch ──
  let touchStartDist = 0;
  let touchStartOd = od;

  vp.addEventListener('touchstart', e => {
    if (e.target.closest('.view-btns')) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      drag = true;
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      drag = false;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchStartDist = Math.sqrt(dx * dx + dy * dy);
      touchStartOd = od;
    }
  }, { passive: false });

  vp.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) {
      const cx = e.touches[0].clientX, cy2 = e.touches[0].clientY;
      ot -= (cx - px) * .005;
      op = Math.max(.1, Math.min(3.0, op - (cy2 - py) * .005));
      px = cx; py = cy2;
      updateCamera();
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (touchStartDist > 0) {
        od = Math.max(3, Math.min(22, touchStartOd * (touchStartDist / dist)));
        updateCamera();
      }
    }
  }, { passive: false });

  vp.addEventListener('touchend', () => { drag = false; });

  // ── Touch hints ──
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hint = document.getElementById('rhHint');
  if (hint && isTouch) hint.textContent = 'Drag to orbit / pinch to zoom';

  // ── Initialize primitive editor ──
  initPrimitiveEditor(scene);
  initPanelResize();

  updateCamera();

  // Check auth, load saved/shared design from URL if present
  initAuth();

  (function animate() { requestAnimationFrame(animate); ren.render(scene, cam); })();

  function onResize() {
    if (vp.clientWidth > 0 && vp.clientHeight > 0) {
      cam.aspect = vp.clientWidth / vp.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(vp.clientWidth, vp.clientHeight);
    }
  }
  window.addEventListener('resize', onResize);
}

// ── Auth + save/load ──
let currentUser = null;
let currentDesignId = null;
let currentDesignName = '';
let isReadOnly = false;

function showLoggedInUI(user) {
  currentUser = user;
  const mono = (user.displayName || user.username).slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('phAvatar');
  const monoEl = document.getElementById('phMonogram');
  const signinEl = document.getElementById('authSignin');
  const userEl = document.getElementById('authUser');
  const usernameEl = document.getElementById('authUsername');

  if (avatarEl) avatarEl.style.display = 'flex';
  if (monoEl) monoEl.textContent = mono;
  if (signinEl) signinEl.style.display = 'none';
  if (userEl) userEl.style.display = 'block';
  if (usernameEl) usernameEl.textContent = 'Signed in as ' + user.username;
}

function showLoggedOutUI() {
  const avatarEl = document.getElementById('phAvatar');
  const signinEl = document.getElementById('authSignin');
  const userEl = document.getElementById('authUser');
  if (avatarEl) avatarEl.style.display = 'none';
  if (signinEl) signinEl.style.display = 'block';
  if (userEl) userEl.style.display = 'none';
}

function showReadOnlyMode(name) {
  isReadOnly = true;
  const banner = document.getElementById('readonlyBanner');
  if (banner) banner.style.display = 'flex';
  const signinEl = document.getElementById('authSignin');
  if (signinEl) signinEl.style.display = 'none';
  const userEl = document.getElementById('authUser');
  if (userEl) userEl.style.display = 'none';
}

function toggleDesignerMenu() {
  document.getElementById('phAvatarMenu').classList.toggle('open');
}
document.addEventListener('click', e => {
  const menu = document.getElementById('phAvatarMenu');
  if (menu && !e.target.closest('.ph-avatar')) menu.classList.remove('open');
});

async function logoutDesigner() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.reload();
}

// ── Design state (primitives-based) ──

function getDesignState() {
  return JSON.stringify({
    primitives: getPrimitives(),
    baitColor,
  });
}

function loadDesignState(state) {
  if (state.primitives) {
    // Replace primitives and rebuild
    window.loadPreset && window.loadPreset(null); // clear first
    // Directly set primitives via the global
    window.baitPrimitives = state.primitives;
  }
  if (state.baitColor) {
    baitColor = state.baitColor;
    setPrimitiveColor(baitColor);
  }
}

async function initAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      showLoggedInUI(user);
    } else {
      showLoggedOutUI();
    }
  } catch {
    showLoggedOutUI();
  }

  // Restore stashed design from pre-login state
  if (currentUser) {
    const stashed = localStorage.getItem('sd_pending_design');
    if (stashed) {
      localStorage.removeItem('sd_pending_design');
      try {
        const state = JSON.parse(stashed);
        loadDesignState(state);
        const nameInput = document.getElementById('designNameInput');
        if (nameInput && !nameInput.value) nameInput.value = 'Untitled design';
      } catch {}
    }
  }

  // Check for shared design URL: /d/{designId}
  const shareMatch = window.location.pathname.match(/^\/d\/([\w-]+)$/);
  if (shareMatch) {
    await loadSharedDesign(shareMatch[1]);
    return;
  }

  // Check for ?design={id} (own saved design)
  const params = new URLSearchParams(window.location.search);
  const designId = params.get('design');
  if (designId) {
    await loadDesignFromAPI(designId);
  }
}

async function saveDesign() {
  if (!currentUser) {
    try { localStorage.setItem('sd_pending_design', getDesignState()); } catch {}
    window.location = '/login';
    return;
  }

  const btn = document.getElementById('saveBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    ren.render(scene, cam);
    const thumbnail = ren.domElement.toDataURL('image/jpeg', 0.7);
    const nameInput = document.getElementById('designNameInput');
    const name = nameInput.value.trim() || 'Untitled design';

    const body = {
      name,
      species: 'custom',
      tailType: 'primitive',
      length: 0,
      stateJSON: getDesignState(),
      thumbnail,
    };

    const url = currentDesignId ? `/api/designs/${currentDesignId}` : '/api/designs';
    const method = currentDesignId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      currentDesignId = data.id;
      currentDesignName = name;
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save design'; }, 1500);
    } else {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Save design'; }, 2000);
    }
  } catch {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Save design'; }, 2000);
  }
  btn.disabled = false;
}

async function loadDesignFromAPI(designId) {
  try {
    const res = await fetch(`/api/designs/${designId}`, { credentials: 'include' });
    if (!res.ok) {
      window.history.replaceState({}, '', '/');
      return;
    }
    const design = await res.json();
    const state = JSON.parse(design.stateJSON);
    loadDesignState(state);
    currentDesignId = design.id;
    currentDesignName = design.name;
    const nameInput = document.getElementById('designNameInput');
    if (nameInput) nameInput.value = design.name;
  } catch {
    window.history.replaceState({}, '', '/');
  }
}

async function loadSharedDesign(designId) {
  try {
    const res = await fetch(`/api/public/${designId}`);
    if (!res.ok) return;
    const design = await res.json();
    const state = JSON.parse(design.stateJSON);
    loadDesignState(state);
    showReadOnlyMode(design.name);
    window._sharedDesignState = design;
  } catch {}
}

async function forkDesign() {
  if (!currentUser) { window.location = '/login'; return; }
  const shared = window._sharedDesignState;
  if (!shared) return;

  const body = {
    name: (shared.name || 'Shared design') + ' (fork)',
    species: shared.species || 'custom',
    tailType: 'primitive',
    length: 0,
    stateJSON: shared.stateJSON,
  };

  const res = await fetch('/api/designs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const data = await res.json();
    window.location = `/?design=${data.id}`;
  }
}

async function sendToMoldGenerator() {
  const primitives = getPrimitives();

  const payload = JSON.stringify({ type: 'primitives', name: 'designed_bait', primitives });

  try {
    const res = await fetch('/api/mold-transfer', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error('Upload failed: ' + res.status);
    const data = await res.json();
    console.log('[SBD] Primitives uploaded, token:', data.token);

    const moldUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? `http://localhost:5173?transfer=${data.token}`
      : `https://mold.swimbaitdesigner.com?transfer=${data.token}`;
    window.open(moldUrl, '_blank');
  } catch (e) {
    console.error('[SBD] Transfer failed:', e);
    alert('Failed to transfer bait.');
  }
}

// Expose to inline HTML handlers
window.setColor = setColor;
window.snapView = snapView;
window.switchTab = switchTab;
window.saveDesign = saveDesign;
window.sendToMoldGenerator = sendToMoldGenerator;
window.toggleDesignerMenu = toggleDesignerMenu;
window.logoutDesigner = logoutDesigner;
window.forkDesign = forkDesign;
window.stashAndLogin = function(e) {
  e.preventDefault();
  try { localStorage.setItem('sd_pending_design', getDesignState()); } catch {}
  window.location = '/login';
};

init();
