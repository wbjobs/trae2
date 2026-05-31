#include <napi.h>
#include "printer/platform/IPlatform.h"

using namespace printer::platform;

Napi::Value StatusToNapi(Napi::Env env, PrinterStatus status) {
    switch (status) {
        case PrinterStatus::UNKNOWN: return Napi::String::New(env, "unknown");
        case PrinterStatus::READY: return Napi::String::New(env, "ready");
        case PrinterStatus::BUSY: return Napi::String::New(env, "busy");
        case PrinterStatus::PRINTING: return Napi::String::New(env, "printing");
        case PrinterStatus::PAUSED: return Napi::String::New(env, "paused");
        case PrinterStatus::ERROR: return Napi::String::New(env, "error");
        case PrinterStatus::OFFLINE: return Napi::String::New(env, "offline");
        case PrinterStatus::PAPER_OUT: return Napi::String::New(env, "paper_out");
        case PrinterStatus::COVER_OPEN: return Napi::String::New(env, "cover_open");
        case PrinterStatus::JAMMED: return Napi::String::New(env, "jammed");
        default: return Napi::String::New(env, "unknown");
    }
}

Napi::Object PrinterInfoToNapi(Napi::Env env, const PrinterInfo& info) {
    auto obj = Napi::Object::New(env);
    obj.Set("id", Napi::String::New(env, info.id));
    obj.Set("name", Napi::String::New(env, info.name));
    obj.Set("model", Napi::String::New(env, info.model));
    obj.Set("manufacturer", Napi::String::New(env, info.manufacturer));
    obj.Set("port", Napi::String::New(env, info.port));
    obj.Set("isDefault", Napi::Boolean::New(env, info.isDefault));
    obj.Set("status", StatusToNapi(env, info.status));
    obj.Set("jobCount", Napi::Number::New(env, info.jobCount));
    return obj;
}

Napi::Object JobInfoToNapi(Napi::Env env, const JobInfo& info) {
    auto obj = Napi::Object::New(env);
    obj.Set("id", Napi::String::New(env, info.id));
    obj.Set("printerId", Napi::String::New(env, info.printerId));
    obj.Set("documentName", Napi::String::New(env, info.documentName));
    obj.Set("userName", Napi::String::New(env, info.userName));
    obj.Set("totalPages", Napi::Number::New(env, info.totalPages));
    obj.Set("printedPages", Napi::Number::New(env, info.printedPages));
    obj.Set("sizeBytes", Napi::Number::New(env, info.sizeBytes));
    obj.Set("submittedTime", Napi::Number::New(env, info.submittedTime));
    obj.Set("status", StatusToNapi(env, info.status));
    return obj;
}

class PlatformWrapper : public Napi::ObjectWrap<PlatformWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::HandleScope scope(env);

        Napi::Function func = DefineClass(env, "Platform", {
            InstanceMethod("initialize", &PlatformWrapper::Initialize),
            InstanceMethod("shutdown", &PlatformWrapper::Shutdown),
            InstanceMethod("enumeratePrinters", &PlatformWrapper::EnumeratePrinters),
            InstanceMethod("getPrinterInfo", &PlatformWrapper::GetPrinterInfo),
            InstanceMethod("printFile", &PlatformWrapper::PrintFile),
            InstanceMethod("printRawData", &PlatformWrapper::PrintRawData),
            InstanceMethod("getActiveJobs", &PlatformWrapper::GetActiveJobs),
            InstanceMethod("cancelJob", &PlatformWrapper::CancelJob),
            InstanceMethod("cancelAllJobs", &PlatformWrapper::CancelAllJobs),
            InstanceMethod("pausePrinter", &PlatformWrapper::PausePrinter),
            InstanceMethod("resumePrinter", &PlatformWrapper::ResumePrinter),
            InstanceMethod("getDefaultPrinterId", &PlatformWrapper::GetDefaultPrinterId),
            InstanceMethod("setDefaultPrinter", &PlatformWrapper::SetDefaultPrinter),
            InstanceMethod("getLastError", &PlatformWrapper::GetLastError)
        });

        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();

        exports.Set("Platform", func);
        return exports;
    }

    PlatformWrapper(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<PlatformWrapper>(info) {
        platform_ = createPlatform();
    }

    ~PlatformWrapper() {
        if (platform_) {
            destroyPlatform(platform_);
        }
    }

private:
    static Napi::FunctionReference constructor;
    IPlatform* platform_;

    Napi::Value Initialize(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        bool result = platform_->initialize();
        return Napi::Boolean::New(env, result);
    }

    Napi::Value Shutdown(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        bool result = platform_->shutdown();
        return Napi::Boolean::New(env, result);
    }

    Napi::Value EnumeratePrinters(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        auto printers = platform_->enumeratePrinters();
        auto result = Napi::Array::New(env, printers.size());
        for (size_t i = 0; i < printers.size(); ++i) {
            result.Set(i, PrinterInfoToNapi(env, printers[i]));
        }
        return result;
    }

    Napi::Value GetPrinterInfo(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        auto printerInfo = platform_->getPrinterInfo(printerId);
        return PrinterInfoToNapi(env, printerInfo);
    }

    Napi::Value PrintFile(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        std::string filePath = info[1].As<Napi::String>().Utf8Value();
        std::string jobName = info.Length() > 2 ? info[2].As<Napi::String>().Utf8Value() : "";
        bool result = platform_->printFile(printerId, filePath, jobName);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value PrintRawData(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        auto buffer = info[1].As<Napi::Uint8Array>();
        std::string jobName = info.Length() > 2 ? info[2].As<Napi::String>().Utf8Value() : "";

        std::vector<uint8_t> data(buffer.Data(), buffer.Data() + buffer.ByteLength());
        bool result = platform_->printRawData(printerId, data, jobName);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value GetActiveJobs(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        auto jobs = platform_->getActiveJobs(printerId);
        auto result = Napi::Array::New(env, jobs.size());
        for (size_t i = 0; i < jobs.size(); ++i) {
            result.Set(i, JobInfoToNapi(env, jobs[i]));
        }
        return result;
    }

    Napi::Value CancelJob(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        std::string jobId = info[1].As<Napi::String>().Utf8Value();
        bool result = platform_->cancelJob(printerId, jobId);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value CancelAllJobs(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        bool result = platform_->cancelAllJobs(printerId);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value PausePrinter(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        bool result = platform_->pausePrinter(printerId);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value ResumePrinter(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        bool result = platform_->resumePrinter(printerId);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value GetDefaultPrinterId(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string id = platform_->getDefaultPrinterId();
        return Napi::String::New(env, id);
    }

    Napi::Value SetDefaultPrinter(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string printerId = info[0].As<Napi::String>().Utf8Value();
        bool result = platform_->setDefaultPrinter(printerId);
        return Napi::Boolean::New(env, result);
    }

    Napi::Value GetLastError(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        std::string error = platform_->getLastError();
        return Napi::String::New(env, error);
    }
};

Napi::FunctionReference PlatformWrapper::constructor;

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    PlatformWrapper::Init(env, exports);
    return exports;
}

NODE_API_MODULE(printer_backend, InitAll)
