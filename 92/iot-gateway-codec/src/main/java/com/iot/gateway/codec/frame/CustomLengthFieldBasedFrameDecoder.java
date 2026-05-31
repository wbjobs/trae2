package com.iot.gateway.codec.frame;

import io.netty.buffer.ByteBuf;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class CustomLengthFieldBasedFrameDecoder extends LengthFieldBasedFrameDecoder {

    private static final byte[] MAGIC = new byte[]{0x5A, 0x5A};
    private static final int MAX_FRAME_LENGTH = 1024 * 1024 + 10;
    private static final int LENGTH_FIELD_OFFSET = 2;
    private static final int LENGTH_FIELD_LENGTH = 4;
    private static final int LENGTH_ADJUSTMENT = 4;
    private static final int INITIAL_BYTES_TO_STRIP = 0;

    public CustomLengthFieldBasedFrameDecoder() {
        super(MAX_FRAME_LENGTH, LENGTH_FIELD_OFFSET, LENGTH_FIELD_LENGTH,
                LENGTH_ADJUSTMENT, INITIAL_BYTES_TO_STRIP);
    }

    @Override
    protected Object decode(io.netty.channel.ChannelHandlerContext ctx, ByteBuf in) throws Exception {
        int originalReaderIndex = in.readerIndex();

        try {
            if (in.readableBytes() < 6) {
                return null;
            }

            byte magic1 = in.getByte(in.readerIndex());
            byte magic2 = in.getByte(in.readerIndex() + 1);

            if (magic1 != MAGIC[0] || magic2 != MAGIC[1]) {
                log.warn("帧解码器: 魔数不匹配, 跳过非法字节, remoteAddress={}", ctx.channel().remoteAddress());
                in.skipBytes(1);
                return decode(ctx, in);
            }

            int frameLength = in.getInt(in.readerIndex() + LENGTH_FIELD_OFFSET);
            int totalFrameLength = 6 + frameLength + 4;

            if (frameLength <= 0 || frameLength > MAX_FRAME_LENGTH) {
                log.warn("帧解码器: 帧长度非法, frameLength={}, remoteAddress={}",
                        frameLength, ctx.channel().remoteAddress());
                in.skipBytes(1);
                return decode(ctx, in);
            }

            if (in.readableBytes() < totalFrameLength) {
                in.readerIndex(originalReaderIndex);
                return null;
            }

            ByteBuf frame = in.readSlice(totalFrameLength).retain();
            if (log.isDebugEnabled()) {
                log.debug("帧解码器: 成功解码帧, length={}, remoteAddress={}",
                        totalFrameLength, ctx.channel().remoteAddress());
            }
            return frame;

        } catch (Exception e) {
            log.error("帧解码器: 解码异常, remoteAddress={}", ctx.channel().remoteAddress(), e);
            in.skipBytes(in.readableBytes());
            return null;
        }
    }
}
