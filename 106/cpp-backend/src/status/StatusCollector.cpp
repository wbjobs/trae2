#include "printer/status/StatusCollector.h"
#include <algorithm>
#include <random>
#include <sstream>
#include <iomanip>

namespace printer {
namespace status {

StatusCollector& StatusCollector::getInstance() {
    static StatusCollector instance;
    return instance;
}

StatusCollector::StatusCollector()
    : platform_(nullptr)
    , running_(false)
    , pollIntervalMs_(5000)
    , maxHistorySize_(1000)
    , lastStatus_(platform::PrinterStatus::UNKNOWN) {
}

StatusCollector::~StatusCollector() {
    shutdown();
}

void StatusCollector::initialize(std::shared_ptr<platform::IPlatform> platform) {
    std::lock_guard<std::mutex> lock(mutex_);
    platform_ = platform;

    if (!running_) {
        running_ = true;
        monitorThread_ = std::thread(&StatusCollector::monitoringThread, this);
    }
}

void StatusCollector::shutdown() {
    running_ = false;

    if (monitorThread_.joinable()) {
        monitorThread_.join();
    }
}

void StatusCollector::setPollInterval(int intervalMs) {
    pollIntervalMs_ = intervalMs;
}

int StatusCollector::getPollInterval() const {
    return pollIntervalMs_.load();
}

void StatusCollector::startMonitoring(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = std::find(monitoredPrinters_.begin(), monitoredPrinters_.end(), printerId);
    if (it == monitoredPrinters_.end()) {
        monitoredPrinters_.push_back(printerId);
    }
}

void StatusCollector::stopMonitoring(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = std::find(monitoredPrinters_.begin(), monitoredPrinters_.end(), printerId);
    if (it != monitoredPrinters_.end()) {
        monitoredPrinters_.erase(it);
    }
}

bool StatusCollector::isMonitoring(const std::string& printerId) const {
    std::lock_guard<std::mutex> lock(mutex_);

    return std::find(monitoredPrinters_.begin(), monitoredPrinters_.end(), printerId)
           != monitoredPrinters_.end();
}

PrinterStatusSnapshot StatusCollector::getCurrentStatus(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = currentStatus_.find(printerId);
    if (it != currentStatus_.end()) {
        return it->second;
    }

    PrinterStatusSnapshot snapshot;
    snapshot.printerId = printerId;
    snapshot.status = platform::PrinterStatus::UNKNOWN;
    return snapshot;
}

std::vector<PrinterStatusSnapshot> StatusCollector::getStatusHistory(
        const std::string& printerId,
        int maxEntries) {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<PrinterStatusSnapshot> result;
    auto it = statusHistory_.find(printerId);
    if (it != statusHistory_.end()) {
        int count = 0;
        for (auto histIt = it->second.rbegin();
             histIt != it->second.rend() && count < maxEntries;
             ++histIt, ++count) {
            result.push_back(*histIt);
        }
    }
    return result;
}

std::vector<StatusAlert> StatusCollector::getAlerts(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<StatusAlert> result;

    if (printerId.empty()) {
        for (const auto& pair : alerts_) {
            for (const auto& alert : pair.second) {
                result.push_back(alert);
            }
        }
    } else {
        auto it = alerts_.find(printerId);
        if (it != alerts_.end()) {
            result = it->second;
        }
    }

    std::sort(result.begin(), result.end(),
        [](const StatusAlert& a, const StatusAlert& b) {
            return a.timestamp > b.timestamp;
        });

    return result;
}

bool StatusCollector::acknowledgeAlert(const std::string& alertId) {
    std::lock_guard<std::mutex> lock(mutex_);

    for (auto& pair : alerts_) {
        for (auto& alert : pair.second) {
            if (alert.id == alertId) {
                alert.acknowledged = true;
                return true;
            }
        }
    }

    return false;
}

void StatusCollector::clearAlerts(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (printerId.empty()) {
        alerts_.clear();
    } else {
        alerts_.erase(printerId);
    }
}

void StatusCollector::setStatusChangeCallback(StatusCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    statusCallback_ = callback;
}

void StatusCollector::setAlertCallback(AlertCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    alertCallback_ = callback;
}

bool StatusCollector::forceUpdate(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);
    updatePrinterStatus(printerId);
    return true;
}

void StatusCollector::forceUpdateAll() {
    std::lock_guard<std::mutex> lock(mutex_);

    for (const auto& printerId : monitoredPrinters_) {
        updatePrinterStatus(printerId);
    }
}

std::vector<std::string> StatusCollector::getMonitoredPrinters() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return monitoredPrinters_;
}

void StatusCollector::monitoringThread() {
    while (running_) {
        {
            std::lock_guard<std::mutex> lock(mutex_);

            for (const auto& printerId : monitoredPrinters_) {
                updatePrinterStatus(printerId);
            }
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(pollIntervalMs_.load()));
    }
}

void StatusCollector::updatePrinterStatus(const std::string& printerId) {
    if (!platform_) {
        return;
    }

    auto info = platform_->getPrinterInfo(printerId);

    PrinterStatusSnapshot snapshot;
    snapshot.printerId = printerId;
    snapshot.status = info.status;
    snapshot.jobCount = info.jobCount;
    snapshot.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    snapshot.uptimeSeconds = 0;
    snapshot.totalPrints = 0;
    snapshot.failedPrints = 0;

    snapshot.details["model"] = info.model;
    snapshot.details["manufacturer"] = info.manufacturer;
    snapshot.details["port"] = info.port;

    PrinterStatusSnapshot previous;
    auto prevIt = currentStatus_.find(printerId);
    if (prevIt != currentStatus_.end()) {
        previous = prevIt->second;
    }

    currentStatus_[printerId] = snapshot;

    statusHistory_[printerId].push_back(snapshot);
    if (statusHistory_[printerId].size() > maxHistorySize_) {
        statusHistory_[printerId].erase(statusHistory_[printerId].begin());
    }

    if (previous.status != snapshot.status) {
        checkForAlerts(previous, snapshot);

        if (statusCallback_) {
            statusCallback_(snapshot);
        }
    }
}

void StatusCollector::checkForAlerts(const PrinterStatusSnapshot& previous,
                                      const PrinterStatusSnapshot& current) {
    if (previous.status == current.status) {
        return;
    }

    StatusAlert alert;
    alert.id = generateAlertId();
    alert.printerId = current.printerId;
    alert.timestamp = current.timestamp;
    alert.acknowledged = false;

    switch (current.status) {
        case platform::PrinterStatus::ERROR:
            alert.type = "error";
            alert.message = "打印机发生错误";
            alert.severity = 3;
            break;

        case platform::PrinterStatus::OFFLINE:
            alert.type = "offline";
            alert.message = "打印机离线";
            alert.severity = 2;
            break;

        case platform::PrinterStatus::PAPER_OUT:
            alert.type = "paper_out";
            alert.message = "打印机缺纸";
            alert.severity = 2;
            break;

        case platform::PrinterStatus::JAMMED:
            alert.type = "jammed";
            alert.message = "打印机卡纸";
            alert.severity = 2;
            break;

        case platform::PrinterStatus::COVER_OPEN:
            alert.type = "cover_open";
            alert.message = "打印机机盖打开";
            alert.severity = 1;
            break;

        default:
            return;
    }

    alerts_[current.printerId].push_back(alert);

    if (alertCallback_) {
        alertCallback_(alert);
    }
}

std::string StatusCollector::generateAlertId() {
    static std::atomic<uint64_t> counter(0);
    auto now = std::chrono::system_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 9999);

    std::ostringstream oss;
    oss << "ALERT_" << timestamp << "_"
        << std::setw(4) << std::setfill('0') << (counter++ % 10000) << "_"
        << std::setw(4) << std::setfill('0') << dis(gen);
    return oss.str();
}

}
}
