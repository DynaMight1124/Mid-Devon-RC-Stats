/**
 * Motorsport Dashboard Charts Engine (Chart.js Integration)
 */

window.AppCharts = {
  attendanceChart: null,
  classBreakdownChart: null,
  driverFinishChart: null,
  driverLapChart: null,

  initAttendanceChart(canvasId, trendData) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (this.attendanceChart) this.attendanceChart.destroy();

    const labels = trendData.map(d => d.date);
    const drivers = trendData.map(d => d.drivers);
    const laps = trendData.map(d => d.laps);

    this.attendanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Driver Entries',
            data: drivers,
            borderColor: '#e11d48',
            backgroundColor: 'rgba(225, 29, 72, 0.15)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#e11d48',
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return `${trendData[idx].title} (${trendData[idx].date})`;
              },
              label: (item) => {
                const idx = item.dataIndex;
                return `Racers: ${item.formattedValue} | Total Laps: ${laps[idx]}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748b', font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { size: 11 }, stepSize: 10 },
            suggestedMin: 0
          }
        }
      }
    });
  },

  initClassBreakdownChart(canvasId, classData) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (this.classBreakdownChart) this.classBreakdownChart.destroy();

    const labels = Object.keys(classData);
    const counts = labels.map(c => classData[c].entries_count || 0);

    const colors = ['#e11d48', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

    this.classBreakdownChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: counts,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#0f172a'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', boxWidth: 12, padding: 12, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: {
              label: (item) => ` ${item.label}: ${item.formattedValue} total entries`
            }
          }
        },
        cutout: '68%'
      }
    });
  },

  initDriverFinishChart(canvasId, timeline) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (this.driverFinishChart) this.driverFinishChart.destroy();

    // Timeline is newest first, reverse for chronological chart
    const chronological = [...timeline].reverse();
    const labels = chronological.map(t => t.date);
    const positions = chronological.map(t => t.position);

    this.driverFinishChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Final Finish Position',
          data: positions,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: '#0ea5e9',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: {
              title: (items) => {
                const item = chronological[items[0].dataIndex];
                return `${item.title} (${item.date})`;
              },
              label: (item) => {
                const race = chronological[item.dataIndex];
                return `${race.class} - ${race.final}: Position ${race.position} (${race.laps} laps)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          },
          y: {
            reverse: true, // 1st place at the top!
            min: 1,
            suggestedMax: 10,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', stepSize: 1, font: { size: 10 } }
          }
        }
      }
    });
  },

  initDriverLapChart(canvasId, timeline) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (this.driverLapChart) this.driverLapChart.destroy();

    const chronological = [...timeline].reverse().filter(t => t.best_lap && t.best_lap > 5);
    const labels = chronological.map(t => t.date);
    const bestLaps = chronological.map(t => t.best_lap);
    const aveLaps = chronological.map(t => t.average_lap);

    this.driverLapChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Best Lap (s)',
            data: bestLaps,
            borderColor: '#e11d48',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 4,
            pointBackgroundColor: '#e11d48'
          },
          {
            label: 'Average Lap (s)',
            data: aveLaps,
            borderColor: '#64748b',
            borderDash: [4, 4],
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: 3,
            pointBackgroundColor: '#64748b'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#94a3b8', boxWidth: 10, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: {
              title: (items) => {
                const item = chronological[items[0].dataIndex];
                return `${item.title} (${item.class})`;
              },
              label: (item) => `${item.dataset.label}: ${item.formattedValue}s`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          }
        }
      }
    });
  }
};
