(() => {
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('#primary-nav');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const revealItems = document.querySelectorAll('[data-reveal]');
  if (revealItems.length) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.18,
      rootMargin: '0px 0px -30px 0px'
    });

    revealItems.forEach((item) => observer.observe(item));
  }

  const yearEl = document.querySelector('#year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.textContent = value;
    });
  };

  const formatNumber = (value, maxFractionDigits = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(numeric);
  };

  const formatDifficulty = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    if (numeric < 1) return numeric.toFixed(6);
    return formatNumber(numeric, 2);
  };

  const formatHashrate = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';

    const units = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s'];
    let unitIndex = 0;
    let scaled = numeric;

    while (scaled >= 1000 && unitIndex < units.length - 1) {
      scaled /= 1000;
      unitIndex += 1;
    }

    return `${scaled.toFixed(scaled >= 100 ? 0 : 2)} ${units[unitIndex]}`;
  };

  const parseJsonResponse = async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return JSON.parse(text);
  };

  const fetchJsonWithFallback = async (urls) => {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        return await parseJsonResponse(response);
      } catch (_error) {
        // try next endpoint
      }
    }

    throw new Error('All endpoints failed');
  };

  const updateReleaseData = async () => {
    const endpoint = 'https://api.github.com/repos/SmartiesCoin/Smartiecoin/releases/latest';

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error ${response.status}`);
      }

      const release = await response.json();
      const version = release.tag_name || release.name || 'Unknown';
      const publishedDate = release.published_at
        ? new Date(release.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
        : '--';

      setText('[data-release-version]', version);
      setText('[data-release-date]', publishedDate);

      const releaseLink = document.querySelector('#latest-release-link');
      const releaseLinkText = document.querySelector('#latest-release-link-text');

      if (releaseLink && release.html_url) {
        releaseLink.href = release.html_url;
      }

      if (releaseLinkText) {
        releaseLinkText.textContent = `${version} published ${publishedDate}. Open details on GitHub.`;
      }
    } catch (_error) {
      setText('[data-release-version]', 'Unavailable');
      setText('[data-release-date]', '--');
    }
  };

  const updateExplorerStats = async () => {
    const primary = 'https://explorer.smartiecoin.com/ext/getsummary';
    const fallback = `https://api.allorigins.win/raw?url=${encodeURIComponent(primary)}`;

    const statusEl = document.querySelector('#stats-status');
    const updatedEl = document.querySelector('#stats-updated');

    try {
      const summary = await fetchJsonWithFallback([primary, fallback]);

      const masternodes = (() => {
        const online = summary.masternodeCountOnline;
        const offline = summary.masternodeCountOffline;
        if (online === undefined || offline === undefined) return '--';
        if (String(online) === '-' || String(offline) === '-') return 'N/A';
        return `${online}/${offline}`;
      })();

      setText('[data-stat="blockcount"]', formatNumber(summary.blockcount));
      setText('[data-stat="difficulty"]', formatDifficulty(summary.difficulty));
      setText('[data-stat="hashrate"]', formatHashrate(summary.hashrate));
      setText('[data-stat="supply"]', `${formatNumber(summary.supply, 2)} SMT`);
      setText('[data-stat="connections"]', formatNumber(summary.connections));
      setText('[data-stat="masternodes"]', masternodes);

      if (updatedEl) {
        updatedEl.textContent = `(updated ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`;
      }

      if (statusEl) {
        statusEl.classList.remove('is-error');
      }
    } catch (_error) {
      setText('[data-stat="blockcount"]', '--');
      setText('[data-stat="difficulty"]', '--');
      setText('[data-stat="hashrate"]', '--');
      setText('[data-stat="supply"]', '--');
      setText('[data-stat="connections"]', '--');
      setText('[data-stat="masternodes"]', '--');

      if (updatedEl) {
        updatedEl.textContent = '(could not load explorer stats right now)';
      }

      if (statusEl) {
        statusEl.classList.add('is-error');
      }
    }
  };

  updateReleaseData();
  updateExplorerStats();
  setInterval(updateExplorerStats, 60000);
})();
