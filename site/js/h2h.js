/**
 * Head-to-Head Rivalry Comparison Engine
 */

window.AppH2H = {
  h2hData: [],
  driversList: [],
  driverProfiles: {},

  init(h2hData, driversList) {
    this.h2hData = h2hData || [];
    this.driversList = driversList || [];
    this.populateSelectors();
    this.bindEvents();
  },

  populateSelectors() {
    const selA = document.getElementById('h2h-driver-a');
    const selB = document.getElementById('h2h-driver-b');
    if (!selA || !selB) return;

    selA.innerHTML = '<option value="">-- Select Driver A --</option>';
    selB.innerHTML = '<option value="">-- Select Driver B --</option>';

    // Sort drivers alphabetically
    const sorted = [...this.driversList].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(d => {
      selA.innerHTML += `<option value="${d.name}">${d.name} (${d.a_final_wins} wins)</option>`;
      selB.innerHTML += `<option value="${d.name}">${d.name} (${d.a_final_wins} wins)</option>`;
    });

    // Default select top rivalry if available
    if (this.h2hData.length > 0) {
      selA.value = this.h2hData[0].driver_a;
      selB.value = this.h2hData[0].driver_b;
      this.compare(this.h2hData[0].driver_a, this.h2hData[0].driver_b);
    }
  },

  bindEvents() {
    const selA = document.getElementById('h2h-driver-a');
    const selB = document.getElementById('h2h-driver-b');
    const btn = document.getElementById('h2h-compare-btn');

    if (selA && selB) {
      selA.addEventListener('change', () => this.handleSelectionChange());
      selB.addEventListener('change', () => this.handleSelectionChange());
    }
    if (btn) {
      btn.addEventListener('click', () => this.handleSelectionChange());
    }
  },

  handleSelectionChange() {
    const selA = document.getElementById('h2h-driver-a');
    const selB = document.getElementById('h2h-driver-b');
    if (!selA || !selB) return;

    const d1 = selA.value;
    const d2 = selB.value;
    if (d1 && d2 && d1 !== d2) {
      this.compare(d1, d2);
    } else {
      const res = document.getElementById('h2h-results-container');
      if (res) res.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem;">Please select two different drivers to view head-to-head stats.</div>`;
    }
  },

  async loadDriverProfile(name) {
    if (this.driverProfiles[name]) return this.driverProfiles[name];
    const driverObj = this.driversList.find(d => d.name === name);
    if (!driverObj) return null;

    try {
      const resp = await fetch(`data/drivers/${driverObj.slug}.json`);
      if (resp.ok) {
        const data = await resp.json();
        this.driverProfiles[name] = data;
        return data;
      }
    } catch (e) {
      console.error("Error loading driver for H2H:", e);
    }
    return null;
  },

  async compare(nameA, nameB) {
    const container = document.getElementById('h2h-results-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading head-to-head comparison...</div>`;

    const profileA = await this.loadDriverProfile(nameA);
    const profileB = await this.loadDriverProfile(nameB);

    // Find direct matches in h2hData
    let matchRecord = this.h2hData.find(m => 
      (m.driver_a === nameA && m.driver_b === nameB) || 
      (m.driver_a === nameB && m.driver_b === nameA)
    );

    let winsA = 0;
    let winsB = 0;
    let totalRaces = 0;

    if (matchRecord) {
      totalRaces = matchRecord.total_races;
      if (matchRecord.driver_a === nameA) {
        winsA = matchRecord.wins_a;
        winsB = matchRecord.wins_b;
      } else {
        winsA = matchRecord.wins_b;
        winsB = matchRecord.wins_a;
      }
    }

    // Direct mutual races from timeline
    const mutualRaces = [];
    if (profileA && profileB) {
      profileA.timeline.forEach(rA => {
        const matchingB = profileB.timeline.find(rB => 
          rB.meeting_id === rA.meeting_id && 
          rB.class === rA.class && 
          rB.final === rA.final
        );
        if (matchingB) {
          mutualRaces.push({
            date: rA.date,
            title: rA.title,
            class: rA.class,
            final: rA.final,
            posA: rA.position,
            posB: matchingB.position,
            bestLapA: rA.best_lap,
            bestLapB: matchingB.best_lap,
            winner: rA.position < matchingB.position ? nameA : (matchingB.position < rA.position ? nameB : "Tie")
          });
        }
      });
    }

    // Calculate percentage width for visual bar
    const sumWins = winsA + winsB;
    const pctA = sumWins > 0 ? Math.round((winsA / sumWins) * 100) : 50;
    const pctB = sumWins > 0 ? (100 - pctA) : 50;

    const bestLapA = profileA && profileA.summary ? profileA.summary.best_lap : '-';
    const bestLapB = profileB && profileB.summary ? profileB.summary.best_lap : '-';

    let mutualTableHtml = '';
    if (mutualRaces.length > 0) {
      mutualTableHtml = `
        <div style="margin-top: 2rem;">
          <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 0.8rem; color: #fff;">Direct Race Matchups (${mutualRaces.length} races)</h4>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Class / Final</th>
                  <th style="color: var(--color-primary);">${nameA}</th>
                  <th style="color: var(--color-accent-blue);">${nameB}</th>
                  <th>Ahead</th>
                </tr>
              </thead>
              <tbody>
                ${mutualRaces.map(r => `
                  <tr>
                    <td><b>${r.date}</b><br><small style="color: var(--text-dim);">${r.title}</small></td>
                    <td>${r.class} <span class="badge badge-gray">${r.final}</span></td>
                    <td class="tabular-nums"><b>P${r.posA}</b> ${r.bestLapA ? `(${r.bestLapA}s)` : ''}</td>
                    <td class="tabular-nums"><b>P${r.posB}</b> ${r.bestLapB ? `(${r.bestLapB}s)` : ''}</td>
                    <td>
                      <span class="badge ${r.winner === nameA ? 'badge-winner' : (r.winner === nameB ? 'badge-blue' : 'badge-gray')}">
                        ${r.winner}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      mutualTableHtml = `<p style="color: var(--text-dim); margin-top: 1.5rem;">No mutual races found where both drivers competed in the same class and final.</p>`;
    }

    container.innerHTML = `
      <div class="h2h-scoreboard">
        <div class="h2h-score-col">
          <div class="h2h-driver-name" style="color: var(--color-primary);">${nameA}</div>
          <div class="h2h-score-num ${winsA >= winsB ? 'win' : 'loss'}">${winsA}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted);">Head-to-Head Wins</div>
          <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
            A-Finals: <b class="tabular-nums" style="color: #38bdf8;">${profileA && profileA.summary ? profileA.summary.a_final_appearances : 0} (${profileA && profileA.summary ? profileA.summary.a_final_rate : 0}%)</b>
          </div>
        </div>

        <div style="text-align: center; padding: 0 1.5rem;">
          <div class="vs-badge">VS</div>
          <div style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-dim); font-weight: 700; margin-top: 0.5rem;">
            ${totalRaces} Total Battles
          </div>
        </div>

        <div class="h2h-score-col">
          <div class="h2h-driver-name" style="color: var(--color-accent-blue);">${nameB}</div>
          <div class="h2h-score-num ${winsB >= winsA ? 'win' : 'loss'}">${winsB}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted);">Head-to-Head Wins</div>
          <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
            A-Finals: <b class="tabular-nums" style="color: #38bdf8;">${profileB && profileB.summary ? profileB.summary.a_final_appearances : 0} (${profileB && profileB.summary ? profileB.summary.a_final_rate : 0}%)</b>
          </div>
        </div>
      </div>

      <!-- Ratio Bar -->
      <div style="background: rgba(0,0,0,0.5); height: 12px; border-radius: 6px; overflow: hidden; display: flex; margin-bottom: 1.5rem;">
        <div style="background: var(--color-primary); width: ${pctA}%; height: 100%;"></div>
        <div style="background: var(--color-accent-blue); width: ${pctB}%; height: 100%;"></div>
      </div>

      ${mutualTableHtml}
    `;
  }
};
