const { STREAM_PROTOCOLS } = require('./url_validator');

class StreamAccessibilityChecker {
    constructor(timeout = 10000) {
        this.validationTimeout = timeout;
    }

    async validateStreamAccessibility(streamUrl, timeout) {
        const effectiveTimeout = timeout || this.validationTimeout;

        return new Promise((resolve) => {
            const protocolIndex = streamUrl.indexOf('://');
            const protocol = streamUrl.substring(0, protocolIndex).toLowerCase();

            const simulatedStreamInfo = this.generateSimulatedStreamInfo(streamUrl, protocol);

            setTimeout(() => {
                resolve({
                    valid: true,
                    streamInfo: simulatedStreamInfo
                });
            }, 500);
        });
    }

    generateSimulatedStreamInfo(streamUrl, protocol) {
        const codecMap = {
            'rtmp': { video: 'h264', audio: 'aac' },
            'rtsp': { video: 'h264', audio: 'aac' },
            'http': { video: 'h264', audio: 'aac' },
            'https': { video: 'h264', audio: 'aac' },
            'udp': { video: 'mpeg2', audio: 'mp2' },
            'srt': { video: 'h264', audio: 'aac' },
            'rist': { video: 'h264', audio: 'aac' }
        };

        const codec = codecMap[protocol] || { video: 'h264', audio: 'aac' };

        return {
            protocol,
            videoCodec: codec.video,
            audioCodec: codec.audio,
            resolution: {
                width: 1920,
                height: 1080
            },
            frameRate: 25,
            videoBitrate: 5000,
            audioBitrate: 128,
            sampleRate: 48000,
            channels: 2,
            container: this.detectContainer(streamUrl),
            duration: null,
            isLive: this.isLiveStream(streamUrl, protocol),
            hasAudio: true,
            hasVideo: true
        };
    }

    detectContainer(streamUrl) {
        const urlLower = streamUrl.toLowerCase();

        if (urlLower.includes('.m3u8')) return 'hls';
        if (urlLower.includes('.mpd')) return 'dash';
        if (urlLower.includes('.ts')) return 'ts';
        if (urlLower.includes('.flv')) return 'flv';
        if (urlLower.includes('.mp4')) return 'mp4';
        if (urlLower.includes('.mkv')) return 'mkv';

        return 'unknown';
    }

    isLiveStream(streamUrl, protocol) {
        const liveIndicators = ['live', 'stream', 'channel', 'broadcast', 'rtmp://', 'rtsp://'];
        const urlLower = streamUrl.toLowerCase();

        if (protocol === 'rtmp' || protocol === 'rtsp' || protocol === 'srt') {
            return true;
        }

        return liveIndicators.some(indicator => urlLower.includes(indicator));
    }
}

module.exports = { StreamAccessibilityChecker, STREAM_PROTOCOLS };