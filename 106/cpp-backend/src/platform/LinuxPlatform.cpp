#include "printer/platform/IPlatform.h"
#include <cups/cups.h>
#include <cups/ipp.h>
#include <vector>
#include <map>
#include <mutex>
#include <sstream>
#include <fstream>
#include <ctime>

namespace printer {
namespace platform {

class LinuxPlatform : public IPlatform {
public:
    LinuxPlatform() : initialized_(false) {}

    ~LinuxPlatform() override {
        shutdown();
    }

    bool initialize() override {
        std::lock_guard<std::mutex> lock(mutex_);
        if (initialized_) return true;
        cupsSetUser(getenv("USER") ? getenv("USER") : "root");
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

        cups_dest_t* dests;
        int num_dests = cupsGetDests(&dests);

        if (num_dests > 0 && dests) {
            for (int i = 0; i < num_dests; ++i) {
                PrinterInfo pi;
                pi.id = dests[i].name ? dests[i].name : "";
                pi.name = dests[i].name ? dests[i].name : "";
                pi.isDefault = dests[i].is_default != 0;

                cups_dinfo_t* dinfo = cupsCopyDestInfo(CUPS_HTTP_DEFAULT, &dests[i]);
                if (dinfo) {
                    const char* make_and_model = cupsGetDestString(&dests[i], dinfo, "make-and-model", nullptr);
                    if (make_and_model) {
                        pi.model = make_and_model;
                        pi.manufacturer = make_and_model;
                    }
                    const char* device_uri = cupsGetDestString(&dests[i], dinfo, "device-uri", nullptr);
                    if (device_uri) {
                        pi.port = device_uri;
                    }

                    ipp_attribute_t* state_attr = cupsGetDestAttr(&dests[i], dinfo, "printer-state", nullptr);
                    if (state_attr) {
                        int state = ippGetInteger(state_attr, 0);
                        pi.status = convertPrinterState(state);
                    }

                    ipp_attribute_t* job_count_attr = cupsGetDestAttr(&dests[i], dinfo, "queued-job-count", nullptr);
                    if (job_count_attr) {
                        pi.jobCount = static_cast<uint32_t>(ippGetInteger(job_count_attr, 0));
                    }

                    cupsFreeDestInfo(dinfo);
                }

                printers.push_back(pi);
            }
            cupsFreeDests(num_dests, dests);
        }

        return printers;
    }

    PrinterInfo getPrinterInfo(const std::string& printerId) override {
        std::lock_guard<std::mutex> lock(mutex_);
        PrinterInfo pi;
        pi.id = printerId;

        cups_dest_t* dest = cupsGetDest(printerId.c_str(), nullptr, 0, nullptr);
        if (dest) {
            pi.name = dest->name ? dest->name : "";
            pi.isDefault = dest->is_default != 0;

            cups_dinfo_t* dinfo = cupsCopyDestInfo(CUPS_HTTP_DEFAULT, dest);
            if (dinfo) {
                const char* make_and_model = cupsGetDestString(dest, dinfo, "make-and-model", nullptr);
                if (make_and_model) {
                    pi.model = make_and_model;
                    pi.manufacturer = make_and_model;
                }
                const char* device_uri = cupsGetDestString(dest, dinfo, "device-uri", nullptr);
                if (device_uri) {
                    pi.port = device_uri;
                }

                ipp_attribute_t* state_attr = cupsGetDestAttr(dest, dinfo, "printer-state", nullptr);
                if (state_attr) {
                    int state = ippGetInteger(state_attr, 0);
                    pi.status = convertPrinterState(state);
                }

                ipp_attribute_t* job_count_attr = cupsGetDestAttr(dest, dinfo, "queued-job-count", nullptr);
                if (job_count_attr) {
                    pi.jobCount = static_cast<uint32_t>(ippGetInteger(job_count_attr, 0));
                }

                cupsFreeDestInfo(dinfo);
            }
            cupsFreeDests(1, dest);
        }

        return pi;
    }

    bool printFile(const std::string& printerId,
                   const std::string& filePath,
                   const std::string& jobName) override {
        std::lock_guard<std::mutex> lock(mutex_);
        lastError_.clear();

        std::ifstream file(filePath, std::ios::binary);
        if (!file) {
            lastError_ = "Failed to open file: " + filePath;
            return false;
        }

        std::vector<uint8_t> data((std::istreambuf_iterator<char>(file)),
                                   std::istreambuf_iterator<char>());
        file.close();

        return printRawDataInternal(printerId, data, jobName.empty() ? "Print Job" : jobName);
    }

    bool printRawData(const std::string& printerId,
                      const std::vector<uint8_t>& data,
                      const std::string& jobName) override {
        std::lock_guard<std::mutex> lock(mutex_);
        lastError_.clear();
        return printRawDataInternal(printerId, data, jobName.empty() ? "Print Job" : jobName);
    }

    std::vector<JobInfo> getActiveJobs(const std::string& printerId) override {
        std::vector<JobInfo> jobs;

        ipp_t* request = ippNewRequest(CUPS_GET_JOBS);
        ippAddString(request, IPP_TAG_OPERATION, IPP_TAG_URI, "printer-uri", nullptr,
                     (std::string("ipp://localhost/printers/") + printerId).c_str());
        ippAddString(request, IPP_TAG_OPERATION, IPP_TAG_KEYWORD, "requested-attributes", nullptr,
                     "job-id,job-name,job-originating-user-name,job-k-octets,time-at-creation,"
                     "job-state,job-impressions,job-impressions-completed");

        ipp_t* response = cupsDoRequest(CUPS_HTTP_DEFAULT, request, "/");
        if (response) {
            ipp_attribute_t* attr;
            int job_id = 0;
            JobInfo ji;

            for (attr = ippFirstAttribute(response); attr; attr = ippNextAttribute(response)) {
                const char* name = ippGetName(attr);

                if (strcmp(name, "job-id") == 0) {
                    if (job_id > 0) {
                        ji.printerId = printerId;
                        jobs.push_back(ji);
                        ji = JobInfo();
                    }
                    job_id = ippGetInteger(attr, 0);
                    ji.id = std::to_string(job_id);
                } else if (strcmp(name, "job-name") == 0) {
                    ji.documentName = ippGetString(attr, 0, nullptr);
                } else if (strcmp(name, "job-originating-user-name") == 0) {
                    ji.userName = ippGetString(attr, 0, nullptr);
                } else if (strcmp(name, "job-k-octets") == 0) {
                    ji.sizeBytes = static_cast<uint32_t>(ippGetInteger(attr, 0)) * 1024;
                } else if (strcmp(name, "time-at-creation") == 0) {
                    ji.submittedTime = ippGetInteger(attr, 0);
                } else if (strcmp(name, "job-state") == 0) {
                    ji.status = convertJobState(ippGetInteger(attr, 0));
                } else if (strcmp(name, "job-impressions") == 0) {
                    ji.totalPages = static_cast<uint32_t>(ippGetInteger(attr, 0));
                } else if (strcmp(name, "job-impressions-completed") == 0) {
                    ji.printedPages = static_cast<uint32_t>(ippGetInteger(attr, 0));
                }
            }

            if (job_id > 0) {
                ji.printerId = printerId;
                jobs.push_back(ji);
            }

            ippDelete(response);
        }

        return jobs;
    }

    bool cancelJob(const std::string& printerId, const std::string& jobId) override {
        int job_id = std::stoi(jobId);
        ipp_status_t status = cupsCancelJob(printerId.c_str(), job_id);
        if (status != IPP_STATUS_OK) {
            lastError_ = "Failed to cancel job: " + std::to_string(status);
            return false;
        }
        return true;
    }

    bool cancelAllJobs(const std::string& printerId) override {
        ipp_status_t status = cupsCancelJob(printerId.c_str(), 0);
        if (status != IPP_STATUS_OK) {
            lastError_ = "Failed to cancel all jobs: " + std::to_string(status);
            return false;
        }
        return true;
    }

    bool pausePrinter(const std::string& printerId) override {
        ipp_t* request = ippNewRequest(CUPS_PAUSE_PRINTER);
        ippAddString(request, IPP_TAG_OPERATION, IPP_TAG_URI, "printer-uri", nullptr,
                     (std::string("ipp://localhost/printers/") + printerId).c_str());

        ipp_t* response = cupsDoRequest(CUPS_HTTP_DEFAULT, request, "/admin/");
        if (response) {
            ippDelete(response);
            return true;
        }
        lastError_ = "Failed to pause printer";
        return false;
    }

    bool resumePrinter(const std::string& printerId) override {
        ipp_t* request = ippNewRequest(CUPS_RESUME_PRINTER);
        ippAddString(request, IPP_TAG_OPERATION, IPP_TAG_URI, "printer-uri", nullptr,
                     (std::string("ipp://localhost/printers/") + printerId).c_str());

        ipp_t* response = cupsDoRequest(CUPS_HTTP_DEFAULT, request, "/admin/");
        if (response) {
            ippDelete(response);
            return true;
        }
        lastError_ = "Failed to resume printer";
        return false;
    }

    std::string getDefaultPrinterId() override {
        cups_dest_t* dests;
        int num_dests = cupsGetDests(&dests);

        std::string defaultPrinter;
        if (num_dests > 0 && dests) {
            for (int i = 0; i < num_dests; ++i) {
                if (dests[i].is_default) {
                    defaultPrinter = dests[i].name ? dests[i].name : "";
                    break;
                }
            }
            cupsFreeDests(num_dests, dests);
        }

        return defaultPrinter;
    }

    bool setDefaultPrinter(const std::string& printerId) override {
        int result = cupsSetUserDefault(printerId.c_str());
        if (result != 0) {
            lastError_ = "Failed to set default printer";
            return false;
        }
        return true;
    }

    std::string getLastError() const override {
        if (lastError_.empty()) {
            return cupsLastErrorString();
        }
        return lastError_;
    }

private:
    bool printRawDataInternal(const std::string& printerId,
                              const std::vector<uint8_t>& data,
                              const std::string& jobName) {
        int job_id = cupsCreateJob(CUPS_HTTP_DEFAULT, printerId.c_str(),
                                   jobName.c_str(), 0, nullptr);
        if (job_id <= 0) {
            lastError_ = "Failed to create job";
            return false;
        }

        cupsStartDocument(CUPS_HTTP_DEFAULT, printerId.c_str(), job_id,
                          jobName.c_str(), CUPS_FORMAT_AUTO, 1);

        const size_t CHUNK_SIZE = 4096;
        size_t offset = 0;
        while (offset < data.size()) {
            size_t write_size = std::min(CHUNK_SIZE, data.size() - offset);
            cupsWriteRequestData(CUPS_HTTP_DEFAULT,
                                 reinterpret_cast<const char*>(data.data()) + offset,
                                 write_size);
            offset += write_size;
        }

        ipp_status_t status = cupsFinishDocument(CUPS_HTTP_DEFAULT, printerId.c_str());
        if (status != IPP_STATUS_OK) {
            lastError_ = "Failed to finish document";
            return false;
        }

        return true;
    }

    PrinterStatus convertPrinterState(int state) {
        switch (state) {
            case 3: return PrinterStatus::READY;
            case 4: return PrinterStatus::PRINTING;
            case 5: return PrinterStatus::BUSY;
            default: return PrinterStatus::UNKNOWN;
        }
    }

    PrinterStatus convertJobState(int state) {
        switch (state) {
            case 3: return PrinterStatus::READY;
            case 4: return PrinterStatus::PRINTING;
            case 5: return PrinterStatus::BUSY;
            case 6: return PrinterStatus::PAUSED;
            case 7: return PrinterStatus::READY;
            case 8: return PrinterStatus::ERROR;
            case 9: return PrinterStatus::ERROR;
            default: return PrinterStatus::UNKNOWN;
        }
    }

    std::mutex mutex_;
    bool initialized_;
    std::string lastError_;
};

}
}
