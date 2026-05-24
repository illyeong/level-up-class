// ─────────────────────────────────────────────────────────────────────────────
// fireProjectile — canvas-based projectile particle effect
//
// Usage:
//   fireProjectile({ from: {x,y}, to: {x,y}, type: 'magic', onHit: () => {} })
//
// Types: 'magic' | 'fire' | 'ice' | 'arrow' | 'energy'
// ─────────────────────────────────────────────────────────────────────────────

const TYPES = {
  magic: {
    colors:        ['#818cf8', '#a78bfa', '#c4b5fd', '#ddd6fe', '#f5f3ff'],
    glow:          '#818cf8',
    explodeColors: ['#818cf8', '#c4b5fd', '#e0e7ff'],
    count:   8,
    size:    7,
    speed:   16,
    spread:  12,
    trailLen: 8,
    burstCount: 18,
  },
  fire: {
    colors:        ['#f97316', '#ef4444', '#fbbf24', '#fb923c', '#fcd34d'],
    glow:          '#f97316',
    explodeColors: ['#f97316', '#ef4444', '#fbbf24'],
    count:   10,
    size:    8,
    speed:   13,
    spread:  22,
    trailLen: 6,
    burstCount: 22,
  },
  ice: {
    colors:        ['#67e8f9', '#a5f3fc', '#e0f2fe', '#7dd3fc', '#bfdbfe'],
    glow:          '#67e8f9',
    explodeColors: ['#67e8f9', '#e0f2fe', '#bae6fd'],
    count:   7,
    size:    6,
    speed:   15,
    spread:  10,
    trailLen: 9,
    burstCount: 16,
  },
  arrow: {
    colors:        ['#fbbf24', '#fde68a', '#fff7ed', '#f59e0b'],
    glow:          '#f59e0b',
    explodeColors: ['#fbbf24', '#fde68a'],
    count:   5,
    size:    5,
    speed:   24,
    spread:  5,
    trailLen: 12,
    burstCount: 14,
  },
  energy: {
    colors:        ['#4ade80', '#86efac', '#dcfce7', '#22c55e'],
    glow:          '#4ade80',
    explodeColors: ['#4ade80', '#86efac'],
    count:   7,
    size:    6,
    speed:   18,
    spread:  8,
    trailLen: 10,
    burstCount: 16,
  },
};

/**
 * @param {{ from:{x:number,y:number}, to:{x:number,y:number},
 *           type?:string, onHit?:()=>void, onComplete?:()=>void }} opts
 */
export function fireProjectile({ from, to, type = 'magic', onHit, onComplete }) {
  const cfg = TYPES[type] || TYPES.magic;

  // ── create full-screen canvas overlay ──────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const baseAngle = Math.atan2(to.y - from.y, to.x - from.x);

  // ── projectile particles ────────────────────────────────────────────────
  const particles = Array.from({ length: cfg.count }, () => {
    const spread = ((Math.random() - 0.5) * cfg.spread * Math.PI) / 180;
    const angle  = baseAngle + spread;
    const speed  = cfg.speed * (0.75 + Math.random() * 0.5);
    return {
      x: from.x, y: from.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size:  cfg.size * (0.6 + Math.random() * 0.8),
      color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
      trail: [],
      reached: false,
    };
  });

  let hitFired   = false;
  let explParticles = [];
  let rafId;
  let done = false;
  const startTime = performance.now();
  const TIMEOUT   = 5000;

  const cleanup = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(rafId);
    if (canvas.parentNode) document.body.removeChild(canvas);
    onComplete?.();
  };

  const spawnExplosion = () => {
    for (let i = 0; i < cfg.burstCount; i++) {
      const angle = (i / cfg.burstCount) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 3 + Math.random() * 8;
      explParticles.push({
        x: to.x, y: to.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size:  3 + Math.random() * 9,
        color: cfg.explodeColors[Math.floor(Math.random() * cfg.explodeColors.length)],
        life:  1,
        decay: 0.030 + Math.random() * 0.030,
      });
    }
  };

  // ── main animation loop ─────────────────────────────────────────────────
  const animate = (now) => {
    if (now - startTime > TIMEOUT) { cleanup(); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let allReached = true;

    // projectile particles
    particles.forEach(p => {
      if (p.reached) return;

      // trail
      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > cfg.trailLen) p.trail.pop();

      // move
      p.x += p.vx;
      p.y += p.vy;

      // hit check
      const dx = to.x - p.x, dy = to.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < 28) { p.reached = true; return; }

      allReached = false;

      // draw trail
      p.trail.forEach((t, i) => {
        const alpha = (1 - i / cfg.trailLen) * 0.45;
        const r     = Math.max(0.5, p.size * (1 - i / cfg.trailLen) * 0.65);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      });

      // draw head with glow
      ctx.save();
      ctx.shadowColor = cfg.glow;
      ctx.shadowBlur  = 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      // bright core
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    });

    // trigger hit once all particles reached
    if (allReached && !hitFired) {
      hitFired = true;
      onHit?.();
      spawnExplosion();
    }

    // explosion particles
    let anyAlive = false;
    explParticles.forEach(ep => {
      if (ep.life <= 0) return;
      anyAlive = true;
      ep.x  += ep.vx;
      ep.y  += ep.vy;
      ep.vx *= 0.90;
      ep.vy *= 0.90;
      ep.life -= ep.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, ep.life * ep.life);
      ctx.shadowColor = cfg.glow;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, Math.max(0.5, ep.size * ep.life), 0, Math.PI * 2);
      ctx.fillStyle = ep.color;
      ctx.fill();
      ctx.restore();
    });

    if (hitFired && !anyAlive) { cleanup(); return; }

    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);
}
