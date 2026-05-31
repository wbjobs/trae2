export interface WarningEntry {
  offset: number;
  warningCode: number;
  message: string;
  timestamp?: number;
}

export interface NALUResult {
  start_code_offset: number;
  nalu_size: number;
  nal_type: number;
  temporal_id: number;
  sei_payload_type: number;
  sei_payload_size: number;
  sei_payload_offset: number;
  has_sei: boolean;
  is_user_data_registered: boolean;
  has_warning: boolean;
  warning_code: number;
  uuid_iso_iec_11578: string;
  sei_text: string;
  sei_text_len: number;
  error_code: number;
  error_msg: string;
}

export interface SEIParsedData {
  id: string;
  offset: number;
  nalType: number;
  nalTypeName: string;
  temporalId: number;
  naluSize: number;
  hasSEI: boolean;
  seiPayloadType?: number;
  seiPayloadTypeName?: string;
  seiPayloadSize?: number;
  isUserDataRegistered: boolean;
  uuid?: string;
  seiText: string;
  seiTextLen: number;
  hexData: string;
  hasWarning?: boolean;
  warningCode?: number;
  warningMessage?: string;
  pts?: number;
  ptsSeconds?: number;
  frameNumber?: number;
  seiIndex?: number;
  parsedContent?: any;
}

export interface ParseProgress {
  processed: number;
  total: number;
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  seiFound: number;
}

export interface ParseResult {
  seiData: SEIParsedData[];
  totalNALUs: number;
  totalSEIs: number;
  totalWarnings: number;
  warnings: WarningEntry[];
  processingTime: number;
  fileSize: number;
  fileName: string;
  timedOutChunks: number;
  frameRate?: number;
  duration?: number;
}

export interface H265ParserModule {
  ccall: (
    ident: string,
    returnType: string,
    argTypes: string[],
    args: any[]
  ) => any;
  cwrap: (
    ident: string,
    returnType: string,
    argTypes: string[]
  ) => (...args: any[]) => any;
  getValue: (ptr: number, type: string, noSafe?: boolean) => number;
  setValue: (ptr: number, value: number, type: string, noSafe?: boolean) => void;
  HEAPU8: Uint8Array;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _parse_nalu: (
    dataPtr: number,
    dataSize: number,
    startOffset: number,
    resultPtr: number
  ) => void;
  _safe_parse_nalu: (
    dataPtr: number,
    dataSize: number,
    startOffset: number,
    resultPtr: number
  ) => void;
  _find_nalu_in_chunk: (
    dataPtr: number,
    dataSize: number,
    startOffset: number,
    resultBufferPtr: number,
    resultBufferSize: number,
    maxNALUs: number
  ) => number;
  _safe_find_nalu_in_chunk: (
    dataPtr: number,
    dataSize: number,
    startOffset: number,
    resultBufferPtr: number,
    resultBufferSize: number,
    maxNALUs: number,
    warningBufferPtr: number,
    warningBufferSize: number,
    warningCountPtr: number
  ) => number;
  UTF8ToString: (ptr: number, maxBytesToRead?: number) => string;
}

export interface SEIMatchResult {
  sourceSEI: SEIParsedData;
  targetSEI: SEIParsedData | null;
  matchScore: number;
  ptsDifference: number;
  isExactMatch: boolean;
}

export interface ComparisonState {
  mode: 'single' | 'compare';
  leftFile: ParseResult | null;
  rightFile: ParseResult | null;
  selectedLeftId: string | null;
  selectedRightId: string | null;
  matchedPair: SEIMatchResult | null;
  isSyncScroll: boolean;
  showDiffView: boolean;
}

export type FileSide = 'left' | 'right';

declare global {
  interface Window {
    createH265ParserModule: () => Promise<H265ParserModule>;
  }
}

export {};
