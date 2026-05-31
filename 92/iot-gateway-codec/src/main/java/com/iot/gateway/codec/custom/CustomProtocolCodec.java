package com.iot.gateway.codec.custom;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONException;
import com.alibaba.fastjson2.JSONObject;
import com.iot.gateway.codec.MessageCodec;
import com.iot.gateway.common.enums.MessageType;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.UnifiedMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.BufferUnderflowException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
public class CustomProtocolCodec implements MessageCodec {

    private static final byte[] MAGIC = new byte[]{0x5A, 0x5A};
    private static final int MAGIC_LENGTH = 2;
    private static final int LENGTH_FIELD_LENGTH = 4;
    private static final int HEADER_LENGTH = MAGIC_LENGTH + LENGTH_FIELD_LENGTH;
    private static final int MAX_BODY_LENGTH = 1024 * 1024;
    private static final int CRC_LENGTH = 4;

    @Override
    public ProtocolType getProtocolType() {
        return ProtocolType.CUSTOM;
    }

    @Override
    public byte[] encode(UnifiedMessage message) {
        if (message == null) {
            log.warn("自定义协议编码: 消息为空");
            return new byte[0];
        }

        if (message.getDeviceId() == null || message.getDeviceId().trim().isEmpty()) {
            log.warn("自定义协议编码: deviceId为空");
            return new byte[0];
        }

        if (message.getMessageType() == null) {
            log.warn("自定义协议编码: messageType为空");
            return new byte[0];
        }

        try {
            JSONObject json = new JSONObject();
            json.put("deviceId", message.getDeviceId());
            json.put("messageType", message.getMessageType().getCode());
            json.put("timestamp", message.getTimestamp() != null ? message.getTimestamp() : System.currentTimeMillis());
            json.put("payload", message.getPayload() != null ? message.getPayload() : new JSONObject());
            json.put("qos", message.getQos() != null ? message.getQos() : 0);
            json.put("needAck", message.getNeedAck() != null ? message.getNeedAck() : false);
            if (message.getMessageId() != null) {
                json.put("messageId", message.getMessageId());
            }

            byte[] body = json.toJSONString().getBytes(StandardCharsets.UTF_8);

            if (body.length > MAX_BODY_LENGTH) {
                log.error("自定义协议编码: body长度超过最大值 {} > {}", body.length, MAX_BODY_LENGTH);
                return new byte[0];
            }

            int crc32 = calculateCRC32(body);
            ByteBuffer buffer = ByteBuffer.allocate(HEADER_LENGTH + body.length + CRC_LENGTH);

            buffer.put(MAGIC);
            buffer.putInt(body.length);
            buffer.put(body);
            buffer.putInt(crc32);

            byte[] result = buffer.array();

            if (log.isDebugEnabled()) {
                log.debug("自定义协议编码成功: deviceId={}, messageType={}, bodyLen={}, totalLen={}",
                        message.getDeviceId(), message.getMessageType(), body.length, result.length);
            }

            return result;
        } catch (JSONException e) {
            log.error("自定义协议编码: JSON序列化失败", e);
            return new byte[0];
        } catch (Exception e) {
            log.error("自定义协议编码失败", e);
            return new byte[0];
        }
    }

    @Override
    public UnifiedMessage decode(byte[] data) {
        if (data == null) {
            log.warn("自定义协议解码: 数据为空");
            return null;
        }

        if (data.length < HEADER_LENGTH + CRC_LENGTH) {
            log.warn("自定义协议解码: 数据长度不足, 实际长度={}, 最小需要={}",
                    data.length, HEADER_LENGTH + CRC_LENGTH);
            return null;
        }

        try {
            ByteBuffer buffer = ByteBuffer.wrap(data);

            byte[] magic = new byte[MAGIC_LENGTH];
            buffer.get(magic);

            if (magic[0] != MAGIC[0] || magic[1] != MAGIC[1]) {
                log.warn("自定义协议解码: 魔数不匹配, expected=[{}, {}], actual=[{}, {}]",
                        MAGIC[0], MAGIC[1], magic[0], magic[1]);
                return null;
            }

            int bodyLen = buffer.getInt();

            if (bodyLen <= 0) {
                log.warn("自定义协议解码: body长度非法, bodyLen={}", bodyLen);
                return null;
            }

            if (bodyLen > MAX_BODY_LENGTH) {
                log.warn("自定义协议解码: body长度超过最大值 {} > {}", bodyLen, MAX_BODY_LENGTH);
                return null;
            }

            int expectedTotalLen = HEADER_LENGTH + bodyLen + CRC_LENGTH;
            if (data.length < expectedTotalLen) {
                log.warn("自定义协议解码: 数据不完整, 需要{}字节, 实际{}字节, 可能存在粘包",
                        expectedTotalLen, data.length);
                return null;
            }

            int remaining = buffer.remaining();
            if (remaining < bodyLen + CRC_LENGTH) {
                log.warn("自定义协议解码: 缓冲区数据不足, 需要{}字节, 实际{}字节",
                        bodyLen + CRC_LENGTH, remaining);
                return null;
            }

            byte[] body = new byte[bodyLen];
            buffer.get(body);

            int receivedCrc = buffer.getInt();
            int calculatedCrc = calculateCRC32(body);

            if (receivedCrc != calculatedCrc) {
                log.warn("自定义协议解码: CRC校验失败, received={}, calculated={}",
                        receivedCrc, calculatedCrc);
                return null;
            }

            JSONObject json;
            try {
                json = JSON.parseObject(body);
            } catch (JSONException e) {
                log.error("自定义协议解码: JSON解析失败, bodyLen={}", bodyLen, e);
                return null;
            }

            String deviceId = json.getString("deviceId");
            if (deviceId == null || deviceId.trim().isEmpty()) {
                log.warn("自定义协议解码: deviceId为空");
                return null;
            }

            int msgTypeCode = json.getIntValue("messageType");
            MessageType messageType = MessageType.getByCode(msgTypeCode);
            if (messageType == null) {
                log.warn("自定义协议解码: 不支持的消息类型, code={}", msgTypeCode);
                return null;
            }

            Map<String, Object> payload = json.getJSONObject("payload");
            if (payload == null) {
                payload = new JSONObject();
            }

            UnifiedMessage.Builder builder = UnifiedMessage.builder()
                    .messageId(json.getString("messageId") != null ?
                            json.getString("messageId") :
                            UUID.randomUUID().toString().replace("-", ""))
                    .deviceId(deviceId)
                    .protocolType(ProtocolType.CUSTOM)
                    .messageType(messageType)
                    .payload(payload);

            UnifiedMessage message = builder.build();
            message.setTimestamp(json.getLong("timestamp"));
            message.setQos(json.getInteger("qos"));
            message.setNeedAck(json.getBooleanValue("needAck"));

            if (log.isDebugEnabled()) {
                log.debug("自定义协议解码成功: deviceId={}, messageType={}, bodyLen={}",
                        deviceId, messageType, bodyLen);
            }

            return message;

        } catch (BufferUnderflowException e) {
            log.error("自定义协议解码: 缓冲区下溢, 数据可能被截断, dataLength={}", data.length, e);
            return null;
        } catch (IndexOutOfBoundsException e) {
            log.error("自定义协议解码: 索引越界, 数据格式错误, dataLength={}", data.length, e);
            return null;
        } catch (Exception e) {
            log.error("自定义协议解码失败, dataLength={}", data.length, e);
            return null;
        }
    }

    private int calculateCRC32(byte[] data) {
        int crc = 0xFFFFFFFF;
        for (byte b : data) {
            crc ^= (b & 0xFF);
            for (int i = 0; i < 8; i++) {
                if ((crc & 1) != 0) {
                    crc = (crc >>> 1) ^ 0xEDB88320;
                } else {
                    crc = crc >>> 1;
                }
            }
        }
        return ~crc;
    }
}
