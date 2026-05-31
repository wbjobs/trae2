const VIDEO_CODECS = ['h264', 'h265', 'av1', 'mpeg2', 'mpeg4', 'vp9', 'vp8'];
const AUDIO_CODECS = ['aac', 'mp3', 'ac3', 'opus', 'vorbis', 'pcm'];
const CONTAINER_FORMATS = ['ts', 'flv', 'mp4', 'mkv', 'mov', 'webm', 'm3u8'];

class StreamMetadataValidator {
    constructor(config) {
        this.maxBitrate = config.maxBitrate || 50000;
        this.minBitrate = config.minBitrate || 100;
    }

    validateBitrate(streamInfo) {
        if (!streamInfo.videoBitrate && !streamInfo.audioBitrate) {
            return { valid: true };
        }

        if (streamInfo.videoBitrate !== undefined) {
            if (streamInfo.videoBitrate < this.minBitrate) {
                return {
                    valid: false,
                    error: `视频码率过低: ${streamInfo.videoBitrate}kbps，最低要求: ${this.minBitrate}kbps`
                };
            }
            if (streamInfo.videoBitrate > this.maxBitrate) {
                return {
                    valid: false,
                    error: `视频码率过高: ${streamInfo.videoBitrate}kbps，最高限制: ${this.maxBitrate}kbps`
                };
            }
        }

        if (streamInfo.audioBitrate !== undefined) {
            if (streamInfo.audioBitrate < 16) {
                return {
                    valid: false,
                    error: `音频码率过低: ${streamInfo.audioBitrate}kbps，最低要求: 16kbps`
                };
            }
            if (streamInfo.audioBitrate > 1024) {
                return {
                    valid: false,
                    error: `音频码率过高: ${streamInfo.audioBitrate}kbps，最高限制: 1024kbps`
                };
            }
        }

        return { valid: true };
    }

    validateCodecs(streamInfo) {
        if (!streamInfo.videoCodec && !streamInfo.audioCodec) {
            return { valid: true };
        }

        if (streamInfo.videoCodec) {
            const videoCodec = streamInfo.videoCodec.toLowerCase();
            if (!VIDEO_CODECS.includes(videoCodec)) {
                return {
                    valid: false,
                    error: `不支持的视频编码: ${streamInfo.videoCodec}，支持: ${VIDEO_CODECS.join(', ')}`
                };
            }
        }

        if (streamInfo.audioCodec) {
            const audioCodec = streamInfo.audioCodec.toLowerCase();
            if (!AUDIO_CODECS.includes(audioCodec)) {
                return {
                    valid: false,
                    error: `不支持的音频编码: ${streamInfo.audioCodec}，支持: ${AUDIO_CODECS.join(', ')}`
                };
            }
        }

        return { valid: true };
    }

    validateResolution(streamInfo) {
        if (!streamInfo.resolution) {
            return { valid: true };
        }

        const { width, height } = streamInfo.resolution;

        if (!width || !height) {
            return { valid: false, error: '分辨率信息不完整' };
        }

        if (width < 16 || width > 7680) {
            return {
                valid: false,
                error: `视频宽度超出范围: ${width}，有效范围: 16-7680`
            };
        }

        if (height < 16 || height > 4320) {
            return {
                valid: false,
                error: `视频高度超出范围: ${height}，有效范围: 16-4320`
            };
        }

        const maxPixels = 7680 * 4320;
        if (width * height > maxPixels) {
            return {
                valid: false,
                error: `分辨率过高，总像素数超过限制: ${width * height}，最大: ${maxPixels}`
            };
        }

        return { valid: true };
    }

    validateStreamMetadata(streamUrl, metadata) {
        const result = {
            valid: true,
            warnings: [],
            errors: []
        };

        if (metadata.frameRate !== undefined) {
            if (metadata.frameRate < 1 || metadata.frameRate > 120) {
                result.errors.push(`帧率超出范围: ${metadata.frameRate}，有效范围: 1-120`);
                result.valid = false;
            }
        }

        if (metadata.sampleRate !== undefined) {
            const validSampleRates = [8000, 16000, 22050, 32000, 44100, 48000, 96000];
            if (!validSampleRates.includes(metadata.sampleRate)) {
                result.warnings.push(`非标准采样率: ${metadata.sampleRate}，建议使用: ${validSampleRates.join(', ')}`);
            }
        }

        if (metadata.channels !== undefined) {
            if (metadata.channels < 1 || metadata.channels > 8) {
                result.errors.push(`声道数超出范围: ${metadata.channels}，有效范围: 1-8`);
                result.valid = false;
            }
        }

        return result;
    }
}

module.exports = { StreamMetadataValidator, VIDEO_CODECS, AUDIO_CODECS, CONTAINER_FORMATS };