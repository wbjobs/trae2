const EventEmitter = require('events');
const logger = require('./logger');
const config = require('./config');
const { UrlValidator, VALID_PROTOCOLS } = require('./url_validator');
const { StreamMetadataValidator } = require('./stream_metadata_validator');
const { StreamAccessibilityChecker } = require('./stream_accessibility_checker');
const { StreamValidationCache } = require('./stream_validation_cache');

class StreamValidator extends EventEmitter {
    constructor() {
        super();
        this.urlValidator = new UrlValidator();
        this.metadataValidator = new StreamMetadataValidator({
            maxBitrate: config.stream.maxBitrate,
            minBitrate: config.stream.minBitrate
        });
        this.accessibilityChecker = new StreamAccessibilityChecker(config.stream.checkTimeout);
        this.cache = new StreamValidationCache(300000);
        this.validationTimeout = config.stream.checkTimeout;
    }

    async validateStream(streamUrl, options = {}) {
        logger.info(`开始码流校验: ${streamUrl}`);

        const cachedResult = this.cache.getCachedValidation(streamUrl);
        if (cachedResult) {
            logger.info(`使用缓存的校验结果: ${streamUrl}`);
            return cachedResult;
        }

        const validationResult = await this.performValidation(streamUrl, options);

        if (validationResult.valid) {
            this.cache.cacheValidationResult(streamUrl, validationResult);
        }

        this.emit('validationComplete', streamUrl, validationResult);

        return validationResult;
    }

    async performValidation(streamUrl, options) {
        const timeout = options.checkTimeout || this.validationTimeout;

        const checks = [
            this.urlValidator.validateUrlFormat(streamUrl),
            this.urlValidator.validateProtocol(streamUrl),
            this.accessibilityChecker.validateStreamAccessibility(streamUrl, timeout)
        ];

        const results = await Promise.allSettled(checks);

        const formatCheck = results[0];
        const protocolCheck = results[1];
        const accessibilityCheck = results[2];

        if (formatCheck.status === 'rejected' || !formatCheck.value.valid) {
            return {
                valid: false,
                error: formatCheck.status === 'rejected' ? formatCheck.reason.message : formatCheck.value.error,
                errorCode: 'INVALID_URL_FORMAT',
                streamUrl
            };
        }

        if (protocolCheck.status === 'rejected' || !protocolCheck.value.valid) {
            return {
                valid: false,
                error: protocolCheck.status === 'rejected' ? protocolCheck.reason.message : protocolCheck.value.error,
                errorCode: 'UNSUPPORTED_PROTOCOL',
                streamUrl
            };
        }

        if (accessibilityCheck.status === 'rejected' || !accessibilityCheck.value.valid) {
            return {
                valid: false,
                error: accessibilityCheck.status === 'rejected'
                    ? `码流不可访问: ${accessibilityCheck.reason.message}`
                    : accessibilityCheck.value.error,
                errorCode: 'STREAM_INACCESSIBLE',
                streamUrl
            };
        }

        const streamInfo = accessibilityCheck.value.streamInfo || {};

        const bitrateValidation = this.metadataValidator.validateBitrate(streamInfo);
        if (!bitrateValidation.valid) {
            return {
                valid: false,
                error: bitrateValidation.error,
                errorCode: 'INVALID_BITRATE',
                streamUrl
            };
        }

        const codecValidation = this.metadataValidator.validateCodecs(streamInfo);
        if (!codecValidation.valid) {
            return {
                valid: false,
                error: codecValidation.error,
                errorCode: 'UNSUPPORTED_CODEC',
                streamUrl
            };
        }

        const resolutionValidation = this.metadataValidator.validateResolution(streamInfo);
        if (!resolutionValidation.valid) {
            return {
                valid: false,
                error: resolutionValidation.error,
                errorCode: 'INVALID_RESOLUTION',
                streamUrl
            };
        }

        logger.info(`码流校验通过: ${streamUrl}`);

        return {
            valid: true,
            streamUrl,
            streamInfo,
            timestamp: Date.now()
        };
    }

    async validateStreamMetadata(streamUrl, metadata) {
        return this.metadataValidator.validateStreamMetadata(streamUrl, metadata);
    }

    clearValidationCache(streamUrl = null) {
        this.cache.clearValidationCache(streamUrl);
        if (streamUrl) {
            logger.info(`已清除码流校验缓存: ${streamUrl}`);
        } else {
            logger.info('已清除所有码流校验缓存');
        }
    }

    getCacheStats() {
        return this.cache.getCacheStats();
    }

    getSupportedProtocols() {
        return [...VALID_PROTOCOLS];
    }
}

module.exports = new StreamValidator();