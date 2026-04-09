import { useEffect, useRef } from 'react';
import { useLoadingStore } from '../store/loadingStore';
import { useMoldStore } from '../store/moldStore';
import { getTransferToken, transferBaitFromAPI } from '../core/BaitBridge';
import { T } from '../theme';

/* ── pixel art ─────────────────────────────────────────── */
const fishBody = [
  [0,3],[1,2],[2,1],[3,1],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],
  [11,1],[12,1],[13,2],[14,2],[13,3],[12,3],[14,4],
  [13,5],[12,5],[11,6],[10,7],[9,7],[8,7],[7,7],[6,7],[5,7],[4,7],
  [3,6],[2,6],[1,5],[0,4],[0,3],
];
const fishEye = [[3,3]];
const tailTop = [[-1,2],[-2,1],[-3,0],[-2,2]];
const tailBot = [[-1,5],[-2,6],[-3,7],[-2,5]];
const hookPx = [
  [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],
  [1,7],[2,7],[3,6],[3,5],[2,4],[1,4],[0,5],[-1,3],
];
const hookBarb = [[-1,3],[-2,2]];

/* ── fish canvas ───────────────────────────────────────── */
function startFish(cvs: HTMLCanvasElement) {
  const rect = cvs.parentElement!.getBoundingClientRect();
  const W = rect.width;
  const H = 120;
  cvs.width = W * 2;
  cvs.height = H * 2;
  cvs.style.width = W + 'px';
  cvs.style.height = H + 'px';
  const ctx = cvs.getContext('2d')!;
  ctx.scale(2, 2);

  let mouseX = W * 0.5, mouseY = H * 0.5, mouseIn = false;
  let hookX = W * 0.5, hookY = 40, score = 0;
  const scoreEl = cvs.parentElement!.querySelector('#loadScore') as HTMLElement;

  const onMove = (cx: number, cy: number) => {
    const r = cvs.getBoundingClientRect();
    mouseX = (cx - r.left) / r.width * W;
    mouseY = (cy - r.top) / r.height * H;
    mouseIn = true;
  };
  cvs.parentElement!.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  cvs.parentElement!.addEventListener('mouseleave', () => { mouseIn = false; });
  cvs.parentElement!.addEventListener('touchmove', e => {
    e.preventDefault();
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  cvs.parentElement!.addEventListener('touchend', () => { mouseIn = false; });

  interface Fish { x: number; y: number; speed: number; size: number; phase: number; caught: boolean; catchTime: number; fleeing: boolean; fleeDir: number }
  interface Splash { x: number; y: number; vx: number; vy: number; life: number }
  interface Bubble { x: number; y: number; r: number; speed: number; drift: number }

  const fishes: Fish[] = [];
  for (let i = 0; i < 5; i++) {
    fishes.push({ x: -60 - i * 110 + Math.random() * 30, y: 20 + Math.random() * 65,
      speed: 0.4 + Math.random() * 0.5, size: 2 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2, caught: false, catchTime: 0, fleeing: false, fleeDir: 0 });
  }
  const bubbles: Bubble[] = [];
  for (let i = 0; i < 18; i++) {
    bubbles.push({ x: Math.random() * W, y: H + Math.random() * 30,
      r: 0.8 + Math.random() * 2.5, speed: 0.12 + Math.random() * 0.2, drift: (Math.random() - 0.5) * 0.15 });
  }
  const splashes: Splash[] = [];
  const t0 = Date.now();

  function px(x: number, y: number, col: string, sz: number) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
  }

  function drawFish(f: Fish, t: number) {
    const w = Math.sin(t * 3 + f.phase) * (f.caught ? 3 : 1.5);
    const s = f.size;
    const col = f.caught ? T.goldBright : T.gold;
    const dark = f.caught ? T.gold : T.goldDim;
    for (let i = 0; i < fishBody.length - 1; i++)
      px(f.x + fishBody[i][0] * s, f.y + fishBody[i][1] * s + w, col, s);
    for (let i = 0; i < fishEye.length; i++)
      px(f.x + fishEye[i][0] * s, f.y + fishEye[i][1] * s + w, T.bgDeep, s);
    const tw = Math.sin(t * (f.caught ? 8 : 5) + f.phase) * (f.caught ? 4 : 2);
    for (const p of tailTop) px(f.x + p[0] * s + tw, f.y + p[1] * s + w, dark, s);
    for (const p of tailBot) px(f.x + p[0] * s + tw, f.y + p[1] * s + w, dark, s);
  }

  let alive = true;
  function frame() {
    if (!alive) return;
    ctx.clearRect(0, 0, W, H);
    const t = (Date.now() - t0) / 1000;

    // bubbles
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.y -= b.speed; b.x += b.drift + Math.sin(t * 0.5 + i) * 0.03;
      if (b.y < -5) { b.y = H + 5; b.x = Math.random() * W; }
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,168,78,0.12)'; ctx.lineWidth = 0.5; ctx.stroke();
    }

    // hook
    if (mouseIn) { hookX += (mouseX - hookX) * 0.08; hookY += (mouseY - hookY) * 0.08; }
    else { hookX += (W * 0.5 + Math.sin(t * 0.4) * 80 - hookX) * 0.03; hookY += (40 + Math.sin(t * 0.3) * 20 - hookY) * 0.03; }
    hookX = Math.max(10, Math.min(W - 10, hookX));
    hookY = Math.max(5, Math.min(H - 10, hookY));

    ctx.strokeStyle = 'rgba(200,168,78,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hookX, -5);
    const sway = Math.sin(t * 0.8) * 5;
    ctx.bezierCurveTo(hookX + sway * 0.3, hookY * 0.35, hookX - sway * 0.2, hookY * 0.7, hookX, hookY);
    ctx.stroke();

    const hs = 2.5;
    for (const p of hookPx) px(hookX + p[0] * hs, hookY + p[1] * hs, '#888890', hs);
    for (const p of hookBarb) px(hookX + p[0] * hs, hookY + p[1] * hs, '#aaaaaa', hs);
    const tipX = hookX + 2.5, tipY = hookY + 18;

    // fish
    for (const f of fishes) {
      if (f.caught) {
        f.x = hookX - 5 * f.size; f.y = hookY + 10 - 3 * f.size; f.phase += 0.2;
        if (t - f.catchTime > 1.5) {
          f.caught = false; f.x = -80 - Math.random() * 60; f.y = 20 + Math.random() * 65;
          f.speed = 0.4 + Math.random() * 0.5; score++;
          if (scoreEl) scoreEl.textContent = 'CATCH: ' + score;
          for (let s = 0; s < 6; s++) splashes.push({ x: hookX, y: hookY, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2, life: 1 });
        }
        drawFish(f, t); continue;
      }
      const fcx = f.x + 7 * f.size, fcy = f.y + 3.5 * f.size;
      const dx = fcx - tipX, dy = fcy - tipY, dist = Math.sqrt(dx * dx + dy * dy);
      if (mouseIn && dist < 50 && dist > 18 && !f.fleeing) { f.fleeing = true; f.fleeDir = dy > 0 ? 1 : -1; }
      if (f.fleeing) { f.y += f.fleeDir * 0.8; if (dist > 80) f.fleeing = false; }
      if (!f.caught && dist < 14) {
        f.caught = true; f.catchTime = t; f.fleeing = false;
        for (let s = 0; s < 6; s++) splashes.push({ x: fcx, y: fcy, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2, life: 1 });
      }
      f.x += f.speed;
      if (f.x > W + 80) { f.x = -80 - Math.random() * 40; f.y = 20 + Math.random() * 65; f.speed = 0.4 + Math.random() * 0.5; f.fleeing = false; }
      drawFish(f, t);
    }

    // splashes
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i];
      sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.08; sp.life -= 0.03;
      if (sp.life <= 0) { splashes.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(200,168,78,${(sp.life * 0.6).toFixed(2)})`;
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
    }

    requestAnimationFrame(frame);
  }
  frame();
  return () => { alive = false; };
}

/* ── component ─────────────────────────────────────────── */
export function LoadingScreen() {
  const { lines, progress, totalSteps, finished, dismissed, log, finish, dismiss } = useLoadingStore();
  const moldHalfA = useMoldStore(s => s.moldHalfA);
  const isGenerating = useMoldStore(s => s.isGenerating);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  // Start fish animation
  useEffect(() => {
    if (cvsRef.current) return startFish(cvsRef.current);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [lines]);

  // Run initialization sequence once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const token = getTransferToken();
    if (!token) {
      log('no bait data found', 'error');
      log('open the designer to create a bait first', 'error');
      return;
    }

    (async () => {
      log('initializing CSG engine...');
      const result = await transferBaitFromAPI(token);
      if (!result.success) {
        log(result.error || 'transfer failed', 'error');
        return;
      }
      log('bait solid validated', 'success');
      log('generating mold...');
      // MoldEngine will log its own steps via loadingStore
      // Finish is triggered when we detect moldHalfA
    })();
  }, [log]);

  // Watch for mold generation to complete
  useEffect(() => {
    if (moldHalfA && !isGenerating && !finished) {
      finish();
    }
  }, [moldHalfA, isGenerating, finished, finish]);

  // Fade out after finish
  useEffect(() => {
    if (finished) {
      const t = setTimeout(dismiss, 1200);
      return () => clearTimeout(t);
    }
  }, [finished, dismiss]);

  const pct = Math.round((progress / totalSteps) * 100);
  const token = getTransferToken();
  const noToken = !token && lines.some(l => l.type === 'error');

  if (dismissed) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: T.bgDeep, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      padding: '2rem', transition: 'opacity 0.5s',
      opacity: finished ? 0 : 1, pointerEvents: finished ? 'none' : 'auto',
    }}>
      {/* Title */}
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1.5, textTransform: 'uppercase',
        fontFamily: T.font, marginBottom: 12 }}>
        SWIMBAIT DESIGNER
      </div>

      {/* Fish area */}
      <div style={{ width: '100%', maxWidth: 500, height: 120, position: 'relative',
        marginBottom: 24, overflow: 'hidden', cursor: 'none' }}>
        <canvas ref={cvsRef} style={{ width: '100%', height: 120 }} />
        <div id="loadScore" style={{ position: 'absolute', top: 8, right: 12,
          fontFamily: T.font, fontSize: 11, color: T.goldDim, letterSpacing: 1 }}>
          CATCH: 0
        </div>
      </div>

      {/* Terminal */}
      <div style={{ background: T.bgPanel, border: `2px solid ${T.gold}`, borderRadius: 4,
        width: '100%', maxWidth: 440, fontFamily: T.font }}>
        {/* Title bar */}
        <div style={{ background: T.gold, color: T.bgDeep, fontSize: 11, fontWeight: 700,
          letterSpacing: 2, padding: '4px 10px', display: 'flex', justifyContent: 'space-between' }}>
          <span>MOLD GENERATOR v1.0</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.bgDeep, opacity: 0.3 }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.bgDeep, opacity: 0.3 }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.bgDeep, opacity: 0.3 }} />
          </div>
        </div>

        {/* Lines */}
        <div ref={termRef} style={{ padding: '14px 14px 10px', minHeight: 180, maxHeight: 240, overflowY: 'auto' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre',
              color: l.type === 'success' ? T.green : l.type === 'error' ? T.red : T.gold }}>
              {'> '}{l.message}
              {/* blinking cursor on last success line when finished */}
              {finished && i === lines.length - 1 && (
                <span style={{ display: 'inline-block', width: 8, height: 14,
                  background: T.green, verticalAlign: 'text-bottom', marginLeft: 2,
                  animation: 'ldBlink 0.6s step-end infinite' }} />
              )}
            </div>
          ))}
          {/* No-token link */}
          {noToken && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <a href="https://swimbaitdesigner.com" style={{
                color: T.gold, fontSize: 13, textDecoration: 'underline', fontFamily: T.font,
              }}>
                Open Swimbait Designer
              </a>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 12, padding: '8px 14px 10px', borderTop: `1px solid ${T.bgElevated}` }}>
          <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>
            {finished ? 'COMPLETE' : `LOADING... ${pct}%`}
          </div>
          <div style={{ width: '100%', height: 10, background: T.bgPanel,
            border: `1px solid ${T.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: T.gold, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Blink keyframe */}
      <style>{`@keyframes ldBlink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}
