package report

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"strings"
	"time"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/cluster"
	"db-inspector/pkg/stats"
	"db-inspector/pkg/suggest"
)

type ReportData struct {
	GeneratedAt   time.Time
	ReportID      string
	Title         string
	GlobalStats   stats.GlobalStats
	Reports       []suggest.Report
	AllAnalysis   []analysis.AnalysisResult
	HealthSummary HealthSummary
	SlowLogTopN   []SlowQueryEntry
}

type HealthSummary struct {
	TotalClusters   int
	TotalNodes      int
	HealthyNodes    int
	UnhealthyNodes  int
	TotalSlowQuery  int
	ClustersHealth  []ClusterHealth
}

type ClusterHealth struct {
	ClusterName  string
	HealthyCount int
	TotalCount   int
	Status       string
	Color        string
}

type SlowQueryEntry struct {
	ClusterName string
	NodeName    string
	SQLText     string
	QueryTime   string
	RowsExamined int64
	Score       int
}

type Generator struct {
	template *template.Template
}

func NewGenerator() (*Generator, error) {
	g := &Generator{}
	if err := g.loadTemplate(); err != nil {
		return nil, err
	}
	return g, nil
}

func (g *Generator) loadTemplate() error {
	tmpl := template.New("report").Funcs(template.FuncMap{
		"formatTime": func(t time.Time) string {
			return t.Format("2006-01-02 15:04:05")
		},
		"formatDuration": func(d time.Duration) string {
			return stats.FormatDuration(d)
		},
		"formatBytes": func(b int) string {
			const unit = 1024
			if b < unit {
				return fmt.Sprintf("%d B", b)
			}
			div, exp := int64(unit), 0
			for n := b / unit; n >= unit; n /= unit {
				div *= unit
				exp++
			}
			return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
		},
		"scoreColor": func(score int) string {
			switch {
			case score >= 80:
				return "#22c55e"
			case score >= 60:
				return "#eab308"
			case score >= 40:
				return "#f97316"
			default:
				return "#ef4444"
			}
		},
		"severityColor": func(s string) string {
			switch s {
			case "IMMEDIATE", "CRITICAL":
				return "#dc2626"
			case "HIGH":
				return "#ea580c"
			case "MEDIUM":
				return "#ca8a04"
			case "LOW":
				return "#0891b2"
			default:
				return "#6b7280"
			}
		},
		"severityBadge": func(s string) string {
			colors := map[string]string{
				"IMMEDIATE": "bg-red-500",
				"CRITICAL":  "bg-red-600",
				"HIGH":      "bg-orange-500",
				"MEDIUM":    "bg-yellow-500",
				"LOW":       "bg-cyan-500",
				"INFO":      "bg-gray-500",
			}
			if c, ok := colors[s]; ok {
				return c
			}
			return "bg-gray-400"
		},
		"truncateSQL": func(s string, n int) string {
			if len(s) <= n {
				return s
			}
			return s[:n] + "..."
		},
		"toJSON": func(v interface{}) string {
			data, _ := json.MarshalIndent(v, "", "  ")
			return string(data)
		},
		"inc": func(i int) int {
			return i + 1
		},
		"div": func(a, b int) int {
			if b == 0 {
				return 0
			}
			return int(float64(a) / float64(b) * 100)
		},
		"percent": func(part, total int) int {
			if total == 0 {
				return 0
			}
			return int(float64(part) / float64(total) * 100)
		},
		"dashOffset": func(score int) int {
			return int(float64(283) * (1 - float64(score)/100))
		},
		"splitLines": func(s string) []string {
			lines := strings.Split(s, "\n")
			var result []string
			for _, l := range lines {
				if strings.TrimSpace(l) != "" {
					result = append(result, l)
				}
			}
			return result
		},
	})

	tmpl, err := tmpl.Parse(htmlTemplate)
	if err != nil {
		return fmt.Errorf("parse template: %w", err)
	}
	g.template = tmpl
	return nil
}

func (g *Generator) GenerateHTML(data ReportData, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}

	f, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	if err := g.template.Execute(f, data); err != nil {
		return fmt.Errorf("execute template: %w", err)
	}
	return nil
}

func BuildReportData(
	globalStats stats.GlobalStats,
	reports []suggest.Report,
	analysisResults []analysis.AnalysisResult,
	connectionStatuses map[string][]cluster.HealthStatus,
) ReportData {
	now := time.Now()
	reportID := fmt.Sprintf("inspect-%s", now.Format("20060102-150405"))

	health := HealthSummary{
		TotalClusters:  globalStats.TotalClusters,
		TotalNodes:     globalStats.TotalNodes,
		TotalSlowQuery: globalStats.TotalQueries,
	}

	for clusterName, statuses := range connectionStatuses {
		ch := ClusterHealth{ClusterName: clusterName, TotalCount: len(statuses)}
		for _, s := range statuses {
			if s.Healthy {
				ch.HealthyCount++
				health.HealthyNodes++
			} else {
				health.UnhealthyNodes++
			}
		}
		switch {
		case ch.HealthyCount == ch.TotalCount:
			ch.Status = "健康"
			ch.Color = "bg-green-500"
		case ch.HealthyCount == 0:
			ch.Status = "异常"
			ch.Color = "bg-red-500"
		default:
			ch.Status = "部分异常"
			ch.Color = "bg-yellow-500"
		}
		health.ClustersHealth = append(health.ClustersHealth, ch)
	}

	var topN []SlowQueryEntry
	for _, q := range globalStats.TopSlowQueries {
		score := 0
		for _, ar := range analysisResults {
			if ar.Record.ClusterName == q.ClusterName &&
				ar.Record.NodeName == q.NodeName &&
				ar.Record.QueryTime == q.QueryTime {
				score = ar.Score
				break
			}
		}
		topN = append(topN, SlowQueryEntry{
			ClusterName:  q.ClusterName,
			NodeName:     q.NodeName,
			SQLText:      q.SQLText,
			QueryTime:    stats.FormatDuration(q.QueryTime),
			RowsExamined: q.RowsExamined,
			Score:        score,
		})
	}

	return ReportData{
		GeneratedAt:   now,
		ReportID:      reportID,
		Title:         "数据库集群慢查询巡检报告",
		GlobalStats:   globalStats,
		Reports:       reports,
		AllAnalysis:   analysisResults,
		HealthSummary: health,
		SlowLogTopN:   topN,
	}
}

const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{.Title}}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  .sql-code { font-family: 'Consolas', 'Monaco', monospace; white-space: pre-wrap; word-break: break-all; }
  .score-ring { stroke-dasharray: 283; stroke-dashoffset: 283; transition: stroke-dashoffset 0.5s; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  .accordion-content { max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; }
  .accordion-content.open { max-height: 5000px; }
</style>
</head>
<body class="bg-gray-50 text-gray-800">

<div class="max-w-7xl mx-auto px-4 py-8">

  <header class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl shadow-xl p-8 mb-8">
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-3xl font-bold mb-2">{{.Title}}</h1>
        <p class="text-blue-100">报告编号: {{.ReportID}} | 生成时间: {{formatTime .GeneratedAt}}</p>
      </div>
      <div class="text-right">
        <div class="text-sm text-blue-200">巡检工具: db-inspector</div>
      </div>
    </div>
  </header>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    <div class="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
      <div class="text-gray-500 text-sm">集群总数</div>
      <div class="text-3xl font-bold text-gray-800 mt-1">{{.HealthSummary.TotalClusters}}</div>
    </div>
    <div class="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
      <div class="text-gray-500 text-sm">节点健康/总数</div>
      <div class="text-3xl font-bold text-gray-800 mt-1">
        <span class="text-green-600">{{.HealthSummary.HealthyNodes}}</span>
        <span class="text-xl text-gray-400">/</span>
        <span>{{.HealthSummary.TotalNodes}}</span>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
      <div class="text-gray-500 text-sm">慢查询总数</div>
      <div class="text-3xl font-bold text-gray-800 mt-1">{{.HealthSummary.TotalSlowQuery}}</div>
    </div>
    <div class="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
      <div class="text-gray-500 text-sm">全局平均耗时</div>
      <div class="text-3xl font-bold text-gray-800 mt-1">{{.GlobalStats.OverallAvgTimeMs}}ms</div>
    </div>
  </div>

  <div class="bg-white rounded-xl shadow-md p-6 mb-8">
    <h2 class="text-xl font-semibold mb-4 flex items-center">
      <span class="w-1 h-6 bg-blue-500 rounded mr-3"></span>
      集群健康状态
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {{range .HealthSummary.ClustersHealth}}
      <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-center mb-2">
          <span class="font-medium">{{.ClusterName}}</span>
          <span class="px-3 py-1 text-xs font-semibold text-white rounded-full {{.Color}}">{{.Status}}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div class="h-2 rounded-full {{.Color}}" style="width: {{div .HealthyCount .TotalCount}}%"></div>
        </div>
        <div class="text-sm text-gray-500 mt-1">{{.HealthyCount}}/{{.TotalCount}} 节点正常</div>
      </div>
      {{end}}
    </div>
  </div>

  <div class="bg-white rounded-xl shadow-md p-6 mb-8">
    <h2 class="text-xl font-semibold mb-4 flex items-center">
      <span class="w-1 h-6 bg-red-500 rounded mr-3"></span>
      Top 20 慢查询
    </h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 border-b">
            <th class="px-4 py-3 text-left">排名</th>
            <th class="px-4 py-3 text-left">集群</th>
            <th class="px-4 py-3 text-left">节点</th>
            <th class="px-4 py-3 text-left">耗时</th>
            <th class="px-4 py-3 text-left">扫描行</th>
            <th class="px-4 py-3 text-left">评分</th>
            <th class="px-4 py-3 text-left">SQL 摘要</th>
          </tr>
        </thead>
        <tbody>
          {{range $i, $q := .SlowLogTopN}}
          <tr class="border-b hover:bg-gray-50">
            <td class="px-4 py-3 font-mono">{{inc $i}}</td>
            <td class="px-4 py-3 font-medium">{{$q.ClusterName}}</td>
            <td class="px-4 py-3">{{$q.NodeName}}</td>
            <td class="px-4 py-3 font-mono text-red-600 font-semibold">{{$q.QueryTime}}</td>
            <td class="px-4 py-3 font-mono">{{$q.RowsExamined}}</td>
            <td class="px-4 py-3">
              <span class="px-2 py-1 rounded text-white text-xs" style="background: {{scoreColor $q.Score}}">{{$q.Score}}</span>
            </td>
            <td class="px-4 py-3 max-w-md truncate sql-code">{{truncateSQL $q.SQLText 80}}</td>
          </tr>
          {{end}}
        </tbody>
      </table>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <div class="bg-white rounded-xl shadow-md p-6">
      <h2 class="text-xl font-semibold mb-4 flex items-center">
        <span class="w-1 h-6 bg-orange-500 rounded mr-3"></span>
        全局性能统计
      </h2>
      <div class="space-y-3">
        <div class="flex justify-between">
          <span class="text-gray-600">集群数</span>
          <span class="font-semibold">{{.GlobalStats.TotalClusters}}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">节点数</span>
          <span class="font-semibold">{{.GlobalStats.TotalNodes}}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">慢查询总数</span>
          <span class="font-semibold">{{.GlobalStats.TotalQueries}}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">全局平均耗时</span>
          <span class="font-semibold">{{.GlobalStats.OverallAvgTimeMs}}ms</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">全局最大耗时</span>
          <span class="font-semibold text-red-600">{{.GlobalStats.OverallMaxTimeMs}}ms</span>
        </div>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow-md p-6">
      <h2 class="text-xl font-semibold mb-4 flex items-center">
        <span class="w-1 h-6 bg-cyan-500 rounded mr-3"></span>
        耗时分布
      </h2>
      <canvas id="timeChart" height="180"></canvas>
    </div>
  </div>

  <div class="bg-white rounded-xl shadow-md p-6 mb-8">
    <h2 class="text-xl font-semibold mb-4 flex items-center">
      <span class="w-1 h-6 bg-green-500 rounded mr-3"></span>
      集群级性能统计
    </h2>
    {{range .GlobalStats.ClusterStats}}
    <div class="mb-6 last:mb-0">
      <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-3">
        <h3 class="text-lg font-semibold text-gray-800">集群: {{.ClusterName}}</h3>
        <span class="text-sm text-gray-500">{{.TotalQueries}} 条慢查询</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="text-center p-3 bg-blue-50 rounded-lg">
          <div class="text-2xl font-bold text-blue-600">{{.AvgQueryTimeMs}}ms</div>
          <div class="text-xs text-gray-500">平均耗时</div>
        </div>
        <div class="text-center p-3 bg-yellow-50 rounded-lg">
          <div class="text-2xl font-bold text-yellow-600">{{.P50QueryTimeMs}}ms</div>
          <div class="text-xs text-gray-500">P50</div>
        </div>
        <div class="text-center p-3 bg-orange-50 rounded-lg">
          <div class="text-2xl font-bold text-orange-600">{{.P95QueryTimeMs}}ms</div>
          <div class="text-xs text-gray-500">P95</div>
        </div>
        <div class="text-center p-3 bg-red-50 rounded-lg">
          <div class="text-2xl font-bold text-red-600">{{.P99QueryTimeMs}}ms</div>
          <div class="text-xs text-gray-500">P99</div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-gray-50 rounded-lg">
          <h4 class="font-semibold mb-2 text-gray-700">耗时分布</h4>
          {{range .TimeDistribution}}
          <div class="flex items-center text-sm mb-1">
            <span class="w-24 font-mono text-gray-600">{{.Range}}</span>
            <div class="flex-1 mx-2 h-4 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500 rounded-full" style="width: {{percent .Count $.HealthSummary.TotalSlowQuery}}%"></div>
            </div>
            <span class="w-16 text-right font-mono">{{.Count}}</span>
          </div>
          {{end}}
        </div>
        <div class="p-4 bg-gray-50 rounded-lg">
          <h4 class="font-semibold mb-2 text-gray-700">评分分布</h4>
          {{range $k, $v := .ScoreDistribution}}
          <div class="flex items-center text-sm mb-1">
            <span class="w-32 text-gray-600">{{$k}}</span>
            <div class="flex-1 mx-2 h-4 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full rounded-full" style="width: {{percent $v $.HealthSummary.TotalSlowQuery}}%; background: {{if eq $k "good(80-100)"}}#22c55e{{else if eq $k "warning(50-79)"}}#eab308{{else}}#ef4444{{end}}"></div>
            </div>
            <span class="w-16 text-right font-mono">{{$v}}</span>
          </div>
          {{end}}
        </div>
      </div>
    </div>
    {{end}}
  </div>

  <div class="bg-white rounded-xl shadow-md p-6">
    <h2 class="text-xl font-semibold mb-4 flex items-center">
      <span class="w-1 h-6 bg-purple-500 rounded mr-3"></span>
      优化建议报告
    </h2>
    {{range .Reports}}
    <div class="mb-6 border border-gray-200 rounded-xl overflow-hidden">
      <div class="p-4 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">集群: {{.ClusterName}}</h3>
          <div class="text-sm text-gray-500">{{len .Suggestions}} 条优化建议</div>
        </div>
        <div class="flex items-center">
          <svg class="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" stroke-width="8"/>
            <circle cx="50" cy="50" r="45" fill="none" stroke="{{scoreColor .Score}}" stroke-width="8"
                    class="score-ring" style="stroke-dashoffset: {{dashOffset .Score}}"/>
          </svg>
          <div class="ml-2 text-2xl font-bold" style="color: {{scoreColor .Score}}">{{.Score}}</div>
        </div>
      </div>
      <div class="p-4 bg-gray-50 border-t border-b text-sm">
        {{range $line := splitLines .Summary}}
        <div>{{$line}}</div>
        {{end}}
      </div>
      <div class="p-4 space-y-3">
        {{range $si, $s := .Suggestions}}
        <div class="accordion-item border rounded-lg">
          <button class="accordion-btn w-full p-3 flex justify-between items-center text-left hover:bg-gray-50" onclick="toggleAccordion(this)">
            <div class="flex items-center">
              <span class="px-2 py-1 text-xs font-semibold text-white rounded {{severityBadge $s.Priority}} mr-3">{{$s.Priority}}</span>
              <span class="font-medium">{{inc $si}}. {{$s.Title}}</span>
            </div>
            <svg class="w-5 h-5 text-gray-400 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div class="accordion-content px-3">
            <div class="pb-4 space-y-2 text-sm text-gray-600">
              <div><span class="font-medium text-gray-700">规则:</span> {{$s.Rule}}</div>
              <div><span class="font-medium text-gray-700">说明:</span> {{$s.Content}}</div>
              {{if $s.SQLHint}}
              <div class="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg font-mono text-xs">
                <span class="text-gray-400">-- 建议:</span><br>{{$s.SQLHint}}
              </div>
              {{end}}
            </div>
          </div>
        </div>
        {{end}}
      </div>
    </div>
    {{end}}
  </div>

  <footer class="text-center text-gray-400 text-sm mt-8 py-4 border-t">
    本报告由 db-inspector 自动生成 | {{formatTime .GeneratedAt}} | 报告ID: {{.ReportID}}
  </footer>

</div>

<script>
function toggleAccordion(btn) {
  const content = btn.nextElementSibling;
  const icon = btn.querySelector('svg');
  content.classList.toggle('open');
  icon.classList.toggle('rotate-180');
}

function splitLines(str) {
  return str.split('\\n').filter(l => l.trim());
}
function div(a, b) {
  if (b === 0) return 0;
  return Math.round((a / b) * 100);
}
function percent(part, total) {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}
function dashOffset(score) {
  return Math.round(283 * (1 - score / 100));
}

document.addEventListener('DOMContentLoaded', function() {
  const distributions = [
    {{range .GlobalStats.ClusterStats}}
      { label: '{{.ClusterName}}', data: [
        {{range .TimeDistribution}}{{.Count}},{{end}}
      ]},
    {{end}}
  ];
  if (distributions.length > 0) {
    const ctx = document.getElementById('timeChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['0-100ms', '100-500ms', '500ms-1s', '1s-5s', '5s-10s', '10s-30s', '30s+'],
        datasets: distributions.map((d, i) => ({
          label: d.label,
          data: d.data,
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(139, 92, 246, 0.7)',
          ][i % 5]
        }))
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
  document.querySelectorAll('.score-ring').forEach(el => {
    const offset = el.style.strokeDashoffset;
    setTimeout(() => { el.style.strokeDashoffset = offset; }, 100);
  });
});
</script>
</body>
</html>
`
