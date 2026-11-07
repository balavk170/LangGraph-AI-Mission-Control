// ── Particle Canvas ──────────────────────────────────────────
(function () {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles = [], animId;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const COLORS = ['rgba(139,92,246,0.6)', 'rgba(59,130,246,0.5)', 'rgba(6,182,212,0.4)', 'rgba(16,185,129,0.3)'];
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * 1920, y: Math.random() * 1080,
            vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
            r: Math.random() * 1.5 + 0.5,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            alpha: Math.random() * 0.6 + 0.2
        });
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
            if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.fill();
            ctx.globalAlpha = 1;
        });
        // draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(139,92,246,${0.12 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        animId = requestAnimationFrame(draw);
    }
    draw();
})();

// ── Nav scroll effect ──────────────────────────────────────────
(function () {
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 30) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
    });
})();

// ── Mobile nav toggle ──────────────────────────────────────────
(function () {
    const toggle = document.getElementById('mobile-toggle');
    const links = document.querySelector('.nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    // Close on link click
    links.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => links.classList.remove('open'));
    });
})();

// ── Smooth anchor scrolling ────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ── Scroll reveal ──────────────────────────────────────────────
(function () {
    const els = document.querySelectorAll(
        '.concept-card, .feature-card, .flow-step, .arch-layer, .stat'
    );
    els.forEach(el => el.classList.add('reveal'));

    const obs = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('visible'), i * 60);
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    els.forEach(el => obs.observe(el));
})();

// The dashboard preview is explicitly illustrative, so it does not simulate live events.

// Show system availability from the actual backend health route.
(function () {
    const badge = document.getElementById('landing-status');
    if (!badge) return;
    fetch('/api/health', { cache: 'no-store' })
        .then(response => {
            if (!response.ok) throw new Error('Health check failed');
            return response.json();
        })
        .then(data => {
            badge.classList.toggle('offline', data.status !== 'ok');
            badge.lastChild.textContent = data.status === 'ok' ? ' SYSTEM ONLINE' : ' SYSTEM DEGRADED';
        })
        .catch(() => {
            badge.classList.add('offline');
            badge.lastChild.textContent = ' BACKEND OFFLINE';
        });
})();
