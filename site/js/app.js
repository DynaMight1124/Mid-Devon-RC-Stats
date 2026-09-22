/**
 * Motorsport Analytics Dashboard - Single Page Application
 */

function slugify(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const App = {
  data: {
    club: null,
    drivers: [],
    classes: {},
    meetings: [],
    h2h: []
  },
  currentTab: 'dashboard',
  selectedClassTab: '2WD Buggy',

  async init() {
    console.log("[App] Initializing dashboard...");
    this.bindGlobalEvents();

    try {
      // Load core datasets in parallel
      const [clubResp, driversResp, classesResp, meetingsResp, h2hResp] = await Promise.all([
        fetch('data/club.json'),
        fetch('data/drivers.json'),
        fetch('data/classes.json'),
        fetch('data/meetings.json'),
        fetch('data/h2h.json')
      ]);

      if (!clubResp.ok || !driversResp.ok) {
        throw new Error("Data files not found. Run scraper and aggregator first.");
      }

      this.data.club = await clubResp.json();
      this.data.drivers = await driversResp.json();
      this.data.classes = await classesResp.json();
      this.data.meetings = await meetingsResp.json();
      this.data.h2h = await h2hResp.json();

      this.renderClubHeader();
      this.renderDashboard();
      this.renderDrivers();
      this.renderClasses();
      this.renderMeetings();

      // Initialize H2H module
      if (window.AppH2H) {
        window.AppH2H.init(this.data.h2h, this.data.drivers);
      }

      // Check URL hash for direct tab navigation
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'drivers', 'classes', 'h2h', 'meetings'].includes(hash)) {
        this.switchTab(hash);
      } else {
        this.switchTab('dashboard');
      }

      console.log("[App] Ready!");
    } catch (err) {
      console.error("[App] Initialization error:", err);
      document.getElementById('loading-overlay').innerHTML = `
        <div style="text-align: center; color: #f43f5e; padding: 2rem;">
          <h3>⚠️ Unable to load stats data</h3>
          <p style="color: var(--text-muted); margin-top: 0.5rem;">${err.message}</p>
        </div>
      `;
    }
  },

  bindGlobalEvents() {
    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.dataset.tab;
        if (tab) {
          this.switchTab(tab);
          window.location.hash = tab;
        }
      });
    });

    // Modal close buttons & backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('.modal-close')) {
          modal.classList.remove('open');
        }
      });
    });

    // Escape key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
      }
    });

    // Driver search and filters
    const searchInput = document.getElementById('driver-search');
    const classFilter = document.getElementById('driver-class-filter');
    const sortFilter = document.getElementById('driver-sort-filter');

    if (searchInput) searchInput.addEventListener('input', () => this.filterDrivers());
    if (classFilter) classFilter.addEventListener('change', () => this.filterDrivers());
    if (sortFilter) sortFilter.addEventListener('change', () => this.filterDrivers());

    // Meeting season filter
    const seasonFilter = document.getElementById('meeting-season-filter');
    if (seasonFilter) seasonFilter.addEventListener('change', () => this.filterMeetings());
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.section-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabName}`);
    });

    if (tabName === 'classes') {
      this.renderClasses();
    } else if (tabName === 'h2h' && window.AppH2H) {
      window.AppH2H.handleSelectionChange();
    }
  },

  renderClubHeader() {
    const config = this.data.club.config || {};
    const clubNameEl = document.getElementById('header-club-name');
    const taglineEl = document.getElementById('header-tagline');
    const resultsLink = document.getElementById('header-results-link');
    const brandIcon = document.querySelector('.brand-icon');

    if (config.clubName) {
      document.title = `${config.clubName} - ${config.tagline || 'Results & Analytics'}`;
    }
    if (brandIcon && config.shortName) {
      brandIcon.textContent = config.shortName;
      if (config.shortName.length <= 2) {
        brandIcon.style.fontSize = '1.2rem';
        brandIcon.style.padding = '0 0.5rem';
      } else if (config.shortName.length <= 4) {
        brandIcon.style.fontSize = '1.05rem';
        brandIcon.style.padding = '0 0.65rem';
      } else {
        brandIcon.style.fontSize = '0.9rem';
        brandIcon.style.padding = '0 0.75rem';
      }
    }
    if (clubNameEl) clubNameEl.textContent = config.clubName || "RC Results Club";
    if (taglineEl) taglineEl.textContent = config.tagline || "Analytics & Performance Hub";
    if (resultsLink && config.website) resultsLink.href = config.website;

    // Apply custom theme colors if specified in config
    if (config.primaryColor) {
      document.documentElement.style.setProperty('--color-primary', config.primaryColor);
    }
    if (config.secondaryColor) {
      document.documentElement.style.setProperty('--color-accent-blue', config.secondaryColor);
    }

    // Populate header action links (e.g. RC-Results, Facebook)
    const headerActions = document.getElementById('header-actions');
    if (headerActions && config.socialLinks) {
      const fbLink = config.socialLinks.Facebook || config.socialLinks.facebook;
      const resLink = config.socialLinks.results || config.website;

      let extraHtml = '<span class="badge badge-green" style="font-size: 0.75rem;">● LIVE DATA</span>';
      if (resLink) {
        extraHtml += `<a href="${resLink}" target="_blank" rel="noopener" class="nav-btn" style="background: rgba(255,255,255,0.06); font-size: 0.8rem; padding: 0.4rem 0.8rem;">RC-Results ↗</a>`;
      }
      if (fbLink) {
        extraHtml += `<a href="${fbLink}" target="_blank" rel="noopener" class="nav-btn" style="background: rgba(24, 119, 242, 0.25); color: #38bdf8; border: 1px solid rgba(24, 119, 242, 0.5); font-size: 0.8rem; padding: 0.4rem 0.8rem;">Facebook ↗</a>`;
      }
      headerActions.innerHTML = extraHtml;
    }

    // Populate footer club info
    const footerClub = document.getElementById('footer-club-info');
    if (footerClub && config.clubName) {
      const details = [config.clubName, config.trackType, config.location].filter(Boolean);
      footerClub.innerHTML = `<b>${details[0]}</b>` + details.slice(1).map(d => ` &bull; ${d}`).join('');
    }
  },

  renderDashboard() {
    const stats = this.data.club.stats || {};
    const superlatives = this.data.club.superlatives || {};

    // Core Metrics
    document.getElementById('stat-total-meetings').textContent = stats.total_meetings || 0;
    document.getElementById('stat-total-drivers').textContent = stats.total_unique_drivers || 0;
    document.getElementById('stat-total-laps').textContent = (stats.total_laps_driven || 0).toLocaleString();
    document.getElementById('stat-total-races').textContent = (stats.total_races_run || 0).toLocaleString();

    // Superlatives
    const busiest = superlatives.busiest_meeting;
    if (busiest) {
      document.getElementById('sup-busiest-val').textContent = `${busiest.drivers_count} Racers`;
      document.getElementById('sup-busiest-meta').textContent = `${busiest.title} (${busiest.date})`;
    }

    const mostLaps = superlatives.most_laps_meeting;
    if (mostLaps) {
      document.getElementById('sup-laps-val').textContent = `${(mostLaps.total_laps || 0).toLocaleString()} Laps`;
      document.getElementById('sup-laps-meta').textContent = `${mostLaps.title} (${mostLaps.date})`;
    }

    const closest = superlatives.closest_finish;
    if (closest) {
      document.getElementById('sup-closest-val').textContent = `${closest.margin}s Gap`;
      document.getElementById('sup-closest-meta').textContent = `${closest.winner} vs ${closest.runner_up} (${closest.class})`;
    }

    // A-Final Elite Leaders
    const afinalContainer = document.getElementById('dashboard-afinal-leaders');
    if (afinalContainer) {
      const topA = this.data.club.top_afinalists || [];
      afinalContainer.innerHTML = `
        <div class="table-responsive" style="max-height: 290px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Racer</th>
                <th>A-Finals</th>
                <th>A-Final Rate</th>
                <th>Wins</th>
                <th>Avg Finish</th>
              </tr>
            </thead>
            <tbody>
              ${topA.map(d => {
                const aClasses = (d.a_finals_by_class && Object.keys(d.a_finals_by_class).length > 0)
                  ? Object.keys(d.a_finals_by_class)
                  : (d.classes || []);
                const roundedAvg = d.a_final_avg_pos ? `P${Math.round(d.a_final_avg_pos)}` : '-';
                return `
                  <tr onclick="App.openDriverModal('${d.slug}')">
                    <td>
                      <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${d.name}</div>
                      <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.15rem;">${aClasses.join(' &bull; ')}</div>
                    </td>
                    <td class="tabular-nums"><b>${d.a_final_appearances}</b></td>
                    <td><span class="badge ${d.a_final_rate >= 80 ? 'badge-winner' : 'badge-blue'}">${d.a_final_rate}%</span></td>
                    <td class="tabular-nums"><b>${d.a_final_wins}</b></td>
                    <td class="tabular-nums" style="color: var(--color-accent-gold); font-weight: 700;" title="Exact average: P${d.a_final_avg_pos}">${roundedAvg}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Recent Winners
    const recentContainer = document.getElementById('dashboard-recent-winners');
    if (recentContainer) {
      const recent = this.data.club.recent_meetings || [];
      recentContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 290px; overflow-y: auto;">
          ${recent.map(rm => {
            const winnersText = Object.entries(rm.winners || {}).map(([cls, w]) => `
              <div style="font-size: 0.82rem; margin-top: 0.2rem;">
                <span style="color: var(--text-dim);">${cls}:</span> <b style="color: #fff;">${w.driver}</b> 
                <span class="badge badge-winner" style="margin-left: 0.3rem;">${w.result}</span>
              </div>
            `).join('');
            return `
              <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                  <b style="color: #38bdf8; font-size: 0.9rem;">${rm.title}</b>
                  <small style="color: var(--text-dim);">${rm.date}</small>
                </div>
                ${winnersText}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Render Charts
    if (window.AppCharts && typeof window.AppCharts.initAttendanceChart === 'function') {
      window.AppCharts.initAttendanceChart('chart-attendance', this.data.club.attendance_trend || []);
      window.AppCharts.initClassBreakdownChart('chart-classes', this.data.classes || {});
    }

    // Populate Driver Class Filter options
    const classFilter = document.getElementById('driver-class-filter');
    if (classFilter) {
      const classNames = Object.keys(this.data.classes);
      classFilter.innerHTML = '<option value="">All Classes</option>' + 
        classNames.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Populate Season Filter
    const seasonFilter = document.getElementById('meeting-season-filter');
    if (seasonFilter) {
      const seasons = [...new Set(this.data.meetings.map(m => m.season))];
      seasonFilter.innerHTML = '<option value="">All Seasons</option>' +
        seasons.map(s => `<option value="${s}">Season ${s}</option>`).join('');
    }
  },

  renderDrivers() {
    this.filterDrivers();
  },

  filterDrivers() {
    const q = (document.getElementById('driver-search')?.value || '').trim().toLowerCase();
    const cls = document.getElementById('driver-class-filter')?.value || '';
    const sort = document.getElementById('driver-sort-filter')?.value || 'wins';

    let list = [...this.data.drivers];

    // Filter text
    if (q) {
      list = list.filter(d => d.name.toLowerCase().includes(q));
    }
    // Filter class
    if (cls) {
      list = list.filter(d => d.classes.includes(cls));
    }

    // Sort
    if (sort === 'wins') {
      list.sort((a, b) => (b.a_final_wins - a.a_final_wins) || (b.a_final_podiums - a.a_final_podiums) || (b.meetings_count - a.meetings_count));
    } else if (sort === 'afinals') {
      list.sort((a, b) => (b.a_final_appearances - a.a_final_appearances) || (b.a_final_wins - a.a_final_wins) || (b.a_final_rate - a.a_final_rate));
    } else if (sort === 'afinal_rate') {
      list.sort((a, b) => (b.a_final_rate - a.a_final_rate) || (b.a_final_appearances - a.a_final_appearances));
    } else if (sort === 'podiums') {
      list.sort((a, b) => (b.a_final_podiums - a.a_final_podiums) || (b.a_final_wins - a.a_final_wins));
    } else if (sort === 'laps') {
      list.sort((a, b) => b.total_laps - a.total_laps);
    } else if (sort === 'attendance') {
      list.sort((a, b) => b.attendance_pct - a.attendance_pct);
    } else if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const tbody = document.getElementById('drivers-table-body');
    const countEl = document.getElementById('drivers-count-display');
    if (countEl) countEl.textContent = `Showing ${list.length} racers`;

    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 2rem;">No matching racers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((d, index) => {
      let badgeHtml = '';
      if (d.a_final_wins >= 3) {
        badgeHtml = `<span class="badge badge-winner">🏆 Champion</span>`;
      } else if (d.a_final_wins >= 1) {
        badgeHtml = `<span class="badge badge-winner">🥇 Winner</span>`;
      } else if (d.a_final_podiums >= 1) {
        badgeHtml = `<span class="badge badge-gold">🥈 Podium</span>`;
      } else if (d.attendance_pct >= 70) {
        badgeHtml = `<span class="badge badge-blue">🛡️ Veteran</span>`;
      }

      const rateClass = d.a_final_rate >= 80 ? 'badge-winner' : (d.a_final_rate >= 50 ? 'badge-gold' : 'badge-blue');

      return `
        <tr onclick="App.openDriverModal('${d.slug}')">
          <td style="color: var(--text-dim); font-weight: 700;">#${index + 1}</td>
          <td>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${d.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${d.classes.join(' &bull; ')}</div>
          </td>
          <td>${badgeHtml || '<span style="color: var(--text-dim);">-</span>'}</td>
          <td class="tabular-nums"><b>${d.a_final_appearances || 0}</b></td>
          <td><span class="badge ${rateClass}">${d.a_final_rate || 0}%</span></td>
          <td class="tabular-nums"><b>${d.a_final_wins}</b></td>
          <td class="tabular-nums">${d.a_final_podiums}</td>
          <td class="tabular-nums">${d.meetings_count} <small style="color: var(--text-dim);">(${d.attendance_pct}%)</small></td>
          <td class="tabular-nums">${d.total_laps.toLocaleString()}</td>
        </tr>
      `;
    }).join('');
  },

  async openDriverModal(slugOrName) {
    const slug = slugify(slugOrName);
    const modal = document.getElementById('driver-modal');
    if (!modal) return;

    modal.classList.add('open');
    document.getElementById('modal-driver-content').innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 3rem;">
        Loading driver profile...
      </div>
    `;

    try {
      const resp = await fetch(`data/drivers/${slug}.json`);
      if (!resp.ok) throw new Error("Profile not found");
      const profile = await resp.json();
      const s = profile.summary;
      const pb = profile.personal_bests;

      const badgesHtml = (profile.badges || []).map(b => `
        <span class="badge badge-gold" title="${b.desc}">
          ${b.label}
        </span>
      `).join(' ');

      // Build PBs table across classes
      const classesRaced = Object.keys(pb.highest_finishes_per_class || {});
      const pbRows = classesRaced.map(cls => {
        const hf = pb.highest_finishes_per_class[cls];
        const runPB = pb.best_runs_per_class ? pb.best_runs_per_class[cls] : null;
        const hq = pb.highest_quals_per_class ? pb.highest_quals_per_class[cls] : null;
        const aFinalsCount = (s.a_finals_by_class && s.a_finals_by_class[cls]) ? s.a_finals_by_class[cls] : 0;

        return `
          <tr>
            <td><b>${cls}</b></td>
            <td><span class="badge badge-winner">${hf ? `${hf.final} (P${hf.position})` : '-'}</span></td>
            <td>${hq ? (hq === 1 ? '<b style="color: var(--color-accent-gold)">TQ</b>' : `P${hq}`) : '-'}</td>
            <td class="tabular-nums"><b style="color: #38bdf8;">${aFinalsCount}</b></td>
            <td class="tabular-nums">${runPB ? runPB.result_str : '-'}</td>
          </tr>
        `;
      }).join('');

      // Build Meeting History rows
      const historyRows = (profile.timeline || []).map(r => `
        <tr>
          <td><b>${r.date}</b><br><small style="color: var(--text-dim);">${r.title}</small></td>
          <td>${r.class}</td>
          <td><span class="badge ${r.position === 1 && r.final.includes('A') ? 'badge-winner' : 'badge-gray'}">${r.final} - P${r.position}</span></td>
          <td class="tabular-nums">${r.laps} / ${r.total_seconds ? r.total_seconds.toFixed(2) : '-'}</td>
          <td class="tabular-nums" style="color: var(--color-primary); font-weight: 700;">${r.best_lap ? `${r.best_lap}s` : '-'}</td>
          <td class="tabular-nums">${r.average_lap ? `${r.average_lap}s` : '-'}</td>
        </tr>
      `).join('');

      document.getElementById('modal-driver-content').innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
          <div>
            <h2 style="font-size: 1.8rem; font-weight: 900; color: #fff; line-height: 1.1;">${profile.name}</h2>
            <div style="margin-top: 0.4rem;">${badgesHtml || '<span style="color: var(--text-dim);">No special badges earned yet</span>'}</div>
          </div>
          <button class="nav-btn" style="background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.4);"
            onclick="App.compareToDriver('${profile.name}')">
            ⚔️ Head-to-Head Compare
          </button>
        </div>

        <!-- Career KPI Grid -->
        <div class="superlatives-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.8rem; margin-bottom: 1.5rem;">
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">A-Final Wins</div>
            <div class="stat-value" style="font-size: 1.6rem; color: var(--color-primary);">${s.a_final_wins}</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">Podiums</div>
            <div class="stat-value" style="font-size: 1.6rem; color: var(--color-accent-gold);">${s.a_final_podiums}</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">A-Finals Made</div>
            <div class="stat-value" style="font-size: 1.6rem; color: #38bdf8;">${s.a_final_appearances || 0}</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">A-Final Rate</div>
            <div class="stat-value" style="font-size: 1.6rem; color: ${s.a_final_rate >= 80 ? 'var(--color-primary)' : '#38bdf8'};">${s.a_final_rate || 0}%</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">Podium Rate</div>
            <div class="stat-value" style="font-size: 1.6rem; color: var(--color-accent-gold);">${s.a_final_podium_rate || 0}%</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">Avg A-Final Finish</div>
            <div class="stat-value" style="font-size: 1.6rem; color: #fff;" title="Exact average: P${s.a_final_avg_pos}">${s.a_final_avg_pos ? 'P' + Math.round(s.a_final_avg_pos) : '-'}</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">TQs (Poles)</div>
            <div class="stat-value" style="font-size: 1.6rem;">${s.tqs}</div>
          </div>
          <div class="stat-card" style="padding: 1rem;">
            <div class="stat-label">Meetings</div>
            <div class="stat-value" style="font-size: 1.6rem;">${s.meetings_count} <small style="font-size: 0.8rem; color: var(--text-dim);">(${s.attendance_pct}%)</small></div>
          </div>
        </div>

        <!-- Personal Bests Table -->
        <h4 style="font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 0.75rem;">🏆 Career Records by Class</h4>
        <div class="table-responsive" style="margin-bottom: 2rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Highest Finish</th>
                <th>Best Qualifying</th>
                <th>A-Finals Made</th>
                <th>Best 5-Min Distance</th>
              </tr>
            </thead>
            <tbody>
              ${pbRows}
            </tbody>
          </table>
        </div>

        <!-- Driver Charts -->
        <div class="charts-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 2rem;">
          <div class="chart-container" style="padding: 1rem;">
            <div class="chart-title" style="font-size: 0.9rem;">Finish Position Trend (Lower is Better)</div>
            <div class="chart-wrapper" style="height: 200px;">
              <canvas id="driver-chart-finish"></canvas>
            </div>
          </div>
          <div class="chart-container" style="padding: 1rem;">
            <div class="chart-title" style="font-size: 0.9rem;">Lap Time Progression (s)</div>
            <div class="chart-wrapper" style="height: 200px;">
              <canvas id="driver-chart-laps"></canvas>
            </div>
          </div>
        </div>

        <!-- Full Meeting History -->
        <h4 style="font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 0.75rem;">📅 Full Race History (${profile.timeline.length} entries)</h4>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Class</th>
                <th>Result</th>
                <th>Laps / Time</th>
                <th>Best Lap</th>
                <th>Average Lap</th>
              </tr>
            </thead>
            <tbody>
              ${historyRows}
            </tbody>
          </table>
        </div>
      `;

      // Render Charts
      if (window.AppCharts && typeof window.AppCharts.initDriverFinishChart === 'function') {
        setTimeout(() => {
          window.AppCharts.initDriverFinishChart('driver-chart-finish', profile.timeline);
          window.AppCharts.initDriverLapChart('driver-chart-laps', profile.timeline);
        }, 50);
      }
    } catch (e) {
      console.error(e);
      document.getElementById('modal-driver-content').innerHTML = `
        <div style="color: #f43f5e; text-align: center; padding: 2rem;">Error loading driver profile details.</div>
      `;
    }
  },

  compareToDriver(driverName) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    this.switchTab('h2h');
    window.location.hash = 'h2h';
    const selA = document.getElementById('h2h-driver-a');
    if (selA) {
      selA.value = driverName;
      if (window.AppH2H && typeof window.AppH2H.handleSelectionChange === 'function') {
        window.AppH2H.handleSelectionChange();
      }
    }
  },

  renderClasses() {
    const classTabsContainer = document.getElementById('class-tabs-bar');
    const classContentContainer = document.getElementById('class-content-area');
    if (!classTabsContainer || !classContentContainer) return;

    const classNames = Object.keys(this.data.classes);
    if (classNames.length === 0) return;

    if (!this.selectedClassTab || !classNames.includes(this.selectedClassTab)) {
      this.selectedClassTab = classNames[0];
    }

    // Render Class Tab buttons
    classTabsContainer.innerHTML = classNames.map(c => `
      <button class="nav-btn ${c === this.selectedClassTab ? 'active' : ''}" 
              data-class="${c}" 
              onclick="App.selectClassTab(this.dataset.class)">
        ${c}
      </button>
    `).join('');

    this.renderSelectedClassContent();
  },

  selectClassTab(className) {
    this.selectedClassTab = className;
    document.querySelectorAll('#class-tabs-bar .nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.class === className);
    });
    this.renderSelectedClassContent();
  },

  renderSelectedClassContent() {
    const container = document.getElementById('class-content-area');
    if (!container) return;

    const cdata = this.data.classes[this.selectedClassTab];
    if (!cdata) return;

    const wins = cdata.leaderboard_wins || [];
    const podiums = cdata.leaderboard_podiums || [];
    const tqs = cdata.leaderboard_tqs || [];
    const afinals = cdata.leaderboard_afinals || [];

    const topWinner = wins[0] ? `${wins[0].driver} (${wins[0].wins} wins)` : 'None';
    const topAfinalist = afinals[0] ? `${afinals[0].driver} (${afinals[0].a_finals} finals)` : 'None';
    const topTQ = tqs[0] ? `${tqs[0].driver} (${tqs[0].tqs} TQs)` : 'None';

    container.innerHTML = `
      <!-- Class Overview Summary Card -->
      <div class="superlatives-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div class="stat-card" style="padding: 1rem;">
          <div class="stat-label">Total Class Entries</div>
          <div class="stat-value" style="font-size: 1.8rem; color: #fff;">${cdata.entries_count || 0}</div>
        </div>
        <div class="stat-card" style="padding: 1rem;">
          <div class="stat-label">All-Time Win Leader</div>
          <div class="stat-value" style="font-size: 1.2rem; color: var(--color-primary); font-weight: 800; margin-top: 0.2rem;">${topWinner}</div>
        </div>
        <div class="stat-card" style="padding: 1rem;">
          <div class="stat-label">Most A-Finals Made</div>
          <div class="stat-value" style="font-size: 1.2rem; color: #38bdf8; font-weight: 800; margin-top: 0.2rem;">${topAfinalist}</div>
        </div>
        <div class="stat-card" style="padding: 1rem;">
          <div class="stat-label">Top Qualifier (Pole) Leader</div>
          <div class="stat-value" style="font-size: 1.2rem; color: var(--color-accent-gold); font-weight: 800; margin-top: 0.2rem;">${topTQ}</div>
        </div>
      </div>

      <!-- Hall of Fame 2x2 Grids -->
      <div class="charts-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 2rem;">
        <!-- Top Winners -->
        <div class="chart-container">
          <div class="chart-title">🥇 All-Time A-Final Wins</div>
          <div class="table-responsive" style="margin-top: 1rem; max-height: 340px; overflow-y: auto;">
            <table class="data-table">
              <thead><tr><th>Pos</th><th>Driver</th><th>Wins</th></tr></thead>
              <tbody>
                ${wins.length > 0 ? wins.slice(0, 10).map((w, i) => `
                  <tr onclick="App.openDriverModal('${slugify(w.driver)}')">
                    <td><b>#${i + 1}</b></td>
                    <td><b>${w.driver}</b></td>
                    <td class="tabular-nums"><span class="badge badge-winner">${w.wins} wins</span></td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No wins recorded</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Podiums -->
        <div class="chart-container">
          <div class="chart-title">🥈 All-Time Podiums (Top 3)</div>
          <div class="table-responsive" style="margin-top: 1rem; max-height: 340px; overflow-y: auto;">
            <table class="data-table">
              <thead><tr><th>Pos</th><th>Driver</th><th>Podiums</th></tr></thead>
              <tbody>
                ${podiums.length > 0 ? podiums.slice(0, 10).map((p, i) => `
                  <tr onclick="App.openDriverModal('${slugify(p.driver)}')">
                    <td><b>#${i + 1}</b></td>
                    <td><b>${p.driver}</b></td>
                    <td class="tabular-nums"><span class="badge badge-gold">${p.podiums}</span></td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No podiums recorded</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Most A-Final Appearances -->
        <div class="chart-container">
          <div class="chart-title">⭐ Most A-Final Appearances</div>
          <div class="table-responsive" style="margin-top: 1rem; max-height: 340px; overflow-y: auto;">
            <table class="data-table">
              <thead><tr><th>Pos</th><th>Driver</th><th>A-Finals</th></tr></thead>
              <tbody>
                ${afinals.length > 0 ? afinals.slice(0, 10).map((a, i) => `
                  <tr onclick="App.openDriverModal('${slugify(a.driver)}')">
                    <td><b>#${i + 1}</b></td>
                    <td><b>${a.driver}</b></td>
                    <td class="tabular-nums"><span class="badge badge-blue">${a.a_finals} finals</span></td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No A-Finals recorded</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Qualifiers -->
        <div class="chart-container">
          <div class="chart-title">🎯 Top Qualifiers (TQ / Pole Positions)</div>
          <div class="table-responsive" style="margin-top: 1rem; max-height: 340px; overflow-y: auto;">
            <table class="data-table">
              <thead><tr><th>Pos</th><th>Driver</th><th>TQs</th></tr></thead>
              <tbody>
                ${tqs.length > 0 ? tqs.slice(0, 10).map((t, i) => `
                  <tr onclick="App.openDriverModal('${slugify(t.driver)}')">
                    <td><b>#${i + 1}</b></td>
                    <td><b>${t.driver}</b></td>
                    <td class="tabular-nums"><span class="badge badge-winner">${t.tqs} TQs</span></td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No TQs recorded</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  renderMeetings() {
    this.filterMeetings();
  },

  filterMeetings() {
    const season = document.getElementById('meeting-season-filter')?.value || '';
    let list = [...this.data.meetings];

    if (season) {
      list = list.filter(m => m.season === season);
    }

    const grid = document.getElementById('meetings-cards-grid');
    if (!grid) return;

    grid.innerHTML = list.map(m => {
      const winnersList = Object.entries(m.winners || {}).map(([cls, w]) => `
        <div style="font-size: 0.82rem; margin-top: 0.25rem;">
          <span style="color: var(--text-dim);">${cls}:</span> 
          <b style="color: #fff;">${w.driver}</b> 
          <small class="tabular-nums" style="color: var(--color-primary);">(${w.result})</small>
        </div>
      `).join('');

      return `
        <div class="stat-card" style="cursor: pointer;" onclick="App.openMeetingModal(${m.id})">
          <div class="stat-header">
            <span class="badge badge-blue">Season ${m.season}</span>
            <span style="font-size: 0.82rem; color: var(--text-dim);">${m.date}</span>
          </div>
          <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin: 0.4rem 0;">${m.title}</h3>
          
          <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.8rem;">
            <div>👥 <b>${m.drivers_count}</b> Racers</div>
            <div>🔄 <b>${m.total_laps}</b> Laps</div>
            ${m.fastest_lap ? `<div>⚡ <b>${m.fastest_lap.time}s</b> (${m.fastest_lap.driver})</div>` : ''}
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 0.6rem;">
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--text-dim); letter-spacing: 0.5px;">Class Winners</div>
            ${winnersList || '<div style="color: var(--text-dim); font-size: 0.8rem;">Results recorded</div>'}
          </div>
        </div>
      `;
    }).join('');
  },

  openMeetingModal(meetingId) {
    const meeting = this.data.meetings.find(m => m.id === meetingId);
    if (!meeting) return;

    const modal = document.getElementById('meeting-modal');
    if (!modal) return;
    modal.classList.add('open');

    const winnersList = Object.entries(meeting.winners || {}).map(([cls, w]) => `
      <div class="record-card" style="padding: 0.9rem;">
        <div>
          <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">${cls} Winner</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${w.driver}</div>
        </div>
        <div class="tabular-nums" style="color: var(--color-primary); font-weight: 700;">${w.result}</div>
      </div>
    `).join('');

    document.getElementById('modal-meeting-content').innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <span class="badge badge-blue">Season ${meeting.season}</span>
        <h2 style="font-size: 1.6rem; font-weight: 900; color: #fff; margin: 0.3rem 0;">${meeting.title}</h2>
        <div style="color: var(--text-muted); font-size: 0.9rem;">Held on <b>${meeting.date}</b> &bull; ${meeting.drivers_count} Racers &bull; ${meeting.total_laps} Total Laps</div>
      </div>

      ${meeting.fastest_lap ? `
        <div style="margin-bottom: 1.5rem; padding: 0.85rem 1.2rem; background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.25); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 0.72rem; color: var(--color-primary); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">⚡ Meeting Fastest Lap</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${meeting.fastest_lap.driver} <span style="font-size: 0.85rem; color: var(--text-dim); font-weight: 500;">(${meeting.fastest_lap.class})</span></div>
          </div>
          <div class="tabular-nums" style="font-size: 1.8rem; font-weight: 900; color: var(--color-primary);">${meeting.fastest_lap.time}s</div>
        </div>
      ` : ''}

      <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 0.6rem;">🏆 Class Winners</h4>
      <div class="records-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; margin-bottom: 1.5rem;">
        ${winnersList}
      </div>

      <div style="text-align: center; margin-top: 1.5rem;">
        <a href="https://www.rc-results.com/Viewer/Main/MeetingSummary?meetingId=${meeting.id}" target="_blank" rel="noopener"
          class="nav-btn" style="display: inline-flex; background: var(--color-primary); color: #fff; padding: 0.6rem 1.2rem;">
          View Full Heat & Lap Sheets on RC-Results ↗
        </a>
      </div>
    `;
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
