import type { Review, Annotation, User } from '../types/index.js'

interface ReviewExportData {
  projectId: number
  projectName: string
  reviews: Array<{
    review: Review
    annotation: Annotation
    reviewer: { name: string; email: string }
    annotator: { name: string; email: string }
  }>
  exportDate: string
  statistics: {
    total: number
    approved: number
    rejected: number
    pending: number
  }
}

function escapeCSV(value: string): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const exportService = {
  toCSV(data: ReviewExportData): string {
    const headers = [
      '审核ID',
      '标注ID',
      '标注内容',
      '标注位置',
      '标注者',
      '审核状态',
      '审核意见',
      '审核人',
      '审核时间',
    ]

    const rows = data.reviews.map((item) => [
      item.review.id,
      item.annotation.id,
      item.annotation.content,
      `(${item.annotation.x}, ${item.annotation.y}, ${item.annotation.width}, ${item.annotation.height})`,
      item.annotator.name,
      item.review.status === 'approved' ? '通过' : '驳回',
      item.review.comment,
      item.reviewer.name,
      formatDate(item.review.created_at),
    ])

    const headerRow = headers.join(',')
    const dataRows = rows.map((row) => row.map((cell) => escapeCSV(String(cell))).join(','))

    const summaryRows = [
      '',
      '',
      '',
      '',
      '',
      '项目名称',
      escapeCSV(data.projectName),
      '',
      '',
      '',
      '',
      '',
      '',
      '导出时间',
      escapeCSV(data.exportDate),
      '',
      '',
      '',
      '',
      '统计',
      `总计: ${data.statistics.total}`,
      `通过: ${data.statistics.approved}`,
      `驳回: ${data.statistics.rejected}`,
      `待审核: ${data.statistics.pending}`,
    ].join(',')

    return [headerRow, ...dataRows, '', summaryRows].join('\n')
  },

  toJSON(data: ReviewExportData): string {
    return JSON.stringify(data, null, 2)
  },

  toHTML(data: ReviewExportData): string {
    const statusColor = (status: string) => {
      if (status === 'approved') return '#7a9e7e'
      if (status === 'rejected') return '#c44536'
      return '#d4c5a0'
    }

    const statusText = (status: string) => {
      if (status === 'approved') return '通过'
      if (status === 'rejected') return '驳回'
      return '待审核'
    }

    const rows = data.reviews
      .map(
        (item) => `
      <tr>
        <td>${item.review.id}</td>
        <td>${item.annotation.id}</td>
        <td>${item.annotation.content || '-'}</td>
        <td>(${item.annotation.x}, ${item.annotation.y}, ${item.annotation.width}, ${item.annotation.height})</td>
        <td>${item.annotator.name}</td>
        <td style="background-color: ${statusColor(item.review.status)}20; color: ${statusColor(item.review.status)}">
          ${statusText(item.review.status)}
        </td>
        <td>${item.review.comment || '-'}</td>
        <td>${item.reviewer.name}</td>
        <td>${formatDate(item.review.created_at)}</td>
      </tr>
    `
      )
      .join('')

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>勘校意见汇总 - ${data.projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans SC', sans-serif; padding: 40px; background: #f5f0e6; color: #1a2e2a; }
    h1 { text-align: center; margin-bottom: 10px; font-family: 'Noto Serif SC', serif; }
    .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
    .stats { display: flex; justify-content: center; gap: 30px; margin-bottom: 30px; }
    .stat-card { background: white; padding: 15px 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #666; }
    .stat-approved { color: #7a9e7e; }
    .stat-rejected { color: #c44536; }
    table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    th { background: #1a2e2a; color: #f5f0e6; padding: 12px; text-align: left; }
    td { padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
    tr:hover { background: #faf8f3; }
    .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📜 勘校意见汇总</h1>
  <p class="subtitle">项目: ${data.projectName} | 导出时间: ${data.exportDate}</p>
  
  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">${data.statistics.total}</div>
      <div class="stat-label">总计</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-approved">${data.statistics.approved}</div>
      <div class="stat-label">通过</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-rejected">${data.statistics.rejected}</div>
      <div class="stat-label">驳回</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>审核ID</th>
        <th>标注ID</th>
        <th>标注内容</th>
        <th>位置</th>
        <th>标注者</th>
        <th>状态</th>
        <th>审核意见</th>
        <th>审核人</th>
        <th>审核时间</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    古籍拓片数字化勘校系统 · 自动生成
  </div>
</body>
</html>
    `.trim()
  },

  generateMarkdown(data: ReviewExportData): string {
    const statusText = (status: string) => {
      if (status === 'approved') return '✅ 通过'
      if (status === 'rejected') return '❌ 驳回'
      return '⏳ 待审核'
    }

    const tableRows = data.reviews
      .map(
        (item) =>
          `| ${item.review.id} | ${item.annotation.id} | ${item.annotation.content || '-'} | (${item.annotation.x}, ${item.annotation.y}) | ${item.annotator.name} | ${statusText(item.review.status)} | ${item.review.comment || '-'} | ${item.reviewer.name} | ${formatDate(item.review.created_at)} |`
      )
      .join('\n')

    return `# 勘校意见汇总

**项目**: ${data.projectName}  
**导出时间**: ${data.exportDate}

## 统计概览

| 总计 | 通过 | 驳回 | 待审核 |
|------|------|------|--------|
| ${data.statistics.total} | ${data.statistics.approved} | ${data.statistics.rejected} | ${data.statistics.pending} |

## 详细记录

| 审核ID | 标注ID | 标注内容 | 位置 | 标注者 | 状态 | 审核意见 | 审核人 | 审核时间 |
|--------|--------|----------|------|--------|------|----------|--------|----------|
${tableRows}

---
*古籍拓片数字化勘校系统 · 自动生成*
`
  },
}
