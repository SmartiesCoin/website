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

  const formatUsd = (value, maxFractionDigits = 6) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: maxFractionDigits
    }).format(numeric);
  };

  const tryParseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  };

  const extractJsonObject = (text) => {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    return tryParseJson(text.slice(first, last + 1));
  };

  const fetchText = async (url) => {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  };

  const loadLocalLiveData = async () => {
    const response = await fetch(`assets/live-data.json?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`Local data error ${response.status}`);
    }
    return response.json();
  };

  const isValidSummary = (summary) => {
    if (!summary || typeof summary !== 'object') return false;
    return summary.blockcount !== undefined && summary.difficulty !== undefined;
  };

  const fetchExplorerSummary = async () => {
    const summaryUrl = 'https://explorer.smartiecoin.com/ext/getsummary';
    const allOriginsRaw = `https://api.allorigins.win/raw?url=${encodeURIComponent(summaryUrl)}`;
    const allOriginsGet = `https://api.allorigins.win/get?url=${encodeURIComponent(summaryUrl)}`;
    const jinaMirror = 'https://r.jina.ai/http://explorer.smartiecoin.com/ext/getsummary';

    const sources = [
      { name: 'explorer', url: summaryUrl, parser: 'json' },
      { name: 'allorigins raw', url: allOriginsRaw, parser: 'json' },
      { name: 'allorigins get', url: allOriginsGet, parser: 'allorigins' },
      { name: 'jina mirror', url: jinaMirror, parser: 'jina' }
    ];

    for (const source of sources) {
      try {
        const text = await fetchText(source.url);
        let parsed = null;

        if (source.parser === 'json') {
          parsed = tryParseJson(text);
        } else if (source.parser === 'allorigins') {
          const wrapped = tryParseJson(text);
          parsed = wrapped?.contents ? tryParseJson(wrapped.contents) : null;
        } else if (source.parser === 'jina') {
          parsed = extractJsonObject(text);
        }

        if (isValidSummary(parsed)) {
          return { summary: parsed, source: source.name };
        }
      } catch (_error) {
        // continue to next source
      }
    }

    throw new Error('Could not load summary from any source');
  };

  const fetchMetricViaAllOrigins = async (path) => {
    const target = `https://explorer.smartiecoin.com${path}`;
    const url = `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`;
    const text = await fetchText(url);
    const wrapped = tryParseJson(text);
    if (!wrapped || typeof wrapped.contents !== 'string') {
      throw new Error('Invalid wrapped response');
    }
    return wrapped.contents.trim();
  };

  const fetchFallbackSummary = async () => {
    const fields = {
      blockcount: null,
      difficulty: null,
      hashrate: null,
      supply: null,
      connections: null,
      lastUSDPrice: null
    };

    const jobs = [
      ['blockcount', '/api/getblockcount'],
      ['difficulty', '/api/getdifficulty'],
      ['hashrate', '/api/getnetworkhashps'],
      ['supply', '/ext/getmoneysupply'],
      ['connections', '/api/getconnectioncount']
    ];

    await Promise.all(jobs.map(async ([field, path]) => {
      try {
        const rawValue = await fetchMetricViaAllOrigins(path);
        const numeric = Number(rawValue);
        fields[field] = Number.isFinite(numeric) ? numeric : null;
      } catch (_error) {
        fields[field] = null;
      }
    }));

    try {
      const rawPriceJson = await fetchMetricViaAllOrigins('/ext/getcurrentprice');
      const parsedPrice = tryParseJson(rawPriceJson);
      const priceUsd = Number(parsedPrice?.last_price_usd);
      fields.lastUSDPrice = Number.isFinite(priceUsd) ? priceUsd : null;
    } catch (_error) {
      fields.lastUSDPrice = null;
    }

    if (Object.values(fields).every((value) => value === null)) {
      throw new Error('Fallback metrics unavailable');
    }

    return {
      blockcount: fields.blockcount,
      difficulty: fields.difficulty,
      hashrate: fields.hashrate,
      supply: fields.supply,
      connections: fields.connections,
      lastUSDPrice: fields.lastUSDPrice,
      masternodeCountOnline: '-',
      masternodeCountOffline: '-'
    };
  };

  const updateReleaseData = async () => {
    try {
      const localData = await loadLocalLiveData();
      const localRelease = localData?.release;

      if (localRelease && (localRelease.tag_name || localRelease.name)) {
        const version = localRelease.tag_name || localRelease.name || 'Unknown';
        const publishedDate = localRelease.published_at
          ? new Date(localRelease.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
          : '--';

        setText('[data-release-version]', version);
        setText('[data-release-date]', publishedDate);

        const releaseLink = document.querySelector('#latest-release-link');
        const releaseLinkText = document.querySelector('#latest-release-link-text');

        if (releaseLink && localRelease.html_url) {
          releaseLink.href = localRelease.html_url;
        }

        if (releaseLinkText) {
          releaseLinkText.textContent = `${version} published ${publishedDate}. Open details on GitHub.`;
        }
        return;
      }
    } catch (_error) {
      // fallback to GitHub API below
    }

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
    const statusEl = document.querySelector('#stats-status');
    const updatedEl = document.querySelector('#stats-updated');

    try {
      let summaryData = null;
      let localPriceUsd = null;
      let sourceName = '';

      try {
        const localData = await loadLocalLiveData();
        if (isValidSummary(localData?.summary)) {
          summaryData = localData.summary;
          const parsedLocalPrice = Number(localData?.current_price?.last_price_usd);
          localPriceUsd = Number.isFinite(parsedLocalPrice) ? parsedLocalPrice : null;
          sourceName = 'local cache';
        }
      } catch (_error) {
        // fallback below
      }

      if (!summaryData) {
        try {
          const result = await fetchExplorerSummary();
          summaryData = result.summary;
          sourceName = result.source;
        } catch (_error) {
          summaryData = await fetchFallbackSummary();
          sourceName = 'allorigins fallback';
        }
      }

      const masternodes = (() => {
        const online = summaryData.masternodeCountOnline;
        const offline = summaryData.masternodeCountOffline;
        if (online === undefined || offline === undefined) return '--';
        if (String(online) === '-' || String(offline) === '-') return 'N/A';
        return `${online}/${offline}`;
      })();

      const priceUsd = (() => {
        const candidate = [
          localPriceUsd,
          summaryData.lastUSDPrice,
          summaryData.last_price_usd,
          summaryData.price_usd
        ].map((v) => Number(v)).find((v) => Number.isFinite(v));
        return Number.isFinite(candidate) ? candidate : null;
      })();

      const marketCapUsd = (() => {
        const supply = Number(summaryData.supply);
        if (!Number.isFinite(priceUsd) || !Number.isFinite(supply)) return null;
        return supply * priceUsd;
      })();

      setText('[data-stat="blockcount"]', formatNumber(summaryData.blockcount));
      setText('[data-stat="difficulty"]', formatDifficulty(summaryData.difficulty));
      setText('[data-stat="hashrate"]', formatHashrate(summaryData.hashrate));
      setText('[data-stat="supply"]', `${formatNumber(summaryData.supply, 2)} SMT`);
      setText('[data-stat="price"]', formatUsd(priceUsd));
      setText('[data-stat="marketcap"]', formatUsd(marketCapUsd, 2));
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
      setText('[data-stat="price"]', '--');
      setText('[data-stat="marketcap"]', '--');
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
