#pragma once

#include "printer/platform/IPlatform.h"
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <functional>

namespace printer {
namespace driver {

enum class PrinterBrand {
    UNKNOWN,
    HP,
    EPSON,
    CANON,
    BROTHER,
    SAMSUNG,
    XEROX,
    LEXMARK,
    KONICA_MINOLTA,
    RICOH,
    ZEBRA,
    TOSHIBA
};

struct PrintSettings {
    int copies = 1;
    bool color = true;
    int dpi = 300;
    std::string paperSize = "A4";
    std::string orientation = "portrait";
    std::string mediaType = "plain";
    int tray = 1;
    bool duplex = false;
    std::map<std::string, std::string> customSettings;
};

struct PrinterCapabilities {
    std::vector<int> supportedDpi;
    std::vector<std::string> supportedPaperSizes;
    bool supportColor;
    bool supportDuplex;
    std::vector<std::string> supportedMediaTypes;
    int trayCount;
    int maxCopies;
};

class IDriverAdapter {
public:
    virtual ~IDriverAdapter() = default;

    virtual PrinterBrand getBrand() const = 0;
    virtual std::string getBrandName() const = 0;
    virtual std::vector<std::string> getSupportedModels() const = 0;
    virtual bool supportsModel(const std::string& model) const = 0;

    virtual bool initialize(const std::string& printerId,
                           std::shared_ptr<platform::IPlatform> platform) = 0;

    virtual bool printFile(const std::string& filePath,
                          const PrintSettings& settings,
                          const std::string& jobName = "") = 0;

    virtual bool printRawData(const std::vector<uint8_t>& data,
                             const PrintSettings& settings,
                             const std::string& jobName = "") = 0;

    virtual PrinterCapabilities getCapabilities() = 0;
    virtual platform::PrinterStatus getExtendedStatus() = 0;
    virtual std::map<std::string, std::string> getStatusDetails() = 0;

    virtual bool executeCommand(const std::string& command,
                               const std::map<std::string, std::string>& params) = 0;

    virtual std::string getLastError() const = 0;
};

class DriverManager {
public:
    static DriverManager& getInstance();

    void registerAdapter(std::shared_ptr<IDriverAdapter> adapter);
    void unregisterAdapter(PrinterBrand brand);

    std::shared_ptr<IDriverAdapter> getAdapter(PrinterBrand brand);
    std::shared_ptr<IDriverAdapter> getAdapterByModel(const std::string& model);
    std::shared_ptr<IDriverAdapter> getAdapterByPrinterId(const std::string& printerId,
                                                        std::shared_ptr<platform::IPlatform> platform);

    std::vector<PrinterBrand> getRegisteredBrands() const;
    std::vector<std::string> getAllSupportedModels() const;

private:
    DriverManager() = default;
    DriverManager(const DriverManager&) = delete;
    DriverManager& operator=(const DriverManager&) = delete;

    std::map<PrinterBrand, std::shared_ptr<IDriverAdapter>> adapters_;
    mutable std::mutex mutex_;
};

}
}
