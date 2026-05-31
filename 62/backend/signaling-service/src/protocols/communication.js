/**
 * 通信信令协议解析器
 * 处理 PABX (自动用户交换机) / IP语音 (VoIP) 等通信系统信令
 * 支持协议: SIP、H.323、PRI (ISDN)、R2、模拟线路信令
 */

const crypto = require('crypto');

const SIP_METHODS = ['INVITE', 'ACK', 'BYE', 'CANCEL', 'REGISTER', 'OPTIONS', 'INFO', 'UPDATE', 'PRACK', 'SUBSCRIBE', 'NOTIFY', 'REFER', 'MESSAGE'];
const SIP_RESPONSES = [
  { code: 100, text: 'Trying' },
  { code: 180, text: 'Ringing' },
  { code: 183, text: 'Session Progress' },
  { code: 200, text: 'OK' },
  { code: 302, text: 'Moved Temporarily' },
  { code: 401, text: 'Unauthorized' },
  { code: 403, text: 'Forbidden' },
  { code: 404, text: 'Not Found' },
  { code: 486, text: 'Busy Here' },
  { code: 503, text: 'Service Unavailable' },
];

const H323_FACILITIES = [
  { code: 1, text: 'FastStart' },
  { code: 2, text: 'H.245 Tunneling' },
  { code: 3, text: 'Media Flow' },
  { code: 4, text: 'Call Transfer' },
];

const PRI_CALL_STATES = [
  'SETUP', 'CALL_PROC', 'ALERT', 'CONNECT', 'CONNECT_ACK',
  'DISCONNECT', 'RELEASE', 'RELEASE_COMPLETE',
];

function generateCallerId() {
  return '021' + Math.floor(10000000 + Math.random() * 89999999).toString();
}

function generateCalleeId() {
  return '021' + Math.floor(10000000 + Math.random() * 89999999).toString();
}

function generateCallId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * 解析 SIP 信令
 * 生成 SIP 协议格式报文并返回结构化数据
 */
function parseSIP() {
  const isRequest = Math.random() > 0.5;
  let rawData, parsedData, severity;

  if (isRequest) {
    const method = SIP_METHODS[Math.floor(Math.random() * SIP_METHODS.length)];
    const callerId = generateCallerId();
    const calleeId = generateCalleeId();
    const callId = generateCallId();
    const branch = crypto.randomBytes(4).toString('hex');
    const seq = Math.floor(Math.random() * 10000);

    rawData = [
      `${method} sip:${calleeId}@metro-pbx.local SIP/2.0`,
      `Via: SIP/2.0/UDP 192.168.100.${Math.floor(Math.random() * 254) + 1}:5060;branch=z9hG4bK${branch}`,
      `From: <sip:${callerId}@metro-pbx.local>;tag=${crypto.randomBytes(4).toString('hex')}`,
      `To: <sip:${calleeId}@metro-pbx.local>`,
      `Call-ID: ${callId}@metro-pbx.local`,
      `CSeq: ${seq} ${method}`,
      `Contact: <sip:${callerId}@192.168.100.${Math.floor(Math.random() * 254) + 1}:5060>`,
      `User-Agent: Metro-PABX-3000/1.0`,
      `Content-Length: 0`,
      '',
    ].join('\r\n');

    parsedData = {
      protocol: 'SIP',
      version: '2.0',
      messageType: 'request',
      method,
      callerId,
      calleeId,
      callId,
      seq,
      branch,
      srcPort: 5060,
      dstPort: 5060,
    };
    severity = 'info';
  } else {
    const resp = SIP_RESPONSES[Math.floor(Math.random() * SIP_RESPONSES.length)];
    const callId = generateCallId();
    const seq = Math.floor(Math.random() * 10000);

    rawData = [
      `SIP/2.0 ${resp.code} ${resp.text}`,
      `Via: SIP/2.0/UDP 192.168.100.${Math.floor(Math.random() * 254) + 1}:5060;branch=z9hG4bK${crypto.randomBytes(4).toString('hex')}`,
      `From: <sip:caller@metro-pbx.local>;tag=${crypto.randomBytes(4).toString('hex')}`,
      `To: <sip:callee@metro-pbx.local>;tag=${crypto.randomBytes(4).toString('hex')}`,
      `Call-ID: ${callId}@metro-pbx.local`,
      `CSeq: ${seq} INVITE`,
      `Server: Metro-PABX-3000/1.0`,
      `Content-Length: 0`,
      '',
    ].join('\r\n');

    parsedData = {
      protocol: 'SIP',
      version: '2.0',
      messageType: 'response',
      statusCode: resp.code,
      statusText: resp.text,
      callId,
      seq,
      responseTo: 'INVITE',
    };
    severity = resp.code >= 400 ? 'warning' : 'info';
  }

  return {
    protocol: 'SIP',
    rawData: Buffer.from(rawData).toString('base64'),
    parsedData: JSON.stringify(parsedData),
    severity,
  };
}

/**
 * 解析 H.323 信令
 * 生成 H.323 Q.931/H.245 信令报文
 */
function parseH323() {
  const facility = H323_FACILITIES[Math.floor(Math.random() * H323_FACILITIES.length)];
  const callRef = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
  const conferenceId = crypto.randomBytes(16).toString('hex');

  const rawHex = [
    '03',                    // Protocol discriminator
    '02',                    // Call Reference Value length
    callRef.slice(0, 2),    // Call Reference Value (high)
    callRef.slice(2, 4),    // Call Reference Value (low)
    '05',                    // Message Type (SETUP)
    '18',                    // Mandatory variable
    '04',                    // Bearer Capability length
    '8090A218',              // Bearer Capability
    '6C',                    // Calling Party Number
    '00',                    // Calling Party Number length
  ].join('');

  const parsedData = {
    protocol: 'H.323',
    version: 4,
    messageType: 'SETUP',
    callReferenceValue: callRef,
    conferenceId,
    facility: facility.text,
    bearerCapability: 'Unrestricted Digital',
    mediaChannel: Math.floor(Math.random() * 30) + 1,
  };

  return {
    protocol: 'H.323',
    rawData: rawHex,
    parsedData: JSON.stringify(parsedData),
    severity: 'info',
  };
}

/**
 * 解析 PRI (ISDN) 信令
 * 生成 PRI D信道信令数据
 */
function parsePRI() {
  const state = PRI_CALL_STATES[Math.floor(Math.random() * PRI_CALL_STATES.length)];
  const dChannel = Math.floor(Math.random() * 23) + 1;
  const bChannel = Math.floor(Math.random() * 30) + 1;
  const callerNum = generateCallerId();
  const calleeNum = generateCalleeId();
  const tei = Math.floor(Math.random() * 64);

  const parsedData = {
    protocol: 'PRI',
    type: 'ISDN-PRI',
    dChannel,
    bChannel,
    tei,
    callState: state,
    callerNumber: callerNum,
    calleeNumber: calleeNum,
    callDuration: Math.floor(Math.random() * 600),
  };

  const rawHex = [
    '02',              // Protocol discriminator
    '00',              // Call Reference
    (dChannel).toString(16).padStart(2, '0'),
    '05',              // Message type
    '6C',              // Calling party
    '70',              // Called party
    'A1',              // Channel identification
  ].join('');

  return {
    protocol: 'PRI',
    rawData: rawHex,
    parsedData: JSON.stringify(parsedData),
    severity: state === 'DISCONNECT' || state === 'RELEASE' ? 'info' : 'info',
  };
}

/**
 * 随机选择协议并生成信令数据
 */
function generateSignal() {
  const protocols = ['SIP', 'H.323', 'PRI'];
  const proto = protocols[Math.floor(Math.random() * protocols.length)];

  switch (proto) {
    case 'SIP': return parseSIP();
    case 'H.323': return parseH323();
    case 'PRI': return parsePRI();
    default: return parseSIP();
  }
}

module.exports = {
  parseSIP,
  parseH323,
  parsePRI,
  generateSignal,
};