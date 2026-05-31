window.ChartModule = (function () {
  let chartInstance = null;
  let currentType = 'bar';
  let currentMetric = 'level';

  function aggregate(logs, metric) {
    const map = new Map();
    logs.forEach(log => {
      let key;
      if (metric === 'level') key = log.level;
      else if (metric === 'module') key = log.module;
      else if (metric === 'hour') {
        const d = new Date(log.timestamp);
        key = d.getHours().toString().padStart(2, '0') + ':00';
      } else key = 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });

    let labels;
    if (metric === 'level') {
      labels = AppConstants.ALL_LEVELS.filter(l => map.has(l));
    } else {
      labels = Array.from(map.keys()).sort();
    }
    const data = labels.map(k => map.get(k));
    return { labels, data };
  }

  function getColors(labels, metric) {
    if (metric === 'level') {
      return labels.map(l => AppConstants.LEVEL_COLORS[l] || '#888');
    }
    const palette = ['#6366f1', '#22d3ee', '#f472b6', '#facc15', '#34d399',
                     '#fb7185', '#60a5fa', '#a78bfa', '#f59e0b', '#10b981'];
    return labels.map((_, i) => palette[i % palette.length]);
  }

  function render(canvas, logs, type, metric) {
    currentType = type || currentType;
    currentMetric = metric || currentMetric;
    const { labels, data } = aggregate(logs, currentMetric);
    const colors = getColors(labels, currentMetric);

    if (chartInstance) chartInstance.destroy();

    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, {
      type: currentType,
      data: {
        labels,
        datasets: [{
          label: currentMetric === 'level' ? '日志数量' :
                 currentMetric === 'module' ? '模块日志数' : '小时日志数',
          data,
          backgroundColor: currentType === 'line'
            ? 'rgba(99, 102, 241, 0.2)'
            : colors,
          borderColor: currentType === 'line' ? '#6366f1' : colors,
          borderWidth: 2,
          fill: currentType === 'line',
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: currentType === 'doughnut',
            labels: { color: getComputedStyle(document.body).color }
          },
          tooltip: { enabled: true }
        },
        scales: currentType === 'doughnut' ? {} : {
          x: { ticks: { color: '#8a8aa0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#8a8aa0' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
        }
      }
    });
  }

  function update(logs) {
    if (!chartInstance) return;
    const canvas = chartInstance.canvas;
    render(canvas, logs, currentType, currentMetric);
  }

  return { render, update };
})();
