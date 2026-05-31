import { SEIParsedData, ParseProgress, ParseResult, WarningEntry } from '../types/h265';
import { enrichParseResult } from './seiComparator';

const NAL_TYPE_NAMES = [
  'TRAIL_N', 'TRAIL_R', 'TSA_N', 'TSA_R', 'STSA_N', 'STSA_R',
  'RADL_N', 'RADL_R', 'RASL_N', 'RASL_R', 'RSV_VCL_N10', 'RSV_VCL_R11',
  'RSV_VCL_N12', 'RSV_VCL_R13', 'RSV_VCL_N14', 'RSV_VCL_R15',
  'BLA_W_LP', 'BLA_W_RADL', 'BLA_N_LP', 'IDR_W_RADL', 'IDR_N_LP',
  'CRA_NUT', 'RSV_RADL_RVCL22', 'RSV_RADL_RVCL23',
  'RSV_VCL24', 'RSV_VCL25', 'RSV_VCL26', 'RSV_VCL27',
  'RSV_VCL28', 'RSV_VCL29', 'RSV_VCL30', 'RSV_VCL31',
  'VPS_NUT', 'SPS_NUT', 'PPS_NUT', 'AUD_NUT',
  'EOS_NUT', 'EOB_NUT', 'FD_NUT', 'PREFIX_SEI_NUT',
  'SUFFIX_SEI_NUT', 'RSV_NVCL41', 'RSV_NVCL42', 'RSV_NVCL43',
  'RSV_NVCL44', 'RSV_NVCL45', 'RSV_NVCL46', 'RSV_NVCL47',
  'UNSPEC48', 'UNSPEC49', 'UNSPEC50', 'UNSPEC51',
  'UNSPEC52', 'UNSPEC53', 'UNSPEC54', 'UNSPEC55',
  'UNSPEC56', 'UNSPEC57', 'UNSPEC58', 'UNSPEC59',
  'UNSPEC60', 'UNSPEC61', 'UNSPEC62', 'UNSPEC63'
];

const SEI_PAYLOAD_TYPE_NAMES = [
  'Buffering Period', 'Picture Timing', 'Pan-Scan Rect', 'Filler Payload',
  'User Data Registered (ITU-T T.35)', 'User Data Unregistered', 'Recovery Point',
  'Dec Ref Pic Marking Repetition', 'SpaREL Info', 'Chroma Resampling Filter Hint',
  'Tone Mapping Info', 'Frame Packing Arrangement', 'Display Orientation',
  'Structure of Pictures Info', 'Active Parameter Sets', 'Decoding Unit Info',
  'Temporal Sub-Zero Index', 'Decoded Picture Hash', 'Temporal Motion Constrained Tile Sets',
  'Layer Representation Information', 'Sub-Picture Region Information',
  'Reserved', 'Reserved', 'Reserved', 'Reserved', 'Reserved',
  'Green Meta Info', 'Mastering Display Colour Volume', 'Colour Remapping Info',
  'Content Colour Volume', 'Time Code', 'Neural Network Post Filter Info',
  'Neural Network Post Filter Activation', 'Film Grain Characteristics'
];

const WarningCodes = {
  WARN_SEI_PAYLOAD_SIZE_OVERFLOW: 1001,
  WARN_SEI_PAYLOAD_TYPE_INVALID: 1002,
  WARN_SEI_UUID_TRUNCATED: 1003,
  WARN_SEI_DATA_TRUNCATED: 1004,
  WARN_EBSP_PARSE_ERROR: 1005,
  WARN_NALU_SIZE_TOO_LARGE: 1006,
  WARN_SEI_TEXT_TOO_LONG: 1007,
  WARN_SEI_PARSE_TIMEOUT: 1008,
  WARN_SEI_SKIP_CORRUPT: 1009
};

export function getNALTypeName(type: number): string {
  return NAL_TYPE_NAMES[type] || `Unknown(${type})`;
}

export function getSEIPayloadTypeName(type: number): string {
  if (type >= 0 && type < SEI_PAYLOAD_TYPE_NAMES.length) {
    return SEI_PAYLOAD_TYPE_NAMES[type];
  }
  return `Reserved(${type})`;
}

export function formatHex(data: Uint8Array, offset: number, length: number): string {
  const hex: string[] = [];
  const end = Math.min(offset + length, data.length);
  for (let i = offset; i < end; i++) {
    hex.push(data[i].toString(16).padStart(2, '0'));
  }
  return hex.join(' ');
}

export function formatHexWithAscii(data: Uint8Array, offset: number, length: number): string {
  const hex: string[] = [];
  const ascii: string[] = [];
  const end = Math.min(offset + length, data.length);

  for (let i = offset; i < end; i++) {
    hex.push(data[i].toString(16).padStart(2, '0'));
    const char = data[i];
    ascii.push(char >= 32 && char < 127 ? String.fromCharCode(char) : '.');
  }

  return `${hex.join(' ')}  ${ascii.join('')}`;
}

export function parseSEIText(text: string): { isJson: boolean; parsed: any; displayText: string } {
  if (!text || text.length === 0) {
    return { isJson: false, parsed: null, displayText: '(empty)' };
  }

  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return { isJson: true, parsed, displayText: JSON.stringify(parsed, null, 2) };
    } catch {
      return { isJson: false, parsed: null, displayText: text };
    }
  }

  return { isJson: false, parsed: null, displayText: text };
}

class ParserWarningCollector {
  private warnings: WarningEntry[] = [];
  private maxWarnings: number = 1000;

  add(offset: number, code: number, message: string): void {
    if (this.warnings.length >= this.maxWarnings) {
      if (this.warnings.length === this.maxWarnings) {
        this.warnings.push({
          offset: 0,
          warningCode: 0,
          message: `Additional warnings truncated. Total warnings may exceed ${this.maxWarnings}`,
          timestamp: Date.now()
        });
      }
      return;
    }
    
    this.warnings.push({
      offset,
      warningCode: code,
      message,
      timestamp: Date.now()
    });
  }

  getAll(): WarningEntry[] {
    return [...this.warnings];
  }

  getCount(): number {
    return this.warnings.length;
  }

  clear(): void {
    this.warnings = [];
  }
}

function findStartCode(data: Uint8Array, startPos: number): number {
  try {
    if (!data || startPos + 3 >= data.length) return -1;
    
    for (let i = startPos; i + 3 < data.length; i++) {
      if (data[i] === 0 && data[i + 1] === 0) {
        if (i + 4 < data.length && data[i + 2] === 0 && data[i + 3] === 1) {
          return i;
        }
        if (data[i + 2] === 1) {
          return i;
        }
      }
    }
    return -1;
  } catch (e) {
    return -1;
  }
}

function findNextStartCode(data: Uint8Array, startPos: number): number {
  try {
    if (!data || startPos + 3 >= data.length) return data.length;
    
    for (let i = startPos + 3; i + 3 < data.length; i++) {
      if (data[i] === 0 && data[i + 1] === 0) {
        if (i + 4 < data.length && data[i + 2] === 0 && data[i + 3] === 1) {
          return i;
        }
        if (data[i + 2] === 1) {
          return i;
        }
      }
    }
    return data.length;
  } catch (e) {
    return data.length;
  }
}

function getStartCodeLength(data: Uint8Array, offset: number): number {
  try {
    if (!data || offset + 3 >= data.length) return 0;
    
    if (offset + 4 < data.length &&
        data[offset] === 0 && data[offset + 1] === 0 &&
        data[offset + 2] === 0 && data[offset + 3] === 1) {
      return 4;
    }
    if (data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 1) {
      return 3;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

interface SEIPayloadInfo {
  payloadType: number;
  payloadSize: number;
  payloadOffset: number;
  isUserDataRegistered: boolean;
  uuid: string;
  seiText: string;
  seiTextLen: number;
  hasWarning: boolean;
  warningCode: number;
  warningMessage: string;
}

function parseSEIPayload(
  data: Uint8Array, 
  naluStart: number, 
  naluSize: number, 
  nalHeaderSize: number,
  globalOffset: number,
  warnings: ParserWarningCollector
): SEIPayloadInfo | null {
  const MAX_NALU_SIZE = 10 * 1024 * 1024;
  const MAX_PAYLOAD_TYPE = 255;
  const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
  const MAX_TYPE_BYTES = 10;
  const MAX_SIZE_BYTES = 10;

  const result: SEIPayloadInfo = {
    payloadType: -1,
    payloadSize: 0,
    payloadOffset: 0,
    isUserDataRegistered: false,
    uuid: '',
    seiText: '',
    seiTextLen: 0,
    hasWarning: false,
    warningCode: 0,
    warningMessage: ''
  };

  try {
    if (nalHeaderSize >= naluSize) {
      return null;
    }

    if (naluSize > MAX_NALU_SIZE) {
      warnings.add(globalOffset, WarningCodes.WARN_NALU_SIZE_TOO_LARGE, 
        `NAL unit size ${naluSize} exceeds safe limit`);
      return null;
    }

    const rbsp: number[] = [];
    const offset = nalHeaderSize;
    
    for (let i = offset; i < naluSize; i++) {
      const idx = naluStart + i;
      if (idx >= data.length) break;
      
      if (idx + 2 < data.length && 
          data[idx] === 0 && data[idx + 1] === 0 && data[idx + 2] === 3) {
        if (rbsp.length + 2 > MAX_NALU_SIZE) {
          warnings.add(globalOffset, WarningCodes.WARN_EBSP_PARSE_ERROR, 
            "RBSP size exceeded during EBSP parsing");
          return null;
        }
        rbsp.push(data[idx]);
        rbsp.push(data[idx + 1]);
        i += 2;
      } else {
        if (rbsp.length + 1 > MAX_NALU_SIZE) {
          warnings.add(globalOffset, WarningCodes.WARN_EBSP_PARSE_ERROR, 
            "RBSP size exceeded during EBSP parsing");
          return null;
        }
        rbsp.push(data[idx]);
      }
    }

    if (rbsp.length === 0) {
      return null;
    }

    let rbspPos = 0;
    
    while (rbspPos < rbsp.length) {
      let payloadType = 0;
      let typeBytes = 0;
      
      while (rbspPos < rbsp.length && rbsp[rbspPos] === 0xFF) {
        payloadType += 255;
        rbspPos++;
        typeBytes++;
        if (typeBytes > MAX_TYPE_BYTES || payloadType > MAX_PAYLOAD_TYPE * 10) {
          warnings.add(globalOffset, WarningCodes.WARN_SEI_PAYLOAD_TYPE_INVALID, 
            "SEI payload type too large");
          return null;
        }
      }
      if (rbspPos >= rbsp.length) break;
      payloadType += rbsp[rbspPos];
      rbspPos++;

      let payloadSize = 0;
      let sizeBytes = 0;
      
      while (rbspPos < rbsp.length && rbsp[rbspPos] === 0xFF) {
        payloadSize += 255;
        rbspPos++;
        sizeBytes++;
        if (sizeBytes > MAX_SIZE_BYTES || payloadSize > MAX_PAYLOAD_SIZE) {
          warnings.add(globalOffset, WarningCodes.WARN_SEI_PAYLOAD_SIZE_OVERFLOW, 
            `SEI payload size exceeded safe limit at offset 0x${globalOffset.toString(16)}`);
          return null;
        }
      }
      if (rbspPos >= rbsp.length) {
        warnings.add(globalOffset, WarningCodes.WARN_SEI_DATA_TRUNCATED, 
          "SEI payload size truncated");
        return null;
      }
      payloadSize += rbsp[rbspPos];
      rbspPos++;

      if (payloadSize > MAX_PAYLOAD_SIZE) {
        warnings.add(globalOffset, WarningCodes.WARN_SEI_PAYLOAD_SIZE_OVERFLOW, 
          `SEI payload size ${payloadSize} exceeds limit at offset 0x${globalOffset.toString(16)}`);
        return null;
      }

      if (rbspPos + payloadSize > rbsp.length) {
        warnings.add(globalOffset, WarningCodes.WARN_SEI_DATA_TRUNCATED, 
          `SEI payload truncated at offset 0x${globalOffset.toString(16)}, expected ${payloadSize} bytes, got ${rbsp.length - rbspPos}`);
        payloadSize = rbsp.length - rbspPos;
      }

      result.payloadType = payloadType;
      result.payloadSize = payloadSize;
      result.payloadOffset = rbspPos;

      if (payloadType === 4) {
        result.isUserDataRegistered = true;
        if (rbspPos + 16 <= rbsp.length) {
          let uuidHex = '';
          for (let i = 0; i < 16; i++) {
            uuidHex += rbsp[rbspPos + i].toString(16).padStart(2, '0').toUpperCase();
          }
          result.uuid = uuidHex;

          const dataOffset = rbspPos + 16;
          const dataLen = payloadSize > 16 ? payloadSize - 16 : 0;
          
          if (dataLen > 0 && dataOffset + dataLen <= rbsp.length) {
            const textBytes = rbsp.slice(dataOffset, dataOffset + Math.min(dataLen, 4095));
            try {
              result.seiText = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(textBytes));
              result.seiTextLen = dataLen;
            } catch (e) {
              result.seiText = '';
              result.seiTextLen = 0;
            }
          }
        } else {
          warnings.add(globalOffset, WarningCodes.WARN_SEI_UUID_TRUNCATED, 
            "SEI UUID truncated");
        }
      } else if (payloadType === 5) {
        if (payloadSize > 0 && rbspPos + payloadSize <= rbsp.length) {
          const textBytes = rbsp.slice(rbspPos, rbspPos + Math.min(payloadSize, 4095));
          try {
            result.seiText = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(textBytes));
            result.seiTextLen = payloadSize;
          } catch (e) {
            result.seiText = '';
            result.seiTextLen = 0;
          }
        }
      }

      rbspPos += payloadSize;
      if (rbspPos > rbsp.length) {
        rbspPos = rbsp.length;
      }

      break;
    }

    return result.payloadType >= 0 ? result : null;

  } catch (e) {
    warnings.add(globalOffset, WarningCodes.WARN_EBSP_PARSE_ERROR, 
      `Exception during SEI parsing: ${e}`);
    return null;
  }
}

export async function parseFileInChunks(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
  const startTime = performance.now();
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const OVERLAP_SIZE = 1 * 1024 * 1024;
  const CHUNK_TIMEOUT_MS = 5000;

  const fileSize = file.size;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  const seiData: SEIParsedData[] = [];
  const warnings = new ParserWarningCollector();
  let totalNALUs = 0;
  let totalSEIs = 0;
  let processedBytes = 0;
  let timedOutChunks = 0;

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const chunkStart = chunkIdx * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE + OVERLAP_SIZE, fileSize);
    const readSize = chunkEnd - chunkStart;

    const chunkTimeout = new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error('Chunk parse timeout')), CHUNK_TIMEOUT_MS);
    });

    try {
      const chunk = await Promise.race([
        file.slice(chunkStart, chunkEnd).arrayBuffer(),
        chunkTimeout
      ]) as ArrayBuffer;
      
      const chunkData = new Uint8Array(chunk);

      const actualChunkSize = Math.min(CHUNK_SIZE, readSize);
      const parseStart = chunkIdx === 0 ? 0 : OVERLAP_SIZE;
      const parseEnd = Math.min(readSize, actualChunkSize + OVERLAP_SIZE);

      let pos = parseStart;
      while (pos < parseEnd - 2) {
        try {
          const startCodePos = findStartCode(chunkData, pos);
          if (startCodePos < 0 || startCodePos >= parseEnd - 2) break;

          const startCodeLen = getStartCodeLength(chunkData, startCodePos);
          if (startCodeLen === 0) {
            pos = startCodePos + 1;
            continue;
          }

          const naluStart = startCodePos + startCodeLen;
          if (naluStart + 2 > chunkData.length) break;

          const nextStart = findNextStartCode(chunkData, naluStart);
          const naluSize = Math.min(nextStart - naluStart, chunkData.length - naluStart);

          if (naluSize < 2) {
            pos = startCodePos + startCodeLen;
            continue;
          }

          const nalHeader = (chunkData[naluStart] << 8) | chunkData[naluStart + 1];
          const nalType = (nalHeader >> 9) & 0x3F;
          const temporalId = nalHeader & 0x7;

          totalNALUs++;

          if (nalType === 39 || nalType === 40) {
            const globalOffset = chunkStart + startCodePos;
            const seiInfo = parseSEIPayload(
              chunkData, naluStart, naluSize, 2, globalOffset, warnings
            );
            
            if (seiInfo && seiInfo.payloadType >= 0) {
              totalSEIs++;

              const hexData = formatHex(
                chunkData,
                startCodePos,
                Math.min(naluSize + startCodeLen, 256)
              );

              seiData.push({
                id: `sei_${totalSEIs}`,
                offset: globalOffset,
                nalType,
                nalTypeName: getNALTypeName(nalType),
                temporalId,
                naluSize,
                hasSEI: true,
                seiPayloadType: seiInfo.payloadType,
                seiPayloadTypeName: getSEIPayloadTypeName(seiInfo.payloadType),
                seiPayloadSize: seiInfo.payloadSize,
                isUserDataRegistered: seiInfo.isUserDataRegistered,
                uuid: seiInfo.isUserDataRegistered && seiInfo.uuid ? seiInfo.uuid : undefined,
                seiText: seiInfo.seiText,
                seiTextLen: seiInfo.seiTextLen,
                hexData,
                hasWarning: seiInfo.hasWarning,
                warningCode: seiInfo.warningCode || undefined,
                warningMessage: seiInfo.warningMessage || undefined
              });
            }
          }

          const nextPos = startCodePos + startCodeLen + naluSize;
          if (nextPos <= pos || nextPos >= parseEnd) {
            pos++;
          } else {
            pos = nextPos;
          }

        } catch (e) {
          const errorOffset = chunkStart + pos;
          warnings.add(errorOffset, WarningCodes.WARN_SEI_SKIP_CORRUPT, 
            `Skipping corrupt NAL at offset 0x${errorOffset.toString(16)}: ${e}`);
          pos++;
        }
      }

      processedBytes += actualChunkSize;

      if (onProgress) {
        onProgress({
          processed: processedBytes,
          total: fileSize,
          percentage: Math.min((processedBytes / fileSize) * 100, 100),
          currentChunk: chunkIdx + 1,
          totalChunks,
          seiFound: totalSEIs
        });
      }

      await new Promise(resolve => setTimeout(resolve, 0));

    } catch (e) {
      timedOutChunks++;
      const chunkOffset = chunkIdx * CHUNK_SIZE;
      warnings.add(chunkOffset, WarningCodes.WARN_SEI_PARSE_TIMEOUT, 
        `Chunk ${chunkIdx + 1} parse timeout at offset 0x${chunkOffset.toString(16)}, skipping`);
      processedBytes += Math.min(CHUNK_SIZE, fileSize - chunkStart);
    }
  }

  const endTime = performance.now();

  const rawResult: ParseResult = {
    seiData,
    totalNALUs,
    totalSEIs,
    totalWarnings: warnings.getCount(),
    warnings: warnings.getAll(),
    processingTime: endTime - startTime,
    fileSize,
    fileName: file.name,
    timedOutChunks
  };

  return enrichParseResult(rawResult);
}
