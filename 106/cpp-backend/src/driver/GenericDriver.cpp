#include "printer/driver/IDriverAdapter.h"
#include <algorithm>

namespace printer {
namespace driver {

class GenericDriver : public IDriverAdapter {
public:
    GenericDriver() : platform_(nullptr) {}

    PrinterBrand getBrand() const override {
        return PrinterBrand::UNKNOWN;
    }

    std::string getBrandName() const override {
        return "Generic";
    }

    std::vector<std::string> getSupportedModels() const override {
        return {"*"};
    }

    bool supportsModel(const std::string&) const override {
        return true;
    }

    bool initialize(const std::string& printerId,
                   std::shared_ptr<platform::IPlatform> platform) override {
        printerId_ = printerId;
        platform_ = platform;
        return true;
    }

    bool printFile(const std::string& filePath,
                  const PrintSettings& settings,
                  const std::string& jobName) override {
        if (!platform_) {
            lastError_ = "Platform not initialized";
            return false;
        }

        std::string actualJobName = jobName.empty() ? "Print Job" : jobName;
        return platform_->printFile(printerId_, filePath, actualJobName);
    }

    bool printRawData(const std::vector<uint8_t>& data,
                     const PrintSettings&,
                     const std::string& jobName) override {
        if (!platform_) {
            lastError_ = "Platform not initialized";
            return false;
        }

        std::string actualJobName = jobName.empty() ? "Print Job" : jobName;
        return platform_->printRawData(printerId_, data, actualJobName);
    }

    PrinterCapabilities getCapabilities() override {
        PrinterCapabilities caps;
        caps.supportedDpi = {300, 600};
        caps.supportedPaperSizes = {"A4", "Letter", "Legal"};
        caps.supportColor = true;
        caps.supportDuplex = false;
        caps.supportedMediaTypes = {"plain"};
        caps.trayCount = 1;
        caps.maxCopies = 999;
        return caps;
    }

    platform::PrinterStatus getExtendedStatus() override {
        if (!platform_) {
            return platform::PrinterStatus::UNKNOWN;
        }
        auto info = platform_->getPrinterInfo(printerId_);
        return info.status;
    }

    std::map<std::string, std::string> getStatusDetails() override {
        std::map<std::string, std::string> details;
        if (platform_) {
            auto info = platform_->getPrinterInfo(printerId_);
            details["model"] = info.model;
            details["port"] = info.port;
            details["jobCount"] = std::to_string(info.jobCount);
        }
        return details;
    }

    bool executeCommand(const std::string& command,
                       const std::map<std::string, std::string>& params) override {
        if (!platform_) {
            lastError_ = "Platform not initialized";
            return false;
        }

        if (command == "pause") {
            return platform_->pausePrinter(printerId_);
        } else if (command == "resume") {
            return platform_->resumePrinter(printerId_);
        } else if (command == "cancelAll") {
            return platform_->cancelAllJobs(printerId_);
        }

        lastError_ = "Unknown command: " + command;
        return false;
    }

    std::string getLastError() const override {
        if (!lastError_.empty()) {
            return lastError_;
        }
        if (platform_) {
            return platform_->getLastError();
        }
        return "";
    }

private:
    std::string printerId_;
    std::shared_ptr<platform::IPlatform> platform_;
    std::string lastError_;
};

DriverManager& DriverManager::getInstance() {
    static DriverManager instance;
    return instance;
}

void DriverManager::registerAdapter(std::shared_ptr<IDriverAdapter> adapter) {
    std::lock_guard<std::mutex> lock(mutex_);
    adapters_[adapter->getBrand()] = adapter;
}

void DriverManager::unregisterAdapter(PrinterBrand brand) {
    std::lock_guard<std::mutex> lock(mutex_);
    adapters_.erase(brand);
}

std::shared_ptr<IDriverAdapter> DriverManager::getAdapter(PrinterBrand brand) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = adapters_.find(brand);
    if (it != adapters_.end()) {
        return it->second;
    }
    return nullptr;
}

std::shared_ptr<IDriverAdapter> DriverManager::getAdapterByModel(const std::string& model) {
    std::lock_guard<std::mutex> lock(mutex_);

    std::string modelLower = model;
    std::transform(modelLower.begin(), modelLower.end(), modelLower.begin(),
                   [](unsigned char c) { return std::tolower(c); });

    for (const auto& pair : adapters_) {
        const auto& supportedModels = pair.second->getSupportedModels();
        for (const auto& supportedModel : supportedModels) {
            std::string supportedLower = supportedModel;
            std::transform(supportedLower.begin(), supportedLower.end(), supportedLower.begin(),
                           [](unsigned char c) { return std::tolower(c); });

            if (modelLower.find(supportedLower) != std::string::npos ||
                supportedLower.find(modelLower) != std::string::npos) {
                return pair.second;
            }
        }

        if (pair.second->supportsModel(model)) {
            return pair.second;
        }
    }

    return std::make_shared<GenericDriver>();
}

std::shared_ptr<IDriverAdapter> DriverManager::getAdapterByPrinterId(
        const std::string& printerId,
        std::shared_ptr<platform::IPlatform> platform) {
    auto info = platform->getPrinterInfo(printerId);
    auto adapter = getAdapterByModel(info.model);
    adapter->initialize(printerId, platform);
    return adapter;
}

std::vector<PrinterBrand> DriverManager::getRegisteredBrands() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PrinterBrand> brands;
    for (const auto& pair : adapters_) {
        brands.push_back(pair.first);
    }
    return brands;
}

std::vector<std::string> DriverManager::getAllSupportedModels() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> models;
    for (const auto& pair : adapters_) {
        auto adapterModels = pair.second->getSupportedModels();
        models.insert(models.end(), adapterModels.begin(), adapterModels.end());
    }
    return models;
}

}
}
