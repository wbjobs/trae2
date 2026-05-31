package com.iot.gateway.codec.modbus;

import com.iot.gateway.codec.MessageCodec;
import com.iot.gateway.common.enums.MessageType;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.UnifiedMessage;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
public class ModbusTcpCodec implements MessageCodec {

    private static final int MBAP_HEADER_LENGTH = 7;
    private static final int MAX_MESSAGE_LENGTH = 260;
    private static final int MIN_PDU_LENGTH = 1;
    private static final int MAX_PDU_LENGTH = 253;

    @Override
    public ProtocolType getProtocolType() {
        return ProtocolType.MODBUS_TCP;
    }

    @Override
    public byte[] encode(UnifiedMessage message) {
        if (message == null || message.getPayload() == null) {
            log.warn("Modbus TCP编码: 消息或payload为空");
            return new byte[0];
        }

        ByteBuf buffer = Unpooled.buffer(MBAP_HEADER_LENGTH + MAX_PDU_LENGTH);
        try {
            Map<String, Object> payload = message.getPayload();

            int transactionId = getIntValue(payload, "transactionId", 0, 0, 0xFFFF);
            int protocolId = 0;
            int unitId = getIntValue(payload, "unitId", 1, 0, 255);
            int functionCode = getIntValue(payload, "functionCode", 3, 1, 127);

            byte[] data = getByteArrayValue(payload, "data");
            if (data.length > MAX_PDU_LENGTH) {
                log.error("Modbus TCP编码: PDU数据长度超过最大值 {} > {}", data.length, MAX_PDU_LENGTH);
                return new byte[0];
            }

            buffer.writeShort(transactionId);
            buffer.writeShort(protocolId);
            buffer.writeShort(data.length + 2);
            buffer.writeByte(unitId);
            buffer.writeByte(functionCode);
            if (data.length > 0) {
                buffer.writeBytes(data);
            }

            byte[] result = new byte[buffer.readableBytes()];
            buffer.readBytes(result);

            if (log.isDebugEnabled()) {
                log.debug("Modbus TCP编码成功: transactionId={}, unitId={}, functionCode={}, length={}",
                        transactionId, unitId, functionCode, result.length);
            }
            return result;
        } catch (ClassCastException e) {
            log.error("Modbus TCP编码: 类型转换错误, payload字段类型不正确", e);
            return new byte[0];
        } catch (Exception e) {
            log.error("Modbus TCP编码失败", e);
            return new byte[0];
        } finally {
            buffer.release();
        }
    }

    @Override
    public UnifiedMessage decode(byte[] data) {
        if (data == null) {
            log.warn("Modbus TCP解码: 数据为空");
            return null;
        }

        if (data.length < MBAP_HEADER_LENGTH) {
            log.warn("Modbus TCP解码: 数据长度不足, 实际长度={}, 最小需要={}", data.length, MBAP_HEADER_LENGTH);
            return null;
        }

        if (data.length > MAX_MESSAGE_LENGTH) {
            log.warn("Modbus TCP解码: 数据长度超过最大值, 实际长度={}, 最大允许={}", data.length, MAX_MESSAGE_LENGTH);
            return null;
        }

        ByteBuf buffer = Unpooled.wrappedBuffer(data);
        try {
            int transactionId = buffer.readUnsignedShort();
            int protocolId = buffer.readUnsignedShort();
            int length = buffer.readUnsignedShort();

            if (protocolId != 0) {
                log.warn("Modbus TCP解码: 协议标识不正确, 应为0, 实际={}", protocolId);
                return null;
            }

            int pduLength = length - 2;
            if (pduLength < MIN_PDU_LENGTH || pduLength > MAX_PDU_LENGTH) {
                log.warn("Modbus TCP解码: PDU长度非法, length={}, pduLength={}", length, pduLength);
                return null;
            }

            int remainingBytes = buffer.readableBytes();
            if (remainingBytes < pduLength) {
                log.warn("Modbus TCP解码: 数据不完整, 需要{}字节, 实际{}字节", pduLength, remainingBytes);
                return null;
            }

            int unitId = buffer.readUnsignedByte();
            int functionCode = buffer.readUnsignedByte();

            byte[] pdu = new byte[pduLength - 1];
            if (pdu.length > 0) {
                buffer.readBytes(pdu);
            }

            Map<String, Object> payload = new HashMap<>();
            payload.put("transactionId", transactionId);
            payload.put("protocolId", protocolId);
            payload.put("unitId", unitId);
            payload.put("functionCode", functionCode);
            payload.put("data", pdu);

            if (log.isDebugEnabled()) {
                log.debug("Modbus TCP解码成功: transactionId={}, unitId={}, functionCode={}, pduLength={}",
                        transactionId, unitId, functionCode, pdu.length);
            }

            return UnifiedMessage.builder()
                    .messageId(UUID.randomUUID().toString().replace("-", ""))
                    .protocolType(ProtocolType.MODBUS_TCP)
                    .messageType(MessageType.DATA_REPORT)
                    .payload(payload)
                    .build();

        } catch (IndexOutOfBoundsException e) {
            log.error("Modbus TCP解码: 数据越界, 数据可能被截断或损坏", e);
            return null;
        } catch (Exception e) {
            log.error("Modbus TCP解码失败, dataLength={}", data.length, e);
            return null;
        } finally {
            buffer.release();
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
                log.warn("Modbus TCP编码: {}字段类型不正确, 使用默认值{}", key, defaultValue);
                return defaultValue;
            }
            if (value < minValue || value > maxValue) {
                log.warn("Modbus TCP编码: {}字段值{}超出范围[{},{}], 使用默认值{}",
                        key, value, minValue, maxValue, defaultValue);
                return defaultValue;
            }
            return value;
        } catch (NumberFormatException e) {
            log.warn("Modbus TCP编码: {}字段格式错误, 使用默认值{}", key, defaultValue);
            return defaultValue;
        }
    }

    private byte[] getByteArrayValue(Map<String, Object> payload, String key) {
        Object obj = payload.get(key);
        if (obj == null) {
            return new byte[0];
        }
        if (obj instanceof byte[]) {
            return (byte[]) obj;
        }
        if (obj instanceof String) {
            try {
                return hexStringToByteArray((String) obj);
            } catch (Exception e) {
                log.warn("Modbus TCP编码: {}字段十六进制字符串解析失败", key);
                return new byte[0];
            }
        }
        log.warn("Modbus TCP编码: {}字段类型不正确, 应为byte[]或十六进制字符串", key);
        return new byte[0];
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
