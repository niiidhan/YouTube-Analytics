/**
 * YT Analytics — Popup UI Script
 * Reads from chrome.storage.local and renders stats for the selected period.
 */

'use strict';

// ─── Utilities ─────────────────────────────────────────────────────────────

function formatTime(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function dateWithOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toLocaleDateString('en-CA');
}

function cleanTitle(title) {
  return (title || '').replace(/^\(\d+\)\s*/, '').trim();
}

function dateRangeSet(period) {
  const dates = new Set();
  const today = new Date();
  if (period === 'today') {
    dates.add(dateWithOffset(0));
  } else if (period === 'week') {
    for (let i = 0; i < 7; i++) dates.add(dateWithOffset(i));
  } else if (period === 'month') {
    for (let i = 0; i < 30; i++) dates.add(dateWithOffset(i));
  }
  // 'all' → empty set means include everything
  return dates;
}

function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ─── State ─────────────────────────────────────────────────────────────────

let currentPeriod = 'today';
let currentTab = 'channels';
let allSessions = [];      // every session_* entry, unfiltered
let filteredSessions = []; // sessions within the current period
let searchQuery = '';      // lowercased live search text
let drillChannel = null;   // channel name being drilled into, or null

// ─── Data loading ───────────────────────────────────────────────────────────

function loadAndRender() {
  // Before reading from storage, tell all YouTube tabs to flush their current session.
  // This ensures background tabs (which might be throttled) update their stats.
  chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
    const promises = tabs.map(t => {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(t.id, { type: 'FORCE_FLUSH' }, () => {
          // ignore result, if it fails (not injected yet) just ignore
          if (chrome.runtime.lastError) {}
          resolve();
        });
      });
    });

    // Wait short time or proceed anyway
    Promise.all(promises).finally(() => {
      chrome.storage.local.get(null, (all) => {
        const sessions = [];
        for (const [key, val] of Object.entries(all)) {
          if (!key.startsWith('session_')) continue;
          const cleanedTitle = cleanTitle(val.title);
          if (cleanedTitle !== val.title) {
            val.title = cleanedTitle;
            chrome.storage.local.set({ [key]: val }); // Fix dirty titles in storage permanently
          }
          sessions.push(val);
        }
        allSessions = sessions;
        render();
      });
    });
  });
}

// Aggregate raw sessions into per-video rows (sum time, keep most recent meta)
function aggregateVideos(sessions) {
  const videoMap = {};
  for (const s of sessions) {
    if (!videoMap[s.videoId]) {
      videoMap[s.videoId] = { ...s };
    } else {
      videoMap[s.videoId].totalSecs += s.totalSecs || 0;
      if (new Date(s.endTime) > new Date(videoMap[s.videoId].endTime)) {
        videoMap[s.videoId].endTime = s.endTime;
        videoMap[s.videoId].title = s.title;
        videoMap[s.videoId].channel = s.channel;
      }
    }
  }
  return Object.values(videoMap).sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
}

// Aggregate raw sessions into per-channel rows (sum time, count videos)
function aggregateChannels(sessions) {
  const channelMap = {};
  for (const s of sessions) {
    const ch = s.channel || 'Unknown';
    if (!channelMap[ch]) channelMap[ch] = { name: ch, secs: 0, count: 0, avatar: null };
    channelMap[ch].secs += s.totalSecs || 0;
    channelMap[ch].count += 1;
    if (s.channelAvatar && !channelMap[ch].avatar) channelMap[ch].avatar = s.channelAvatar;
  }
  return Object.values(channelMap).sort((a, b) => b.secs - a.secs);
}

function render() {
  const dateSet = dateRangeSet(currentPeriod);
  filteredSessions = currentPeriod === 'all'
    ? allSessions
    : allSessions.filter(s => dateSet.has(s.date));

  const totalSecs = filteredSessions.reduce((a, s) => a + (s.totalSecs || 0), 0);
  const uniqueVideos = new Set(filteredSessions.map(s => s.videoId)).size;
  const channelList = aggregateChannels(filteredSessions);

  // ── Hero ring  (r=50, circumference = 2π×50 ≈ 314)
  const maxGoalSecs = 3600;
  const pct = Math.min(totalSecs / maxGoalSecs, 1);
  const circumference = 314;
  document.getElementById('heroTime').textContent = formatTime(totalSecs);
  document.getElementById('heroVideos').textContent = uniqueVideos;
  document.getElementById('heroChannels').textContent = channelList.length;
  document.getElementById('ringProgress').style.strokeDashoffset = circumference - pct * circumference;

  renderTrend();
  renderInsights(totalSecs);

  // ── Render the active view
  if (drillChannel) {
    renderDrill();
  } else if (currentTab === 'videos') {
    renderVideoList(aggregateVideos(filteredSessions));
  } else {
    renderChannelList(channelList);
  }
}

// ─── Trend chart ─────────────────────────────────────────────────────────────

function renderTrend() {
  const days = (currentPeriod === 'today' || currentPeriod === 'week') ? 7 : 30;

  const byDate = {};
  for (const s of allSessions) byDate[s.date] = (byDate[s.date] || 0) + (s.totalSecs || 0);

  const cols = [];
  for (let i = days - 1; i >= 0; i--) {
    const dateStr = dateWithOffset(i);
    cols.push({ date: dateStr, secs: byDate[dateStr] || 0, isToday: i === 0 });
  }

  const maxSecs = Math.max(1, ...cols.map(c => c.secs));
  const total = cols.reduce((a, c) => a + c.secs, 0);

  document.getElementById('trendTitle').textContent = `Last ${days} days`;
  document.getElementById('trendTotal').textContent = total > 0 ? formatTime(total) : '';

  const barsEl = document.getElementById('trendBars');
  barsEl.innerHTML = cols.map(c => {
    const h = Math.max(2, Math.round((c.secs / maxSecs) * 44));
    const lbl = days <= 7
      ? new Date(c.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })
      : '';
    const cls = `trend-col${c.isToday ? ' is-today' : ''}${c.secs > 0 ? ' has-data' : ''}`;
    const tip = `${c.date} · ${formatTime(c.secs)}`;
    return `<div class="${cls}" title="${tip}">
              <div class="trend-bar" style="height:${h}px"></div>
              ${lbl ? `<span class="trend-lbl">${lbl}</span>` : ''}
            </div>`;
  }).join('');
}

// ─── Insight cards ───────────────────────────────────────────────────────────

function renderInsights(totalSecs) {
  const activeDays = new Set(filteredSessions.map(s => s.date)).size || 1;
  const avg = totalSecs / activeDays;

  const longest = filteredSessions.reduce((m, s) => Math.max(m, s.totalSecs || 0), 0);

  // Peak hour — weight each hour-of-day by seconds watched
  const hourBuckets = new Array(24).fill(0);
  for (const s of filteredSessions) {
    const t = s.endTime || s.startTime;
    if (!t) continue;
    const h = new Date(t).getHours();
    if (!isNaN(h)) hourBuckets[h] += s.totalSecs || 0;
  }
  let peakHour = -1, peakVal = 0;
  hourBuckets.forEach((v, h) => { if (v > peakVal) { peakVal = v; peakHour = h; } });

  document.getElementById('insAvg').textContent = formatTime(Math.round(avg));
  document.getElementById('insLongest').textContent = formatTime(longest);
  document.getElementById('insPeak').textContent = peakHour < 0 ? '—' : formatHour(peakHour);
}

function formatHour(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${period}`;
}

// ─── Channel drill-down ──────────────────────────────────────────────────────

function renderDrill() {
  const drillHead = document.getElementById('drillHead');
  const sessions = filteredSessions.filter(s => (s.channel || 'Unknown') === drillChannel);
  const secs = sessions.reduce((a, s) => a + (s.totalSecs || 0), 0);

  drillHead.hidden = false;
  document.getElementById('drillName').textContent = drillChannel;
  document.getElementById('drillName').title = drillChannel;
  document.getElementById('drillTime').textContent = formatTime(secs);

  // Hide the channel list, show videos for this channel
  document.getElementById('channelList').hidden = true;
  renderVideoList(aggregateVideos(sessions), true);
}

function exitDrill() {
  drillChannel = null;
  document.getElementById('drillHead').hidden = true;
  render();
}

// ─── Video list ─────────────────────────────────────────────────────────────

function renderVideoList(videos, isDrill = false) {
  const emptyEl = document.getElementById('emptyState');
  const listEl = document.getElementById('videoList');

  if (currentTab !== 'videos' && !isDrill) return;

  if (searchQuery) {
    videos = videos.filter(v =>
      (v.title || '').toLowerCase().includes(searchQuery) ||
      (v.channel || '').toLowerCase().includes(searchQuery)
    );
  }

  document.getElementById('channelList').hidden = true;

  if (videos.length === 0) {
    emptyEl.hidden = false;
    listEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';

  for (const v of videos) {
    const li = document.createElement('li');
    li.className = 'video-item';

    const thumbUrl = v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

    li.innerHTML = `
      <img class="video-thumb" src="${thumbUrl}" alt="" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <div class="video-thumb-placeholder" style="display:none">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a5a6e" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>
      <div class="video-info">
        <div class="video-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
        <div class="video-channel">${escHtml(v.channel)}</div>
      </div>
      <span class="video-time">${formatTime(v.totalSecs || 0)}</span>
    `;
    listEl.appendChild(li);
  }
}

// ─── Channel list ────────────────────────────────────────────────────────────

// Deterministic colour from channel name (always same colour per channel)
const AVATAR_COLORS = [
  '#e53935', '#d81b60', '#8e24aa', '#5e35b1',
  '#1e88e5', '#039be5', '#00897b', '#43a047',
  '#f4511e', '#fb8c00', '#fdd835', '#6d4c41',
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function renderChannelList(channels) {
  const emptyEl = document.getElementById('emptyState');
  const channelEl = document.getElementById('channelList');
  const videoEl = document.getElementById('videoList');

  if (currentTab !== 'channels') return;

  document.getElementById('drillHead').hidden = true;
  videoEl.hidden = true;

  if (searchQuery) {
    channels = channels.filter(c => (c.name || '').toLowerCase().includes(searchQuery));
  }

  if (channels.length === 0) {
    emptyEl.hidden = false;
    channelEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  channelEl.hidden = false;
  channelEl.innerHTML = '';

  for (const c of channels) {
    const initial = (c.name || '?').charAt(0).toUpperCase();
    const color = avatarColor(c.name || '');
    const li = document.createElement('li');
    li.className = 'channel-item';
    li.dataset.channel = c.name;
    li.title = `View ${c.name}'s videos`;

    // Build avatar: real image when available, letter circle as fallback
    const avatarHtml = c.avatar
      ? `<div class="channel-avatar" style="background:${color};padding:0;overflow:hidden">
           <img class="channel-avatar-img" src="${escHtml(c.avatar)}" alt=""
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <span class="channel-avatar-letter" style="display:none">${initial}</span>
         </div>`
      : `<div class="channel-avatar" style="background:${color}">${initial}</div>`;

    li.innerHTML = `
      ${avatarHtml}
      <div class="channel-info">
        <div class="channel-name" title="${escHtml(c.name)}">${escHtml(c.name)}</div>
        <div class="channel-vid-count">${c.count} video${c.count !== 1 ? 's' : ''}</div>
      </div>
      <span class="channel-time">${formatTime(c.secs)}</span>
    `;
    channelEl.appendChild(li);
  }
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function switchContent(tab) {
  currentTab = tab;
  drillChannel = null; // leaving a tab cancels any channel drill-down
  document.getElementById('drillHead').hidden = true;
  document.querySelectorAll('.content-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const videoListEl = document.getElementById('videoList');
  const channelListEl = document.getElementById('channelList');
  const emptyEl = document.getElementById('emptyState');

  // Explicitly manage visibility — can't rely solely on hidden attr
  // because render functions only update the ACTIVE tab's list
  videoListEl.hidden = (tab !== 'videos');
  channelListEl.hidden = (tab !== 'channels');
  emptyEl.hidden = true;

  loadAndRender();
}

// ─── Event bindings ─────────────────────────────────────────────────────────

// Period buttons
document.querySelectorAll('.period-btn[data-period]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentPeriod = btn.dataset.period;
    // Only remove active from other period buttons
    document.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadAndRender();
  });
});

// Content tabs
document.querySelectorAll('.content-tab').forEach(btn => {
  btn.addEventListener('click', () => switchContent(btn.dataset.tab));
});

// Channel drill-down (delegated) — click a channel row to see its videos
document.getElementById('channelList').addEventListener('click', (e) => {
  const li = e.target.closest('.channel-item');
  if (!li || !li.dataset.channel) return;
  drillChannel = li.dataset.channel;
  render();
  document.querySelector('.main').scrollTop = 0;
});

// Drill back button
document.getElementById('drillBack').addEventListener('click', exitDrill);

// ─── Search ───────────────────────────────────────────────────────────────────

const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');

document.getElementById('searchToggle').addEventListener('click', () => {
  const willShow = searchBar.hidden;
  searchBar.hidden = !willShow;
  document.getElementById('searchToggle').classList.toggle('active', willShow);
  if (willShow) {
    searchInput.focus();
  } else {
    searchInput.value = '';
    searchQuery = '';
    searchBar.classList.remove('has-text');
    render();
  }
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  searchBar.classList.toggle('has-text', searchInput.value.length > 0);
  render();
});

document.getElementById('searchClear').addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchBar.classList.remove('has-text');
  searchInput.focus();
  render();
});

// ─── Export ───────────────────────────────────────────────────────────────────

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportData(format) {
  // Always export the full dataset (all sessions), most recent first
  const rows = [...allSessions].sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
  if (rows.length === 0) { showToast('No data to export'); return; }

  const stamp = dateWithOffset(0);
  if (format === 'json') {
    triggerDownload(JSON.stringify(rows, null, 2), `focusflow-${stamp}.json`, 'application/json');
  } else {
    const header = ['Date', 'Channel', 'Video Title', 'Time Watched (s)', 'Last Watched'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([r.date, r.channel, r.title, Math.round(r.totalSecs || 0), r.endTime].map(csvCell).join(','));
    }
    triggerDownload(lines.join('\n'), `focusflow-${stamp}.csv`, 'text/csv');
  }
  showToast(`✓ Exported ${rows.length} sessions`);
}

document.getElementById('exportCsvBtn').addEventListener('click', () => exportData('csv'));
document.getElementById('exportJsonBtn').addEventListener('click', () => exportData('json'));

// Settings open / close
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', closeSettings);
document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSettings();
});

function openSettings() {
  const overlay = document.getElementById('settingsOverlay');
  overlay.hidden = false;
  // Load stored spreadsheetId
  chrome.runtime.sendMessage({ type: 'GET_SPREADSHEET_ID' }, (res) => {
    if (res?.id) {
      document.getElementById('spreadsheetInput').value = res.id;
      setStatus('connected', 'Connected');
    } else {
      setStatus('', 'Not connected');
    }
  });
}

function closeSettings() {
  document.getElementById('settingsOverlay').hidden = true;
}

function setStatus(state, text) {
  const dot = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  dot.className = `status-dot ${state}`;
  span.textContent = text;
}

// Connect Google Sheets
document.getElementById('connectSheetsBtn').addEventListener('click', () => {
  const id = document.getElementById('spreadsheetInput').value.trim();
  if (!id) { showToast('Please paste a Spreadsheet ID'); return; }

  setStatus('', 'Connecting…');

  chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN_INTERACTIVE' }, (res) => {
    if (!res?.token) {
      setStatus('error', 'Auth failed');
      showToast('Google sign-in failed');
      return;
    }
    chrome.runtime.sendMessage({ type: 'SET_SPREADSHEET_ID', id }, () => {
      setStatus('connected', 'Connected');
      showToast('✓ Sheets connected!');
    });
  });
});

// Reload button
document.getElementById('reloadBtn').addEventListener('click', () => {
  const btn = document.getElementById('reloadBtn');
  const icon = btn.querySelector('.nav-icon');
  
  icon.classList.add('spinning');
  loadAndRender();
  
  setTimeout(() => {
    icon.classList.remove('spinning');
    showToast('✓ Data Refreshed');
  }, 700);
});

// Clear data
document.getElementById('clearDataBtn').addEventListener('click', () => {
  if (!confirm('Clear ALL tracking data? This cannot be undone.')) return;
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter(k => k.startsWith('session_') || k === 'pendingSync');
    chrome.storage.local.remove(keys, () => {
      closeSettings();
      loadAndRender();
      showToast('Data cleared');
    });
  });
});

// Night Mode Toggle
document.getElementById('nightModeBtn').addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-mode');
  chrome.storage.local.set({ theme: isLight ? 'light' : 'night' });
});

// ─── Init ────────────────────────────────────────────────────────────────────

loadAndRender();

// Live-update every 5 s while popup is open
setInterval(loadAndRender, 5000);

// Listen for storage changes (from content script)
chrome.storage.onChanged.addListener((changes) => {
  const hasSessionChange = Object.keys(changes).some(k => k.startsWith('session_'));
  if (hasSessionChange) loadAndRender();
});

// Initialize Theme
chrome.storage.local.get(['theme'], (res) => {
  if (res.theme === 'light') {
    document.body.classList.add('light-mode');
  }
});
