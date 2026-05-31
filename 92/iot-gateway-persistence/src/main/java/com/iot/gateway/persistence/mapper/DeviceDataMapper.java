package com.iot.gateway.persistence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.gateway.persistence.entity.DeviceData;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DeviceDataMapper extends BaseMapper<DeviceData> {

    @Insert("<script>" +
            "INSERT INTO device_data (device_id, message_id, message_type, payload, gateway_instance, create_time) VALUES " +
            "<foreach collection='list' item='item' separator=','>" +
            "(#{item.deviceId}, #{item.messageId}, #{item.messageType}, #{item.payload}, #{item.gatewayInstance}, #{item.createTime})" +
            "</foreach>" +
            "</script>")
    int insertBatch(@Param("list") List<DeviceData> list);
}
