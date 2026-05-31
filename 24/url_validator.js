const STREAM_PROTOCOLS = {
    RTMP: 'rtmp',
    RTSP: 'rtsp',
    HTTP: 'http',
    HTTPS: 'https',
    UDP: 'udp',
    SRT: 'srt',
    RIST: 'rist'
};

const VALID_PROTOCOLS = [
    STREAM_PROTOCOLS.RTMP,
    STREAM_PROTOCOLS.RTSP,
    STREAM_PROTOCOLS.HTTP,
    STREAM_PROTOCOLS.HTTPS,
    STREAM_PROTOCOLS.UDP,
    STREAM_PROTOCOLS.SRT,
    STREAM_PROTOCOLS.RIST
];

class UrlValidator {
    validateUrlFormat(streamUrl) {
        return new Promise((resolve) => {
            if (!streamUrl || typeof streamUrl !== 'string' || streamUrl.trim().length === 0) {
                resolve({ valid: false, error: '码流地址为空' });
                return;
            }

            try {
                const trimmedUrl = streamUrl.trim();
                const protocolIndex = trimmedUrl.indexOf('://');

                if (protocolIndex === -1) {
                    resolve({ valid: false, error: 'URL格式错误，缺少协议' });
                    return;
                }

                const protocol = trimmedUrl.substring(0, protocolIndex).toLowerCase();
                const rest = trimmedUrl.substring(protocolIndex + 3);

                if (rest.length === 0) {
                    resolve({ valid: false, error: 'URL格式错误，缺少主机地址' });
                    return;
                }

                resolve({ valid: true });
            } catch (err) {
                resolve({ valid: false, error: `URL解析失败: ${err.message}` });
            }
        });
    }

    validateProtocol(streamUrl) {
        return new Promise((resolve) => {
            const protocolIndex = streamUrl.indexOf('://');
            if (protocolIndex === -1) {
                resolve({ valid: false, error: '无法识别协议' });
                return;
            }

            const protocol = streamUrl.substring(0, protocolIndex).toLowerCase();

            if (!VALID_PROTOCOLS.includes(protocol)) {
                resolve({
                    valid: false,
                    error: `不支持的协议: ${protocol}，支持的协议: ${VALID_PROTOCOLS.join(', ')}`
                });
                return;
            }

            resolve({ valid: true, protocol });
        });
    }

    extractProtocol(streamUrl) {
        const protocolIndex = streamUrl.indexOf('://');
        if (protocolIndex === -1) {
            return null;
        }
        return streamUrl.substring(0, protocolIndex).toLowerCase();
    }
}

module.exports = { UrlValidator, STREAM_PROTOCOLS, VALID_PROTOCOLS };