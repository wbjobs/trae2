export interface TextComparisonResult {
  similarity: number
  commonChars: string[]
  differentChars: {
    text1: string[]
    text2: string[]
  }
  alignment: Array<{
    char: string
    type: 'match' | 'mismatch' | 'insert' | 'delete'
    position: number
  }>
  suggestedCorrection?: string
}

export interface BatchComparisonResult {
  overallSimilarity: number
  results: Array<{
    annotationId: number
    content1: string
    content2: string
    result: TextComparisonResult
  }>
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        )
      }
    }
  }

  return dp[m][n]
}

function getAlignment(s1: string, s2: string): TextComparisonResult['alignment'] {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        )
      }
    }
  }

  const alignment: TextComparisonResult['alignment'] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && s1[i - 1] === s2[j - 1]) {
      alignment.unshift({ char: s1[i - 1], type: 'match', position: i - 1 })
      i--
      j--
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      alignment.unshift({ char: s1[i - 1], type: 'mismatch', position: i - 1 })
      i--
      j--
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      alignment.unshift({ char: s2[j - 1], type: 'insert', position: i })
      j--
    } else if (i > 0) {
      alignment.unshift({ char: s1[i - 1], type: 'delete', position: i - 1 })
      i--
    }
  }

  return alignment
}

export const textComparisonService = {
  compare(text1: string, text2: string): TextComparisonResult {
    const clean1 = text1.trim()
    const clean2 = text2.trim()

    if (clean1 === clean2) {
      return {
        similarity: 1,
        commonChars: clean1.split(''),
        differentChars: { text1: [], text2: [] },
        alignment: clean1.split('').map((char, i) => ({
          char,
          type: 'match' as const,
          position: i,
        })),
      }
    }

    const maxLen = Math.max(clean1.length, clean2.length)
    const distance = levenshteinDistance(clean1, clean2)
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 1

    const commonChars: string[] = []
    const different1: string[] = []
    const different2: string[] = []

    const set1 = new Set(clean1)
    const set2 = new Set(clean2)

    for (const char of clean1) {
      if (set2.has(char)) {
        commonChars.push(char)
      } else {
        different1.push(char)
      }
    }

    for (const char of clean2) {
      if (!set1.has(char)) {
        different2.push(char)
      }
    }

    const alignment = getAlignment(clean1, clean2)

    let suggestedCorrection: string | undefined
    if (similarity < 0.7 && clean2.length > 0) {
      suggestedCorrection = clean2
    }

    return {
      similarity,
      commonChars: [...new Set(commonChars)],
      differentChars: {
        text1: [...new Set(different1)],
        text2: [...new Set(different2)],
      },
      alignment,
      suggestedCorrection,
    }
  },

  batchCompare(
    pairs: Array<{ annotationId: number; text1: string; text2: string }>
  ): BatchComparisonResult {
    const results = pairs.map((pair) => ({
      annotationId: pair.annotationId,
      content1: pair.text1,
      content2: pair.text2,
      result: this.compare(pair.text1, pair.text2),
    }))

    const totalSimilarity = results.reduce((sum, r) => sum + r.result.similarity, 0)
    const overallSimilarity = results.length > 0 ? totalSimilarity / results.length : 1

    return {
      overallSimilarity,
      results,
    }
  },

  findBestMatch(
    target: string,
    candidates: string[]
  ): { index: number; similarity: number; text: string } | null {
    if (candidates.length === 0) return null

    let bestIndex = 0
    let bestSimilarity = -1

    candidates.forEach((candidate, index) => {
      const { similarity } = this.compare(target, candidate)
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestIndex = index
      }
    })

    return {
      index: bestIndex,
      similarity: bestSimilarity,
      text: candidates[bestIndex],
    }
  },

  getSimilarityLevel(similarity: number): 'exact' | 'high' | 'medium' | 'low' {
    if (similarity >= 0.95) return 'exact'
    if (similarity >= 0.8) return 'high'
    if (similarity >= 0.5) return 'medium'
    return 'low'
  },

  generateDiffHTML(result: TextComparisonResult): string {
    return result.alignment
      .map((item) => {
        switch (item.type) {
          case 'match':
            return `<span class="diff-match">${item.char}</span>`
          case 'mismatch':
            return `<span class="diff-mismatch">${item.char}</span>`
          case 'insert':
            return `<span class="diff-insert">${item.char}</span>`
          case 'delete':
            return `<span class="diff-delete">${item.char}</span>`
          default:
            return item.char
        }
      })
      .join('')
  },
}
