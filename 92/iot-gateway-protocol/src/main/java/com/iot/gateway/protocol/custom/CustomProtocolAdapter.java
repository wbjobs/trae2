package com.iot.gateway.protocol.custom;

import com.iot.gateway.codec.MessageCodecFactory;
import com.iot.gateway.codec.frame.CustomLengthFieldBasedFrameDecoder;
import com.iot.gateway.common.enums.DeviceStatus;
import com.iot.gateway.common.enums.MessageType;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.DeviceSession;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.persistence.service.DevicePersistenceService;
import com.iot.gateway.protocol.ProtocolAdapter;
import com.iot.gateway.protocol.ProtocolAdapterManager;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class CustomProtocolAdapter implements ProtocolAdapter {

    @Value("${iot.protocol.custom.port:9090}")
    private int port;

    @Autowired
    private MessageCodecFactory codecFactory;

    @Autowired
    @Lazy
    private ProtocolAdapterManager adapterManager;

    @Autowired
    @Lazy
    private DevicePersistenceService persistenceService;

    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;
    private volatile boolean running = false;

    private final Map<String, Channel> deviceChannels = new ConcurrentHashMap<>();

    @Override
    public void start() {
        if (running) {
            return;
        }

        bossGroup = new NioEventLoopGroup(1);
        workerGroup = new NioEventLoopGroup();

        try {
            ServerBootstrap bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup)
                    .channel(NioServerSocketChannel.class)
                    .option(ChannelOption.SO_BACKLOG, 1024)
                    .childOption(ChannelOption.SO_KEEPALIVE, true)
                    .childOption(ChannelOption.TCP_NODELAY, true)
                    .childHandler(new ChannelInitializer<SocketChannel>() {
                        @Override
                        protected void initChannel(SocketChannel ch) {
                            ch.pipeline()
                                    .addLast(new CustomLengthFieldBasedFrameDecoder())
                                    .addLast(new CustomProtocolHandler());
                        }
                    });

            ChannelFuture future = bootstrap.bind(port).sync();
            serverChannel = future.channel();
            running = true;
            log.info("自定义私有协议适配器启动成功, 端口: {}", port);

        } catch (Exception e) {
            log.error("自定义私有协议适配器启动失败", e);
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
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
        }

        for (String deviceId : deviceChannels.keySet()) {
            try {
                adapterManager.reportOffline(deviceId);
            } catch (Exception e) {
                log.debug("上报设备离线失败: deviceId={}", deviceId, e);
            }
        }
        deviceChannels.clear();
        log.info("自定义私有协议适配器已停止");
    }

    @Override
    public boolean sendMessage(UnifiedMessage message) {
        if (!running) {
            return false;
        }

        Channel channel = deviceChannels.get(message.getDeviceId());
        if (channel == null || !channel.isActive()) {
            return false;
        }

        try {
            byte[] data = codecFactory.encode(ProtocolType.CUSTOM, message);
            if (data == null || data.length == 0) {
                log.warn("自定义协议编码失败, 无法发送: deviceId={}", message.getDeviceId());
                return false;
            }
            channel.writeAndFlush(Unpooled.wrappedBuffer(data));
            return true;
        } catch (Exception e) {
            log.error("自定义协议发送消息失败, deviceId={}", message.getDeviceId(), e);
            return false;
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public ProtocolType getProtocolType() {
        return ProtocolType.CUSTOM;
    }

    private class CustomProtocolHandler extends SimpleChannelInboundHandler<ByteBuf> {

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
            byte[] data = new byte[msg.readableBytes()];
            msg.readBytes(data);
            msg.release();

            UnifiedMessage message = codecFactory.decode(ProtocolType.CUSTOM, data);
            if (message == null) {
                log.warn("自定义协议解码失败, 丢弃数据, 长度={}", data.length);
                return;
            }

            if (message.getDeviceId() == null || message.getDeviceId().trim().isEmpty()) {
                log.warn("自定义协议消息缺少deviceId, 丢弃");
                return;
            }

            String deviceId = message.getDeviceId();

            if (MessageType.LOGIN.equals(message.getMessageType())) {
                handleLogin(ctx, message);
            } else if (MessageType.HEARTBEAT.equals(message.getMessageType())) {
                handleHeartbeat(ctx, message);
            } else if (MessageType.LOGOUT.equals(message.getMessageType())) {
                handleLogout(ctx, message);
            } else if (MessageType.DATA_REPORT.equals(message.getMessageType())) {
                handleDataReport(ctx, message);
            } else {
                persistenceService.saveDeviceData(message);
            }

            if (log.isDebugEnabled()) {
                log.debug("自定义协议消息: deviceId={}, type={}",
                        deviceId, message.getMessageType());
            }
        }

        private void handleLogin(ChannelHandlerContext ctx, UnifiedMessage message) {
            String deviceId = message.getDeviceId();
            deviceChannels.put(deviceId, ctx.channel());

            DeviceSession session = new DeviceSession();
            session.setDeviceId(deviceId);
            session.setProtocolType(ProtocolType.CUSTOM);
            session.setStatus(DeviceStatus.ONLINE);
            session.setSessionId(UUID.randomUUID().toString());
            session.setClientIp(((InetSocketAddress) ctx.channel().remoteAddress()).getHostString());
            session.setClientPort(((InetSocketAddress) ctx.channel().remoteAddress()).getPort());
            session.setOnlineTime(System.currentTimeMillis());
            session.setLastHeartbeat(System.currentTimeMillis());

            boolean reported = adapterManager.reportSession(session);
            if (reported) {
                log.info("自定义协议设备登录: deviceId={}", deviceId);
            }

            message.setGatewayInstance(session.getGatewayInstance());
            persistenceService.saveDeviceData(message);
        }

        private void handleHeartbeat(ChannelHandlerContext ctx, UnifiedMessage message) {
            String deviceId = message.getDeviceId();
            deviceChannels.put(deviceId, ctx.channel());
            DeviceSession session = new DeviceSession();
            session.setDeviceId(deviceId);
            session.setProtocolType(ProtocolType.CUSTOM);
            session.setStatus(DeviceStatus.ONLINE);
            session.setSessionId(UUID.randomUUID().toString());
            session.setClientIp(((InetSocketAddress) ctx.channel().remoteAddress()).getHostString());
            session.setClientPort(((InetSocketAddress) ctx.channel().remoteAddress()).getPort());
            session.setOnlineTime(System.currentTimeMillis());
            session.setLastHeartbeat(System.currentTimeMillis());
            adapterManager.reportSession(session);
            message.setGatewayInstance(session.getGatewayInstance());

            if (log.isDebugEnabled()) {
                log.debug("自定义协议设备心跳: deviceId={}", deviceId);
            }
        }

        private void handleLogout(ChannelHandlerContext ctx, UnifiedMessage message) {
            String deviceId = message.getDeviceId();
            deviceChannels.remove(deviceId);
            adapterManager.reportOffline(deviceId);
            log.info("自定义协议设备登出: deviceId={}", deviceId);
        }

        private void handleDataReport(ChannelHandlerContext ctx, UnifiedMessage message) {
            String deviceId = message.getDeviceId();
            if (!deviceChannels.containsKey(deviceId)) {
                DeviceSession session = new DeviceSession();
                session.setDeviceId(deviceId);
                session.setProtocolType(ProtocolType.CUSTOM);
                session.setStatus(DeviceStatus.ONLINE);
                session.setSessionId(UUID.randomUUID().toString());
                session.setClientIp(((InetSocketAddress) ctx.channel().remoteAddress()).getHostString());
                session.setClientPort(((InetSocketAddress) ctx.channel().remoteAddress()).getPort());
                session.setOnlineTime(System.currentTimeMillis());
                session.setLastHeartbeat(System.currentTimeMillis());
                adapterManager.reportSession(session);
                message.setGatewayInstance(session.getGatewayInstance());
                deviceChannels.put(deviceId, ctx.channel());
            }
            persistenceService.saveDeviceData(message);
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) {
            InetSocketAddress address = (InetSocketAddress) ctx.channel().remoteAddress();
            log.info("自定义协议客户端断开连接: {}:{}", address.getHostString(), address.getPort());

            deviceChannels.entrySet().removeIf(entry -> {
                if (entry.getValue().equals(ctx.channel())) {
                    try {
                        adapterManager.reportOffline(entry.getKey());
                    } catch (Exception e) {
                        log.debug("上报设备离线失败: deviceId={}", entry.getKey(), e);
                    }
                    return true;
                }
                return false;
            });
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            InetSocketAddress address = (InetSocketAddress) ctx.channel().remoteAddress();
            log.error("自定义协议处理异常, remote={}:{}",
                    address.getHostString(), address.getPort(), cause);
            ctx.close();
        }
    }
}
