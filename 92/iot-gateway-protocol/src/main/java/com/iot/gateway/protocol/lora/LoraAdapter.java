package com.iot.gateway.protocol.lora;

import com.iot.gateway.codec.MessageCodecFactory;
import com.iot.gateway.common.enums.DeviceStatus;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.DeviceSession;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.protocol.ProtocolAdapter;
import io.netty.bootstrap.Bootstrap;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.DatagramChannel;
import io.netty.channel.socket.nio.NioDatagramChannel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class LoraAdapter implements ProtocolAdapter {

    @Value("${iot.protocol.lora.port:8080}")
    private int port;

    @Autowired
    private MessageCodecFactory codecFactory;

    private EventLoopGroup group;
    private Channel serverChannel;
    private volatile boolean running = false;

    private final Map<String, InetSocketAddress> deviceAddresses = new ConcurrentHashMap<>();

    @PostConstruct
    @Override
    public void start() {
        if (running) {
            return;
        }

        group = new NioEventLoopGroup();

        try {
            Bootstrap bootstrap = new Bootstrap();
            bootstrap.group(group)
                    .channel(NioDatagramChannel.class)
                    .option(ChannelOption.SO_BROADCAST, true)
                    .option(ChannelOption.SO_REUSEADDR, true)
                    .handler(new ChannelInitializer<DatagramChannel>() {
                        @Override
                        protected void initChannel(DatagramChannel ch) {
                            ch.pipeline().addLast(new LoraHandler());
                        }
                    });

            ChannelFuture future = bootstrap.bind(port).sync();
            serverChannel = future.channel();
            running = true;
            log.info("LoRa协议适配器启动成功, 端口: {}", port);

        } catch (Exception e) {
            log.error("LoRa协议适配器启动失败", e);
            stop();
        }
    }

    @PreDestroy
    @Override
    public void stop() {
        running = false;
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (group != null) {
            group.shutdownGracefully();
        }
        deviceAddresses.clear();
        log.info("LoRa协议适配器已停止");
    }

    @Override
    public boolean sendMessage(UnifiedMessage message) {
        if (!running) {
            return false;
        }

        InetSocketAddress address = deviceAddresses.get(message.getDeviceId());
        if (address == null) {
            return false;
        }

        try {
            byte[] data = codecFactory.encode(ProtocolType.LORA, message);
            serverChannel.writeAndFlush(
                    new io.netty.channel.socket.DatagramPacket(
                            io.netty.buffer.Unpooled.wrappedBuffer(data),
                            address
                    )
            );
            return true;
        } catch (Exception e) {
            log.error("LoRa发送消息失败", e);
            return false;
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public ProtocolType getProtocolType() {
        return ProtocolType.LORA;
    }

    private class LoraHandler extends SimpleChannelInboundHandler<io.netty.channel.socket.DatagramPacket> {

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, io.netty.channel.socket.DatagramPacket packet) {
            byte[] data = new byte[packet.content().readableBytes()];
            packet.content().readBytes(data);

            UnifiedMessage message = codecFactory.decode(ProtocolType.LORA, data);
            if (message != null) {
                deviceAddresses.put(message.getDeviceId(), packet.sender());

                DeviceSession session = new DeviceSession();
                session.setDeviceId(message.getDeviceId());
                session.setProtocolType(ProtocolType.LORA);
                session.setStatus(DeviceStatus.ONLINE);
                session.setSessionId(UUID.randomUUID().toString());
                session.setClientIp(packet.sender().getHostString());
                session.setClientPort(packet.sender().getPort());
                session.setOnlineTime(System.currentTimeMillis());
                session.setLastHeartbeat(System.currentTimeMillis());

                log.info("LoRa设备数据上报: {}", message.getDeviceId());
            }
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            log.error("LoRa处理异常", cause);
        }
    }
}
