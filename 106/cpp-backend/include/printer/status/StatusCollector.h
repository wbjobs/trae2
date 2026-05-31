#pragma once

#include "printer/platform/IPlatform.h"
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <mutex>
#include <thread>
#include <atomic>
#include <functional>
#include <cstdint>
#include <chrono>

namespace printer {
namespace status {

struct PrinterStatusSnapshot {
    std::string printerId;
    platform::PrinterStatus status;
    std::map<std::string, std::string> details;
    uint32_t jobCount;
    int64_t timestamp;
    int64_t uptimeSeconds;
    uint64_t totalPrints;
    uint64_t failedPrints;
};

struct StatusAlert {
    std::string id;
    std::string printerId;
    std::string type;
    std::string message;
    int severity;
    int64_t timestamp;
    bool acknowledged;
};

class StatusCollector {
public:
    static StatusCollector& getInstance();

    using StatusCallback = std::function<void(const PrinterStatusSnapshot&)>;
    using AlertCallback = std::function<void(const StatusAlert&)>;

    void initialize(std::shared_ptr<platform::IPlatform> platform);
    void shutdown();

    void setPollInterval(int intervalMs);
    int getPollInterval() const;

    void startMonitoring(const std::string& printerId);
    void stopMonitoring(const std::string& printerId);
    bool isMonitoring(const std::string& printerId) const;

    PrinterStatusSnapshot getCurrentStatus(const std::string& printerId);
    std::vector<PrinterStatusSnapshot> getStatusHistory(
        const std::string& printerId,
        int maxEntries = 100);

    std::vector<StatusAlert> getAlerts(const std::string& printerId = "");
    bool acknowledgeAlert(const std::string& alertId);
    void clearAlerts(const std::string& printerId = "");

    void setStatusChangeCallback(StatusCallback callback);
    void setAlertCallback(AlertCallback callback);

    bool forceUpdate(const std::string& printerId);
    void forceUpdateAll();

    std::vector<std::string> getMonitoredPrinters() const;

private:
    StatusCollector();
    ~StatusCollector();
    StatusCollector(const StatusCollector&) = delete;
    StatusCollector& operator=(const StatusCollector&) = delete;

    void monitoringThread();
    void updatePrinterStatus(const std::string& printerId);
    void checkForAlerts(const PrinterStatusSnapshot& previous,
                        const PrinterStatusSnapshot& current);
    std::string generateAlertId();

    std::shared_ptr<platform::IPlatform> platform_;

    std::map<std::string, PrinterStatusSnapshot> currentStatus_;
    std::map<std::string, std::vector<PrinterStatusSnapshot>> statusHistory_;
    std::map<std::string, std::vector<StatusAlert>> alerts_;

    std::vector<std::string> monitoredPrinters_;

    mutable std::mutex mutex_;
    std::thread monitorThread_;
    std::atomic<bool> running_;
    std::atomic<int> pollIntervalMs_;

    StatusCallback statusCallback_;
    AlertCallback alertCallback_;

    size_t maxHistorySize_;
    platform::PrinterStatus lastStatus_;
};

}
}
