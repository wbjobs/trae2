package com.iot.gateway.persistence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.gateway.persistence.entity.CommandLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CommandLogMapper extends BaseMapper<CommandLog> {
}
