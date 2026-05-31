#include "printer/platform/IPlatform.h"
#include <windows.h>
#include <winspool.h>
#include <vector>
#include <map>
#include <mutex>
#include <sstream>

namespace printer {
namespace platform {

class WindowsPlatform : public IPlatform {
public:
    WindowsPlatform() : initialized_(false) {}

    ~WindowsPlatform() override {
        shutdown();
    }

    bool initialize() override {
        std::lock_guard<std::mutex> lock(mutex_);
        if (initialized_) return true;
        initialized_ = true;
        return true;
    }

    bool shutdown() override {
        std::lock_guard<std::mutex> lock(mutex_);
        initialized_ = false;
        return true;
    }

    std::vector<PrinterInfo> enumeratePrinters() override {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<PrinterInfo> printers;

        DWORD needed = 0, returned = 0;
        EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, nullptr, 2,
                     nullptr, 0, &needed, &returned);

        if (needed == 0) return printers;

        std::vector<uint8_t> buffer(needed);
        auto info = reinterpret_cast<PRINTER_INFO_2*>(buffer.data());

        if (EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, nullptr, 2,
                        buffer.data(), needed, &needed, &returned)) {
            for (DWORD i = 0; i < returned; ++i) {
                PrinterInfo pi;
                pi.id = info[i].pPrinterName ? info[i].pPrinterName : "";
                pi.name = info[i].pPrinterName ? info[i].pPrinterName : "";
                pi.model = info[i].pDriverName ? info[i].pDriverName : "";
                pi.port = info[i].pPortName ? info[i].pPortName : "";
                pi.isDefault = (info[i].Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0;
                pi.status = convertStatus(info[i].Status);
                pi.jobCount = info[i].cJobs;
                pi.manufacturer = "Unknown";
                printers.push_back(pi);
            }
        }

        return printers;
    }

    PrinterInfo getPrinterInfo(const std::string& printerId) override {
        std::lock_guard<std::mutex> lock(mutex_);
        PrinterInfo pi;
        pi.id = printerId;

        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer: " + printerId;
            return pi;
        }

        DWORD needed = 0;
        GetPrinter(hPrinter, 2, nullptr, 0, &needed);
        if (needed > 0) {
            std::vector<uint8_t> buffer(needed);
            auto info = reinterpret_cast<PRINTER_INFO_2*>(buffer.data());
            if (GetPrinter(hPrinter, 2, buffer.data(), needed, &needed)) {
                pi.name = info->pPrinterName ? info->pPrinterName : "";
                pi.model = info->pDriverName ? info->pDriverName : "";
                pi.port = info->pPortName ? info->pPortName : "";
                pi.isDefault = (info->Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0;
                pi.status = convertStatus(info->Status);
                pi.jobCount = info->cJobs;
            }
        }

        ClosePrinter(hPrinter);
        return pi;
    }

    bool printFile(const std::string& printerId,
                   const std::string& filePath,
                   const std::string& jobName) override {
        lastError_.clear();

        DOC_INFO_1 docInfo;
        docInfo.pDocName = const_cast<char*>(jobName.empty() ? "Print Job" : jobName.c_str());
        docInfo.pOutputFile = nullptr;
        docInfo.pDatatype = const_cast<char*>("RAW");

        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return false;
        }

        if (StartDocPrinter(hPrinter, 1, reinterpret_cast<LPBYTE>(&docInfo)) == 0) {
            lastError_ = "Failed to start document";
            ClosePrinter(hPrinter);
            return false;
        }

        if (StartPagePrinter(hPrinter) == 0) {
            lastError_ = "Failed to start page";
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        FILE* file = fopen(filePath.c_str(), "rb");
        if (!file) {
            lastError_ = "Failed to open file: " + filePath;
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        const int BUF_SIZE = 4096;
        std::vector<uint8_t> buffer(BUF_SIZE);
        size_t bytesRead;
        DWORD written;
        bool success = true;

        while ((bytesRead = fread(buffer.data(), 1, BUF_SIZE, file)) > 0) {
            if (!WritePrinter(hPrinter, buffer.data(), static_cast<DWORD>(bytesRead), &written)) {
                lastError_ = "Failed to write to printer";
                success = false;
                break;
            }
        }

        fclose(file);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return success;
    }

    bool printRawData(const std::string& printerId,
                      const std::vector<uint8_t>& data,
                      const std::string& jobName) override {
        lastError_.clear();

        DOC_INFO_1 docInfo;
        docInfo.pDocName = const_cast<char*>(jobName.empty() ? "Print Job" : jobName.c_str());
        docInfo.pOutputFile = nullptr;
        docInfo.pDatatype = const_cast<char*>("RAW");

        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return false;
        }

        if (StartDocPrinter(hPrinter, 1, reinterpret_cast<LPBYTE>(&docInfo)) == 0) {
            lastError_ = "Failed to start document";
            ClosePrinter(hPrinter);
            return false;
        }

        if (StartPagePrinter(hPrinter) == 0) {
            lastError_ = "Failed to start page";
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        DWORD written;
        bool success = WritePrinter(hPrinter, const_cast<uint8_t*>(data.data()),
                                    static_cast<DWORD>(data.size()), &written);

        if (!success) {
            lastError_ = "Failed to write to printer";
        }

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return success;
    }

    std::vector<JobInfo> getActiveJobs(const std::string& printerId) override {
        std::vector<JobInfo> jobs;

        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return jobs;
        }

        DWORD needed = 0, returned = 0;
        EnumJobs(hPrinter, 0, 0xFFFFFFFF, 2, nullptr, 0, &needed, &returned);

        if (needed > 0) {
            std::vector<uint8_t> buffer(needed);
            auto jobInfo = reinterpret_cast<JOB_INFO_2*>(buffer.data());

            if (EnumJobs(hPrinter, 0, 0xFFFFFFFF, 2, buffer.data(), needed, &needed, &returned)) {
                for (DWORD i = 0; i < returned; ++i) {
                    JobInfo ji;
                    ji.id = std::to_string(jobInfo[i].JobId);
                    ji.printerId = printerId;
                    ji.documentName = jobInfo[i].pDocument ? jobInfo[i].pDocument : "";
                    ji.userName = jobInfo[i].pUserName ? jobInfo[i].pUserName : "";
                    ji.totalPages = jobInfo[i].TotalPages;
                    ji.printedPages = jobInfo[i].PagesPrinted;
                    ji.sizeBytes = jobInfo[i].Size;
                    ji.status = convertJobStatus(jobInfo[i].Status);
                    jobs.push_back(ji);
                }
            }
        }

        ClosePrinter(hPrinter);
        return jobs;
    }

    bool cancelJob(const std::string& printerId, const std::string& jobId) override {
        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return false;
        }

        DWORD jobIdNum = std::stoul(jobId);
        bool success = SetJob(hPrinter, jobIdNum, 0, nullptr, JOB_CONTROL_DELETE) != 0;

        if (!success) {
            lastError_ = "Failed to cancel job";
        }

        ClosePrinter(hPrinter);
        return success;
    }

    bool cancelAllJobs(const std::string& printerId) override {
        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return false;
        }

        bool success = SetPrinter(hPrinter, 0, nullptr, PRINTER_CONTROL_PURGE) != 0;

        if (!success) {
            lastError_ = "Failed to cancel all jobs";
        }

        ClosePrinter(hPrinter);
        return success;
    }

    bool pausePrinter(const std::string& printerId) override {
        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return false;
        }

        bool success = SetPrinter(hPrinter, 0, nullptr, PRINTER_CONTROL_PAUSE) != 0;

        if (!success) {
            lastError_ = "Failed to pause printer";
        }

        ClosePrinter(hPrinter);
        return success;
    }

    bool resumePrinter(const std::string& printerId) override {
        HANDLE hPrinter = nullptr;
        if (!OpenPrinter(const_cast<char*>(printerId.c_str()), &hPrinter, nullptr)) {
            lastError_ = "Failed to open printer";
            return false;
        }

        bool success = SetPrinter(hPrinter, 0, nullptr, PRINTER_CONTROL_RESUME) != 0;

        if (!success) {
            lastError_ = "Failed to resume printer";
        }

        ClosePrinter(hPrinter);
        return success;
    }

    std::string getDefaultPrinterId() override {
        char buffer[MAX_PATH];
        DWORD size = MAX_PATH;
        if (GetDefaultPrinterA(buffer, &size)) {
            return std::string(buffer);
        }
        return "";
    }

    bool setDefaultPrinter(const std::string& printerId) override {
        bool success = SetDefaultPrinterA(printerId.c_str()) != 0;
        if (!success) {
            lastError_ = "Failed to set default printer";
        }
        return success;
    }

    std::string getLastError() const override {
        return lastError_;
    }

private:
    PrinterStatus convertStatus(DWORD status) {
        if (status & PRINTER_STATUS_PAUSED) return PrinterStatus::PAUSED;
        if (status & PRINTER_STATUS_ERROR) return PrinterStatus::ERROR;
        if (status & PRINTER_STATUS_PENDING_DELETION) return PrinterStatus::BUSY;
        if (status & PRINTER_STATUS_BUSY) return PrinterStatus::BUSY;
        if (status & PRINTER_STATUS_OFFLINE) return PrinterStatus::OFFLINE;
        if (status & PRINTER_STATUS_JAMMED) return PrinterStatus::JAMMED;
        if (status & PRINTER_STATUS_PAPER_OUT) return PrinterStatus::PAPER_OUT;
        if (status & PRINTER_STATUS_OUTPUT_BIN_FULL) return PrinterStatus::ERROR;
        if (status & PRINTER_STATUS_NOT_AVAILABLE) return PrinterStatus::OFFLINE;
        if (status & PRINTER_STATUS_PRINTING) return PrinterStatus::PRINTING;
        if (status & PRINTER_STATUS_COVER_OPEN) return PrinterStatus::COVER_OPEN;
        if (status == 0) return PrinterStatus::READY;
        return PrinterStatus::UNKNOWN;
    }

    PrinterStatus convertJobStatus(DWORD status) {
        if (status & JOB_STATUS_PAUSED) return PrinterStatus::PAUSED;
        if (status & JOB_STATUS_ERROR) return PrinterStatus::ERROR;
        if (status & JOB_STATUS_DELETING) return PrinterStatus::BUSY;
        if (status & JOB_STATUS_PRINTING) return PrinterStatus::PRINTING;
        if (status & JOB_STATUS_OFFLINE) return PrinterStatus::OFFLINE;
        if (status & JOB_STATUS_PAPEROUT) return PrinterStatus::PAPER_OUT;
        if (status & JOB_STATUS_BLOCKED) return PrinterStatus::ERROR;
        if (status & JOB_STATUS_COMPLETE) return PrinterStatus::READY;
        return PrinterStatus::UNKNOWN;
    }

    std::mutex mutex_;
    bool initialized_;
    std::string lastError_;
};

}
}
