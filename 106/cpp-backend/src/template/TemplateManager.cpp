#include "printer/template/TemplateManager.h"
#include <algorithm>
#include <random>
#include <sstream>
#include <iomanip>
#include <fstream>
#include <filesystem>
#include <chrono>

namespace printer {
namespace tpl {

namespace fs = std::filesystem;

TemplateManager& TemplateManager::getInstance() {
    static TemplateManager instance;
    return instance;
}

TemplateManager::TemplateManager()
    : initialized_(false) {
}

TemplateManager::~TemplateManager() {
    shutdown();
}

void TemplateManager::initialize(const std::string& templateDir) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        return;
    }

    templateDir_ = templateDir;

    if (!fs::exists(templateDir_)) {
        fs::create_directories(templateDir_);
    }

    loadTemplates();
    initialized_ = true;
}

void TemplateManager::shutdown() {
    std::lock_guard<std::mutex> lock(mutex_);
    initialized_ = false;
}

std::string TemplateManager::generateTemplateId() {
    static std::atomic<uint64_t> counter(0);
    auto now = std::chrono::system_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 9999);

    std::ostringstream oss;
    oss << "TPL_" << timestamp << "_"
        << std::setw(4) << std::setfill('0') << (counter++ % 10000) << "_"
        << std::setw(4) << std::setfill('0') << dis(gen);
    return oss.str();
}

std::string TemplateManager::createTemplate(const PrintTemplate& templateData) {
    std::lock_guard<std::mutex> lock(mutex_);

    PrintTemplate tpl = templateData;
    tpl.id = generateTemplateId();
    tpl.createdAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    tpl.updatedAt = tpl.createdAt;
    tpl.version = 1;

    if (!validateTemplate(tpl)) {
        return "";
    }

    templates_[tpl.id] = tpl;
    saveTemplateToFile(tpl);

    return tpl.id;
}

bool TemplateManager::updateTemplate(const std::string& templateId,
                                      const PrintTemplate& templateData) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it == templates_.end()) {
        return false;
    }

    PrintTemplate tpl = templateData;
    tpl.id = templateId;
    tpl.createdAt = it->second.createdAt;
    tpl.updatedAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    tpl.version = it->second.version + 1;

    if (!validateTemplate(tpl)) {
        return false;
    }

    templates_[templateId] = tpl;
    saveTemplateToFile(tpl);

    return true;
}

bool TemplateManager::deleteTemplate(const std::string& templateId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it == templates_.end()) {
        return false;
    }

    templates_.erase(it);

    fs::path filePath = fs::path(templateDir_) / (templateId + ".json");
    if (fs::exists(filePath)) {
        fs::remove(filePath);
    }

    return true;
}

PrintTemplate TemplateManager::getTemplate(const std::string& templateId) const {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it != templates_.end()) {
        return it->second;
    }

    return PrintTemplate();
}

std::vector<PrintTemplate> TemplateManager::getAllTemplates() const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<PrintTemplate> result;
    for (const auto& pair : templates_) {
        result.push_back(pair.second);
    }

    std::sort(result.begin(), result.end(),
        [](const PrintTemplate& a, const PrintTemplate& b) {
            return a.updatedAt > b.updatedAt;
        });

    return result;
}

std::vector<PrintTemplate> TemplateManager::getTemplatesByType(
        TemplateType type) const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<PrintTemplate> result;
    for (const auto& pair : templates_) {
        if (pair.second.type == type) {
            result.push_back(pair.second);
        }
    }

    std::sort(result.begin(), result.end(),
        [](const PrintTemplate& a, const PrintTemplate& b) {
            return a.updatedAt > b.updatedAt;
        });

    return result;
}

std::string TemplateManager::renderTemplate(const std::string& templateId,
                                             const TemplateRenderOptions& options) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it == templates_.end()) {
        return "";
    }

    const auto& tpl = it->second;
    std::string result = tpl.content;

    for (const auto& field : tpl.fields) {
        std::string placeholder = "{" + field.name + "}";
        std::string value = field.defaultValue;

        auto valIt = options.fieldValues.find(field.name);
        if (valIt != options.fieldValues.end()) {
            value = valIt->second;
        }

        size_t pos = 0;
        while ((pos = result.find(placeholder, pos)) != std::string::npos) {
            result.replace(pos, placeholder.length(), value);
            pos += value.length();
        }
    }

    return result;
}

std::vector<uint8_t> TemplateManager::renderTemplateToRawData(
        const std::string& templateId,
        const TemplateRenderOptions& options) {
    std::string rendered = renderTemplate(templateId, options);
    return std::vector<uint8_t>(rendered.begin(), rendered.end());
}

bool TemplateManager::setDefaultTemplate(const std::string& templateId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it == templates_.end()) {
        return false;
    }

    TemplateType type = it->second.type;

    for (auto& pair : templates_) {
        if (pair.second.type == type) {
            pair.second.isDefault = false;
        }
    }

    it->second.isDefault = true;

    return true;
}

PrintTemplate TemplateManager::getDefaultTemplate(TemplateType type) const {
    std::lock_guard<std::mutex> lock(mutex_);

    for (const auto& pair : templates_) {
        if (pair.second.type == type && pair.second.isDefault) {
            return pair.second;
        }
    }

    for (const auto& pair : templates_) {
        if (pair.second.type == type) {
            return pair.second;
        }
    }

    return PrintTemplate();
}

bool TemplateManager::duplicateTemplate(const std::string& templateId,
                                         const std::string& newName) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it == templates_.end()) {
        return false;
    }

    PrintTemplate newTpl = it->second;
    newTpl.id = generateTemplateId();
    newTpl.name = newName;
    newTpl.createdAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    newTpl.updatedAt = newTpl.createdAt;
    newTpl.version = 1;
    newTpl.isDefault = false;

    templates_[newTpl.id] = newTpl;
    saveTemplateToFile(newTpl);

    return true;
}

bool TemplateManager::importTemplate(const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file.is_open()) {
        return false;
    }

    std::string content((std::istreambuf_iterator<char>(file)),
                         std::istreambuf_iterator<char>());
    file.close();

    PrintTemplate tpl;
    tpl.id = generateTemplateId();
    tpl.name = fs::path(filePath).stem().string();
    tpl.content = content;
    tpl.type = TemplateType::CUSTOM;
    tpl.createdAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    tpl.updatedAt = tpl.createdAt;
    tpl.version = 1;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        templates_[tpl.id] = tpl;
        saveTemplateToFile(tpl);
    }

    return true;
}

bool TemplateManager::exportTemplate(const std::string& templateId,
                                      const std::string& filePath) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = templates_.find(templateId);
    if (it == templates_.end()) {
        return false;
    }

    std::ofstream file(filePath);
    if (!file.is_open()) {
        return false;
    }

    file << it->second.content;
    file.close();

    return true;
}

bool TemplateManager::validateTemplate(const PrintTemplate& templateData) const {
    if (templateData.name.empty()) {
        return false;
    }

    if (templateData.width <= 0 || templateData.height <= 0) {
        return false;
    }

    return true;
}

int TemplateManager::batchImportTemplates(const std::string& directoryPath) {
    if (!fs::exists(directoryPath)) {
        return 0;
    }

    std::vector<std::string> supportedExtensions = {".json", ".zpl", ".epl", ".txt", ".tmpl"};
    int importedCount = 0;

    try {
        for (const auto& entry : fs::directory_iterator(directoryPath)) {
            if (!entry.is_regular_file()) continue;

            auto ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(),
                          [](unsigned char c) { return std::tolower(c); });

            bool supported = false;
            for (const auto& supportedExt : supportedExtensions) {
                if (ext == supportedExt) {
                    supported = true;
                    break;
                }
            }

            if (!supported) continue;

            if (importTemplate(entry.path().string())) {
                importedCount++;
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "Error batch importing templates: " << e.what() << std::endl;
    }

    return importedCount;
}

int TemplateManager::batchExportTemplates(const std::vector<std::string>& templateIds,
                                          const std::string& directoryPath) {
    if (!fs::exists(directoryPath)) {
        try {
            fs::create_directories(directoryPath);
        } catch (const std::exception& e) {
            std::cerr << "Failed to create export directory: " << e.what() << std::endl;
            return 0;
        }
    }

    int exportedCount = 0;

    std::lock_guard<std::mutex> lock(mutex_);

    for (const auto& templateId : templateIds) {
        auto it = templates_.find(templateId);
        if (it == templates_.end()) continue;

        const auto& tpl = it->second;

        std::string extension = ".json";
        if (tpl.type == TemplateType::BARCODE) {
            extension = ".zpl";
        }

        fs::path filePath = fs::path(directoryPath) / (tpl.name + extension);

        try {
            std::ofstream file(filePath);
            if (!file.is_open()) continue;

            file << tpl.content;
            file.close();
            exportedCount++;
        } catch (const std::exception& e) {
            std::cerr << "Error exporting template " << tpl.name << ": " << e.what() << std::endl;
        }
    }

    return exportedCount;
}

std::vector<std::string> TemplateManager::getTemplateCategories() const {
    return {"Label", "Receipt", "Report", "Barcode", "Custom"};
}

bool TemplateManager::loadTemplates() {
    if (!fs::exists(templateDir_)) {
        try {
            fs::create_directories(templateDir_);
        } catch (const std::exception& e) {
            std::cerr << "Failed to create template directory: " << e.what() << std::endl;
            return false;
        }
        return true;
    }

    std::vector<std::string> supportedExtensions = {".json", ".zpl", ".epl", ".txt", ".tmpl"};

    try {
        for (const auto& entry : fs::directory_iterator(templateDir_)) {
            if (!entry.is_regular_file()) continue;

            auto ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(),
                          [](unsigned char c) { return std::tolower(c); });

            bool supported = false;
            for (const auto& supportedExt : supportedExtensions) {
                if (ext == supportedExt) {
                    supported = true;
                    break;
                }
            }

            if (!supported) continue;

            try {
                std::ifstream file(entry.path());
                if (!file.is_open()) continue;

                std::string content((std::istreambuf_iterator<char>(file)),
                                     std::istreambuf_iterator<char>());
                file.close();

                PrintTemplate tpl;
                tpl.id = entry.path().stem().string();
                tpl.name = tpl.id;
                tpl.content = content;
                tpl.width = 100;
                tpl.height = 50;
                tpl.unit = "mm";
                tpl.dpi = 300;

                if (ext == ".zpl" || ext == ".epl") {
                    tpl.type = TemplateType::BARCODE;
                } else if (ext == ".json") {
                    tpl.type = TemplateType::CUSTOM;
                } else {
                    tpl.type = TemplateType::CUSTOM;
                }

                templates_[tpl.id] = tpl;
            } catch (const std::exception& e) {
                std::cerr << "Error loading template " << entry.path() << ": " << e.what() << std::endl;
                continue;
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "Error iterating template directory: " << e.what() << std::endl;
        return false;
    }

    return true;
}

bool TemplateManager::saveTemplates() {
    for (const auto& pair : templates_) {
        saveTemplateToFile(pair.second);
    }
    return true;
}

bool TemplateManager::saveTemplateToFile(const PrintTemplate& tpl) {
    fs::path filePath = fs::path(templateDir_) / (tpl.id + ".json");

    std::ofstream file(filePath);
    if (!file.is_open()) {
        return false;
    }

    file << tpl.content;
    file.close();

    return true;
}

}
}
