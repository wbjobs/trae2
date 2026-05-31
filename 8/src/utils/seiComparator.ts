import { SEIParsedData, SEIMatchResult, ParseResult } from '../types/h265';

const DEFAULT_FRAME_RATE = 25;
const DEFAULT_TICKS_PER_SECOND = 90000;

export function estimatePTS(
  seiData: SEIParsedData[],
  frameRate: number = DEFAULT_FRAME_RATE
): SEIParsedData[] {
  const seiByType: Record<number, SEIParsedData[]> = {};
  
  seiData.forEach(sei => {
    const type = sei.seiPayloadType ?? -1;
    if (!seiByType[type]) {
      seiByType[type] = [];
    }
    seiByType[type].push(sei);
  });

  return seiData.map((sei, index) => {
    const type = sei.seiPayloadType ?? -1;
    const typeIndex = seiByType[type]?.findIndex(s => s.id === sei.id) ?? index;
    
    const pts = typeIndex * DEFAULT_TICKS_PER_SECOND / frameRate;
    const ptsSeconds = pts / DEFAULT_TICKS_PER_SECOND;
    
    return {
      ...sei,
      pts,
      ptsSeconds,
      frameNumber: typeIndex,
      seiIndex: index,
      parsedContent: parseSEIContent(sei.seiText)
    };
  });
}

export function parseSEIContent(text: string): any {
  if (!text || text.length === 0) {
    return { raw: text };
  }

  const trimmed = text.trim();
  
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw: text };
    }
  }

  if (trimmed.includes('=')) {
    const result: Record<string, string> = {};
    const pairs = trimmed.split(/[;,]/);
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        result[key.trim()] = value.trim();
      }
    });
    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  return { raw: text };
}

export function findMatchingSEI(
  sourceSEI: SEIParsedData,
  targetSEIs: SEIParsedData[],
  maxPTSDifference: number = DEFAULT_TICKS_PER_SECOND
): SEIMatchResult {
  const payloadType = sourceSEI.seiPayloadType;
  
  const candidates = targetSEIs.filter(
    sei => sei.seiPayloadType === payloadType
  );

  if (candidates.length === 0) {
    return {
      sourceSEI,
      targetSEI: null,
      matchScore: 0,
      ptsDifference: Infinity,
      isExactMatch: false
    };
  }

  const sourcePTS = sourceSEI.pts ?? 0;
  let bestMatch: SEIParsedData | null = null;
  let minDiff = Infinity;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidatePTS = candidate.pts ?? 0;
    const diff = Math.abs(candidatePTS - sourcePTS);
    
    if (diff > maxPTSDifference) continue;

    let score = 100;
    
    if (diff === 0) {
      score = 100;
    } else {
      score = Math.max(0, 100 - (diff / DEFAULT_TICKS_PER_SECOND) * 50);
    }
    
    if (sourceSEI.uuid && candidate.uuid && sourceSEI.uuid === candidate.uuid) {
      score += 20;
    }
    
    if (sourceSEI.seiPayloadSize === candidate.seiPayloadSize) {
      score += 10;
    }

    if (score > bestScore || (score === bestScore && diff < minDiff)) {
      bestScore = score;
      minDiff = diff;
      bestMatch = candidate;
    }
  }

  return {
    sourceSEI,
    targetSEI: bestMatch,
    matchScore: bestMatch ? bestScore : 0,
    ptsDifference: bestMatch ? minDiff : Infinity,
    isExactMatch: bestMatch ? minDiff === 0 : false
  };
}

export function findAllMatches(
  sourceSEIs: SEIParsedData[],
  targetSEIs: SEIParsedData[]
): SEIMatchResult[] {
  return sourceSEIs.map(sei => findMatchingSEI(sei, targetSEIs));
}

export function getSEIComparisonData(sei: SEIParsedData): any {
  return {
    basic: {
      type: sei.seiPayloadTypeName,
      typeCode: sei.seiPayloadType,
      size: sei.seiPayloadSize,
      offset: `0x${sei.offset.toString(16)}`,
      pts: sei.ptsSeconds ? `${sei.ptsSeconds.toFixed(3)}s` : 'N/A',
      frame: sei.frameNumber
    },
    metadata: {
      nalType: sei.nalTypeName,
      temporalId: sei.temporalId,
      isUserDataRegistered: sei.isUserDataRegistered,
      uuid: sei.uuid || 'N/A'
    },
    payload: sei.parsedContent || { raw: sei.seiText },
    rawHex: sei.hexData
  };
}

export function calculateMatchStatistics(matches: SEIMatchResult[]): {
  total: number;
  exactMatches: number;
  closeMatches: number;
  noMatches: number;
  avgMatchScore: number;
  avgPTSDifference: number;
} {
  const total = matches.length;
  const exactMatches = matches.filter(m => m.isExactMatch).length;
  const closeMatches = matches.filter(m => m.targetSEI && !m.isExactMatch && m.matchScore >= 50).length;
  const noMatches = matches.filter(m => !m.targetSEI).length;
  
  const matched = matches.filter(m => m.targetSEI);
  const avgMatchScore = matched.length > 0
    ? matched.reduce((sum, m) => sum + m.matchScore, 0) / matched.length
    : 0;
  const avgPTSDifference = matched.length > 0
    ? matched.reduce((sum, m) => sum + m.ptsDifference, 0) / matched.length
    : 0;

  return {
    total,
    exactMatches,
    closeMatches,
    noMatches,
    avgMatchScore,
    avgPTSDifference
  };
}

export function formatPTS(pts?: number, ticksPerSecond: number = DEFAULT_TICKS_PER_SECOND): string {
  if (pts === undefined || pts === null) return 'N/A';
  
  const seconds = pts / ticksPerSecond;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function formatPTSDifference(diff: number, ticksPerSecond: number = DEFAULT_TICKS_PER_SECOND): string {
  if (diff === Infinity) return 'N/A';
  
  const ms = (diff / ticksPerSecond) * 1000;
  return `${ms > 0 ? '+' : ''}${ms.toFixed(0)}ms`;
}

export function enrichParseResult(result: ParseResult): ParseResult {
  const enrichedSEIs = estimatePTS(result.seiData);
  return {
    ...result,
    seiData: enrichedSEIs,
    frameRate: DEFAULT_FRAME_RATE,
    duration: result.seiData.length > 0 && enrichedSEIs.length > 0
      ? (enrichedSEIs[enrichedSEIs.length - 1].ptsSeconds || 0)
      : 0
  };
}
