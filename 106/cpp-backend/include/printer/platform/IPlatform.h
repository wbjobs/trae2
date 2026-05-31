#pragma once

#include "printer/platform/PlatformExport.h"
#include <string>
#include <vector>
#include <cstdint>

namespace printer {
namespace platform {

enum class PrinterStatus {
    UNKNOWN,
    READY,
    BUSY,
    PRINTING,
    PAUSED,
    ERROR,
    OFFLINE,
    PAPER_OUT,
    COVER_OPEN,
    JAMMED
};

struct PrinterInfo {
    std::string id;
    std::string name;
    std::string model;
    std::string manufacturer;
    std::string port;
    bool isDefault;
    PrinterStatus status;
    uint32_t jobCount;
};

struct JobInfo {
    std::string id;
    std::string printerId;
    std::string documentName;
    std::string userName;
    uint32_t totalPages;
    uint32_t printedPages;
    uint32_t sizeBytes;
    int64_t submittedTime;
    PrinterStatus status;
};

class PLATFORM_API IPlatform {
public:
    virtual ~IPlatform() = default;

    virtual bool initialize() = 0;
    virtual bool shutdown() = 0;

    virtual std::vector<PrinterInfo> enumeratePrinters() = 0;
    virtual PrinterInfo getPrinterInfo(const std::string& printerId) = 0;

    virtual bool printFile(const std::string& printerId,
                          const std::string& filePath,
                          const std::string& jobName = "") = 0;

    virtual bool printRawData(const std::string& printerId,
                             const std::vector<uint8_t>& data,
                             const std::string& jobName = "") = 0;

    virtual std::vector<JobInfo> getActiveJobs(const std::string& printerId) = 0;
    virtual bool cancelJob(const std::string& printerId, const std::string& jobId) = 0;
    virtual bool cancelAllJobs(const std::string& printerId) = 0;

    virtual bool pausePrinter(const std::string& printerId) = 0;
    virtual bool resumePrinter(const std::string& printerId) = 0;

    virtual std::string getDefaultPrinterId() = 0;
    virtual bool setDefaultPrinter(const std::string& printerId) = 0;

    virtual std::string getLastError() const = 0;
};

PLATFORM_API IPlatform* createPlatform();
PLATFORM_API void destroyPlatform(IPlatform* platform);

}
}
