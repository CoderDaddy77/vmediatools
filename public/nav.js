// Shared navigation — 2 dropdowns only + server status indicator
(function () {

  // ─── Nav data ───
  const mediaTools = [
    { href: '/downloader', label: '⬇️  Video Downloader', render: true },
    { href: '/mp3',        label: '🎵  Video to MP3' },
    { href: '/convert',    label: '♫  WAV → MP3' },
    { href: '/compressor', label: '🗜️  Image Compressor' },
    { href: '/compressor/video', label: '📹  Video Compressor' },
  ];

  const fileTools = [
    { href: '/ppt-to-pdf',      label: '📊  PPT to PDF',      render: true },
    { href: '/word-to-pdf',     label: '📝  Word to PDF',     render: true },
    { href: '/images-to-pdf',   label: '🖼️  Images to PDF' },
    { href: '/image-converter', label: '🔄  Image Converter' },
  ];

  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const currentPath = window.location.pathname.replace(/\.html$/, '');

  // ─── Inject styles ───
  if (!document.getElementById('nav-styles')) {
    const s = document.createElement('style');
    s.id = 'nav-styles';
    s.textContent = `
      /* ── Nav links ── */
      .nav-link {
        padding: 5px 11px; border-radius: 8px; text-decoration: none;
        font-size: 0.82rem; font-weight: 500; color: var(--muted);
        transition: color 150ms, background 150ms; white-space: nowrap; flex-shrink: 0;
      }
      .nav-link:hover { color: var(--text); background: rgba(0,0,0,0.04); }
      .nav-link.active { color: var(--text); font-weight: 600; }

      /* ── Dropdown wrapper ── */
      .nav-dd { position: relative; flex-shrink: 0; }

      /* ── Dropdown button ── */
      .nav-dd-btn {
        display: flex; align-items: center; gap: 5px;
        padding: 5px 11px; border-radius: 8px;
        font-size: 0.82rem; font-weight: 500;
        color: var(--muted); background: none; border: none;
        cursor: pointer; font-family: inherit; white-space: nowrap;
        transition: color 150ms, background 150ms;
      }
      .nav-dd-btn:hover, .nav-dd-btn.has-active {
        color: var(--text); background: rgba(0,0,0,0.04);
      }
      .nav-dd-btn.has-active { font-weight: 600; color: var(--text); }
      .nav-dd-arrow { font-size: 0.6rem; opacity: 0.55; transition: transform 200ms; }
      .nav-dd-btn[aria-expanded="true"] .nav-dd-arrow { transform: rotate(180deg); }

      /* ── Dropdown panel ── */
      .nav-dd-menu {
        display: none; position: absolute; top: calc(100% + 8px);
        left: 50%; transform: translateX(-50%);
        background: #fff; border: 1px solid var(--line);
        border-radius: 14px; padding: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
        min-width: 210px; z-index: 300;
        animation: ddIn 160ms ease;
      }
      @keyframes ddIn {
        from { opacity:0; transform: translateX(-50%) translateY(-6px); }
        to   { opacity:1; transform: translateX(-50%) translateY(0); }
      }
      .nav-dd-menu.open { display: block; }

      .nav-dd-item {
        display: flex; align-items: center; gap: 4px;
        padding: 9px 12px; border-radius: 9px;
        font-size: 0.85rem; font-weight: 500;
        text-decoration: none; color: var(--muted);
        transition: background 120ms, color 120ms;
        white-space: nowrap;
      }
      .nav-dd-item:hover { background: rgba(0,0,0,0.04); color: var(--text); }
      .nav-dd-item.active {
        color: var(--accent-dark); font-weight: 700;
        background: rgba(198,77,25,0.06);
      }
      .nav-dd-item-label { flex: 1; }
      .nav-dd-render-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #d1d5db; flex-shrink: 0;
        transition: background 400ms;
      }

      /* ── Server status badge ── */
      .server-status {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 99px;
        font-size: 0.72rem; font-weight: 600;
        border: 1px solid var(--line);
        background: rgba(0,0,0,0.02);
        cursor: default; flex-shrink: 0; white-space: nowrap;
        transition: border-color 300ms;
        margin-left: 6px;
      }
      .server-status-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #9ca3af;
        transition: background 400ms;
        box-shadow: 0 0 0 0 rgba(34,197,94,0);
      }
      .server-status[data-state="online"] .server-status-dot {
        background: #16a34a;
        box-shadow: 0 0 0 3px rgba(34,197,94,0.20);
        animation: pulse-green 2.5s infinite;
      }
      .server-status[data-state="offline"] .server-status-dot {
        background: #dc2626;
      }
      .server-status[data-state="online"] { border-color: rgba(34,197,94,0.30); }
      .server-status[data-state="offline"] { border-color: rgba(220,38,38,0.30); }
      .server-status-label { color: var(--muted); }
      .server-status[data-state="online"] .server-status-label { color: #15803d; }
      .server-status[data-state="offline"] .server-status-label { color: #b91c1c; }

      @keyframes pulse-green {
        0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
        50%      { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
      }

      /* ── Mobile ── */
      @media (max-width: 760px) {
        .nav-dd-menu {
          left: auto; right: 0; transform: none;
          animation: ddInMobile 160ms ease;
        }
        @keyframes ddInMobile {
          from { opacity:0; transform: translateY(-6px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .server-status-label { display: none; }
        .server-status { padding: 4px 7px; margin-left: 2px; }
        #main-nav {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          flex-wrap: nowrap;
          gap: 2px;
        }
        #main-nav::-webkit-scrollbar { display: none; }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── Helper: build dropdown ───
  function makeDropdown(label, items) {
    const isActive = items.some(i => currentPath === i.href);

    const wrapper = document.createElement('div');
    wrapper.className = 'nav-dd';

    const btn = document.createElement('button');
    btn.className = 'nav-dd-btn' + (isActive ? ' has-active' : '');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `${label} <span class="nav-dd-arrow">▼</span>`;

    const menu = document.createElement('div');
    menu.className = 'nav-dd-menu';

    items.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.className = 'nav-dd-item' + (currentPath === item.href ? ' active' : '');
      a.innerHTML = `<span class="nav-dd-item-label">${item.label}</span>`;
      // Small dot for Render-dependent tools (state updated later)
      if (item.render) {
        const dot = document.createElement('span');
        dot.className = 'nav-dd-render-dot';
        dot.dataset.renderDot = '1';
        a.appendChild(dot);
      }
      menu.appendChild(a);
    });

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      // close other dropdowns
      document.querySelectorAll('.nav-dd-menu.open').forEach(m => {
        if (m !== menu) { m.classList.remove('open'); m.previousElementSibling?.setAttribute('aria-expanded','false'); }
      });
    });

    document.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(menu);
    return wrapper;
  }

  // ─── Build nav ───
  // (Home link removed — brand logo/name already links to /)

  // Media Tools dropdown
  nav.appendChild(makeDropdown('🎬 Media', mediaTools));

  // File Converters dropdown
  nav.appendChild(makeDropdown('📄 Files', fileTools));

  // About
  const about = document.createElement('a');
  about.href = '/about'; about.className = 'nav-link'; about.textContent = 'About';
  if (currentPath === '/about') about.classList.add('active');
  nav.appendChild(about);

  // ─── Server Status Badge ───
  const RENDER_URL = window.RENDER_API_URL || 'https://vmediatools.onrender.com';
  const badge = document.createElement('div');
  badge.className = 'server-status';
  badge.setAttribute('data-state', 'checking');
  badge.title = `Backend: ${RENDER_URL}`;
  badge.innerHTML = `<span class="server-status-dot"></span><span class="server-status-label">Server…</span>`;
  nav.appendChild(badge);

  const badgeLabel = badge.querySelector('.server-status-label');
  const renderDots = () => document.querySelectorAll('[data-render-dot]');

  function setServerState(state) {
    badge.setAttribute('data-state', state);
    if (state === 'online') {
      badgeLabel.textContent = 'Online';
      renderDots().forEach(d => { d.style.background = '#16a34a'; });
    } else if (state === 'offline') {
      badgeLabel.textContent = 'Offline';
      renderDots().forEach(d => { d.style.background = '#dc2626'; });
    } else {
      badgeLabel.textContent = 'Server…';
    }
  }

  async function checkServer() {
    try {
      const r = await fetch(`${RENDER_URL}/api/status`, { signal: AbortSignal.timeout(8000) });
      setServerState(r.ok ? 'online' : 'offline');
    } catch {
      setServerState('offline');
    }
  }

  // Check immediately, then every 60 seconds
  checkServer();
  setInterval(checkServer, 60000);

})();
