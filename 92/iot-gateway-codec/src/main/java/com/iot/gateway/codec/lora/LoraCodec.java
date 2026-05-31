package com.iot.gateway.codec.lora;

import com.iot.gateway.codec.MessageCodec;
import com.iot.gateway.common.enums.MessageType;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.UnifiedMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.BufferUnderflowException;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
public class LoraCodec implements MessageCodec {

    private static final int HEADER_LENGTH = 8;
    private static final int DEVICE_ADDR_LENGTH = 4;
    private static final int MAX_PAYLOAD_LENGTH = 242;
    private static final int MAX_MESSAGE_LENGTH = HEADER_LENGTH + MAX_PAYLOAD_LENGTH;

    @Override
    public ProtocolType getProtocolType() {
        return ProtocolType.LORA;
    }

    @Override
    public byte[] encode(UnifiedMessage message) {
        if (message == null || message.getPayload() == null) {
            log.warn("LoRa编码: 消息或payload为空");
            return new byte[0];
        }

        try {
            Map<String, Object> payload = message.getPayload();

            byte[] deviceAddr = getByteArrayValue(payload, "deviceAddr", DEVICE_ADDR_LENGTH);
            int fCnt = getIntValue(payload, "fCnt", 0, 0, 0xFFFF);
            int fPort = getIntValue(payload, "fPort", 1, 1, 223);
            byte[] data = getByteArrayValue(payload, "data", 0);

            if (data.length > MAX_PAYLOAD_LENGTH) {
                log.error("LoRa编码: payload长度超过最大值 {} > {}", data.length, MAX_PAYLOAD_LENGTH);
                return new byte[0];
            }

            ByteBuffer buffer = ByteBuffer.allocate(HEADER_LENGTH + data.length);
            buffer.put(deviceAddr);
            buffer.putShort((short) fCnt);
            buffer.put((byte) fPort);
            buffer.put((byte) data.length);
            if (data.length > 0) {
                buffer.put(data);
            }

            if (log.isDebugEnabled()) {
                log.debug("LoRa编码成功: deviceAddr={}, fCnt={}, fPort={}, payloadLen={}",
                        bytesToHex(deviceAddr), fCnt, fPort, data.length);
            }

            return buffer.array();
        } catch (ClassCastException e) {
            log.error("LoRa编码: 类型转换错误, payload字段类型不正确", e);
            return new byte[0];
        } catch (Exception e) {
            log.error("LoRa编码失败", e);
            return new byte[0];
        }
    }

    @Override
    public UnifiedMessage decode(byte[] data) {
        if (data == null) {
            log.warn("LoRa解码: 数据为空");
            return null;
        }

        if (data.length < HEADER_LENGTH) {
            log.warn("LoRa解码: 数据长度不足, 实际长度={}, 最小需要={}", data.length, HEADER_LENGTH);
            return null;
        }

        if (data.length > MAX_MESSAGE_LENGTH) {
            log.warn("LoRa解码: 数据长度超过最大值, 实际长度={}, 最大允许={}", data.length, MAX_MESSAGE_LENGTH);
            return null;
        }

        try {
            ByteBuffer buffer = ByteBuffer.wrap(data);

            byte[] deviceAddr = new byte[DEVICE_ADDR_LENGTH];
            buffer.get(deviceAddr);
            int fCnt = buffer.getShort() & 0xFFFF;
            int fPort = buffer.get() & 0xFF;
            int payloadLen = buffer.get() & 0xFF;

            if (payloadLen < 0 || payloadLen > MAX_PAYLOAD_LENGTH) {
                log.warn("LoRa解码: payload长度非法, payloadLen={}, deviceAddr={}",
                        payloadLen, bytesToHex(deviceAddr));
                return null;
            }

            int remaining = buffer.remaining();
            if (remaining < payloadLen) {
                log.warn("LoRa解码: 数据不完整, 需要{}字节, 实际{}字节, deviceAddr={}",
                        payloadLen, remaining, bytesToHex(deviceAddr));
                return null;
            }

            byte[] payload = new byte[payloadLen];
            if (payloadLen > 0) {
                buffer.get(payload);
            }

            String deviceId = bytesToHex(deviceAddr);
            Map<String, Object> payloadMap = new HashMap<>();
            payloadMap.put("deviceAddr", deviceAddr);
            payloadMap.put("fCnt", fCnt);
            payloadMap.put("fPort", fPort);
            payloadMap.put("data", payload);
            payloadMap.put("deviceId", deviceId);

            if (log.isDebugEnabled()) {
                log.debug("LoRa解码成功: deviceId={}, fCnt={}, fPort={}, payloadLen={}",
                        deviceId, fCnt, fPort, payloadLen);
            }

            return UnifiedMessage.builder()
                    .messageId(UUID.randomUUID().toString().replace("-", ""))
                    .deviceId(deviceId)
                    .protocolType(ProtocolType.LORA)
                    .messageType(MessageType.DATA_REPORT)
                    .payload(payloadMap)
                    .build();

        } catch (BufferUnderflowException e) {
            log.error("LoRa解码: 缓冲区下溢, 数据可能被截断, dataLength={}", data.length, e);
            return null;
        } catch (IndexOutOfBoundsException e) {
            log.error("LoRa解码: 索引越界, 数据格式错误, dataLength={}", data.length, e);
            return null;
        } catch (Exception e) {
            log.error("LoRa解码失败, dataLength={}", data.length, e);
            return null;
        }
    }

    private int getIntValue(Map<String, Object> payload, String key, int defaultValue, int minValue, int maxValue) {
        Object obj = payload.get(key);
        if (obj == null) {
            return defaultValue;
        }
        try {
            int value;
            if (obj instanceof Number) {
                value = ((Number) obj).intValue();
            } else if (obj instanceof String) {
                value = Integer.parseInt((String) obj);
            } else {
                log.warn("LoRa编码: {}字段类型不正确, 使用默认值{}", key, defaultValue);
                return defaultValue;
            }
            if (value < minValue || value > maxValue) {
                log.warn("LoRa编码: {}字段值{}超出范围[{},{}], 使用默认值{}",
                        key, value, minValue, maxValue, defaultValue);
                return defaultValue;
            }
            return value;
        } catch (NumberFormatException e) {
            log.warn("LoRa编码: {}字段格式错误, 使用默认值{}", key, defaultValue);
            return defaultValue;
        }
    }

    private byte[] getByteArrayValue(Map<String, Object> payload, String key, int expectedLength) {
        Object obj = payload.get(key);
        if (obj == null) {
            return new byte[expectedLength];
        }
        if (obj instanceof byte[]) {
            byte[] bytes = (byte[]) obj;
            if (expectedLength > 0 && bytes.length != expectedLength) {
                byte[] result = new byte[expectedLength];
                System.arraycopy(bytes, 0, result, 0, Math.min(bytes.length, expectedLength));
                log.warn("LoRa编码: {}字段长度{}不符合预期{}, 已自动调整", key, bytes.length, expectedLength);
                return result;
            }
            return bytes;
        }
        if (obj instanceof String) {
            try {
                byte[] bytes = hexStringToByteArray((String) obj);
                if (expectedLength > 0 && bytes.length != expectedLength) {
                    byte[] result = new byte[expectedLength];
                    System.arraycopy(bytes, 0, result, 0, Math.min(bytes.length, expectedLength));
                    return result;
                }
                return bytes;
            } catch (Exception e) {
                log.warn("LoRa编码: {}字段十六进制字符串解析失败", key);
                return new byte[expectedLength];
            }
        }
        log.warn("LoRa编码: {}字段类型不正确, 应为byte[]或十六进制字符串", key);
        return new byte[expectedLength];
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X", b));
        }
        return sb.toString();
    }

    private byte[] hexStringToByteArray(String s) {
        int len = s.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4)
                    + Character.digit(s.charAt(i + 1), 16));
        }
        return data;
    }
}
