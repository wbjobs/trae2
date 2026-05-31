package com.iot.gateway.codec.frame;

import io.netty.buffer.ByteBuf;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ModbusLengthFieldBasedFrameDecoder extends LengthFieldBasedFrameDecoder {

    private static final int MAX_FRAME_LENGTH = 260;
    private static final int LENGTH_FIELD_OFFSET = 4;
    private static final int LENGTH_FIELD_LENGTH = 2;
    private static final int LENGTH_ADJUSTMENT = 0;
    private static final int INITIAL_BYTES_TO_STRIP = 0;

    public ModbusLengthFieldBasedFrameDecoder() {
        super(MAX_FRAME_LENGTH, LENGTH_FIELD_OFFSET, LENGTH_FIELD_LENGTH,
                LENGTH_ADJUSTMENT, INITIAL_BYTES_TO_STRIP);
    }

    @Override
    protected Object decode(io.netty.channel.ChannelHandlerContext ctx, ByteBuf in) throws Exception {
        int originalReaderIndex = in.readerIndex();

        try {
            if (in.readableBytes() < 7) {
                return null;
            }

            int protocolId = in.getUnsignedShort(in.readerIndex() + 2);
            if (protocolId != 0) {
                log.warn("Modbus帧解码器: 协议标识不匹配, protocolId={}, remoteAddress={}",
                        protocolId, ctx.channel().remoteAddress());
                in.skipBytes(1);
                return decode(ctx, in);
            }

            int length = in.getUnsignedShort(in.readerIndex() + LENGTH_FIELD_OFFSET);
            int totalFrameLength = 6 + length;

            if (length <= 0 || length > 255) {
                log.warn("Modbus帧解码器: 长度字段非法, length={}, remoteAddress={}",
                        length, ctx.channel().remoteAddress());
                in.skipBytes(1);
                return decode(ctx, in);
            }

            if (in.readableBytes() < totalFrameLength) {
                in.readerIndex(originalReaderIndex);
                return null;
            }

            ByteBuf frame = in.readSlice(totalFrameLength).retain();
            if (log.isDebugEnabled()) {
                log.debug("Modbus帧解码器: 成功解码帧, length={}, remoteAddress={}",
                        totalFrameLength, ctx.channel().remoteAddress());
            }
            return frame;

        } catch (Exception e) {
            log.error("Modbus帧解码器: 解码异常, remoteAddress={}", ctx.channel().remoteAddress(), e);
            in.skipBytes(in.readableBytes());
            return null;
        }
    }
}
