package com.iot.gateway.common.model;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class BatchResult implements Serializable {

    private static final long serialVersionUID = 1L;

    private int total;

    private int success;

    private int failed;

    private List<FailedItem> failedItems = new ArrayList<>();

    private long costTime;

    @Data
    public static class FailedItem implements Serializable {

        private static final long serialVersionUID = 1L;

        private int index;

        private String deviceId;

        private String errorMsg;

        public FailedItem(int index, String deviceId, String errorMsg) {
            this.index = index;
            this.deviceId = deviceId;
            this.errorMsg = errorMsg;
        }
    }

    public static BatchResult success(int total) {
        BatchResult result = new BatchResult();
        result.setTotal(total);
        result.setSuccess(total);
        result.setFailed(0);
        return result;
    }

    public static BatchResult failed(int total, String errorMsg) {
        BatchResult result = new BatchResult();
        result.setTotal(total);
        result.setSuccess(0);
        result.setFailed(total);
        result.getFailedItems().add(new FailedItem(-1, "ALL", errorMsg));
        return result;
    }
}
