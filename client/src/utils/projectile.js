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
 * @param {{ from:{x:number,y:number}, to:{x:number,y:number}, type?:string,
 *           power?:number, reducedMotion?:boolean, onHit?:()=>void, onComplete?:()=>void }} opts
 */
export function fireProjectile({ from, to, type = 'magic', power = 1, reducedMotion = false, onHit, onComplete }) {
  const cfg = TYPES[type] || TYPES.magic;
  const intensity = Math.max(0.8, Math.min(2, power));

  // ── create full-screen canvas overlay ──────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Reduced-motion users still need visible attack feedback; show a brief
  // static beam and impact instead of removing the effect entirely.
  if (reducedMotion) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = cfg.glow;
    ctx.shadowColor = cfg.glow;
    ctx.shadowBlur = 28;
    ctx.lineCap = 'round';
    ctx.lineWidth = 12 * intensity;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(to.x, to.y, 18 * intensity, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    onHit?.();
    setTimeout(() => {
      canvas.remove();
      onComplete?.();
    }, 320);
    return;
  }

  const baseAngle = Math.atan2(to.y - from.y, to.x - from.x);

  // ── projectile particles ────────────────────────────────────────────────
  const particles = Array.from({ length: Math.round(cfg.count * intensity) }, () => {
    const spread = ((Math.random() - 0.5) * cfg.spread * Math.PI) / 180;
    const angle  = baseAngle + spread;
    const speed  = cfg.speed * (0.75 + Math.random() * 0.5) * (0.9 + intensity * 0.1);
    return {
      x: from.x, y: from.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size:  cfg.size * (0.6 + Math.random() * 0.8) * (0.85 + intensity * 0.15),
      color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
      trail: [],
      reached: false,
      lastDistance: Math.hypot(to.x - from.x, to.y - from.y),
    };
  });

  let hitFired   = false;
  let explParticles = [];
  let shockwaveLife = 0;
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
    const burstCount = Math.round(cfg.burstCount * intensity);
    shockwaveLife = 1;
    for (let i = 0; i < burstCount; i++) {
      const angle = (i / burstCount) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (3 + Math.random() * 8) * intensity;
      explParticles.push({
        x: to.x, y: to.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size:  (3 + Math.random() * 9) * (0.8 + intensity * 0.2),
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
    particles.forEach((p, particleIndex) => {
      if (p.reached) return;

      // trail
      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > cfg.trailLen) p.trail.pop();

      // 퍼짐 궤적은 유지하되 목표를 지나치지 않도록 부드럽게 유도한다.
      const guideAngle = Math.atan2(to.y - p.y, to.x - p.x);
      const currentSpeed = Math.hypot(p.vx, p.vy);
      p.vx = p.vx * 0.84 + Math.cos(guideAngle) * currentSpeed * 0.16;
      p.vy = p.vy * 0.84 + Math.sin(guideAngle) * currentSpeed * 0.16;
      p.x += p.vx;
      p.y += p.vy;

      // hit check
      const dx = to.x - p.x, dy = to.y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < Math.max(28, currentSpeed * 1.4) || (distance > p.lastDistance && p.lastDistance < 60)) {
        p.reached = true;
        return;
      }
      p.lastDistance = distance;

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

    if (shockwaveLife > 0) {
      const progress = 1 - shockwaveLife;
      ctx.save();
      ctx.globalAlpha = shockwaveLife * 0.85;
      ctx.strokeStyle = cfg.glow;
      ctx.shadowColor = cfg.glow;
      ctx.shadowBlur = 16;
      ctx.lineWidth = Math.max(1, 7 * shockwaveLife);
      ctx.beginPath();
      ctx.arc(to.x, to.y, 16 + progress * 68 * intensity, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      shockwaveLife = Math.max(0, shockwaveLife - 0.065);
    }

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

    if (hitFired && !anyAlive && shockwaveLife <= 0) { cleanup(); return; }

    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);
}
