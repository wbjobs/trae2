#pragma once

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <mutex>
#include <cstdint>

namespace printer {
namespace tpl {

enum class TemplateType {
    LABEL,
    RECEIPT,
    REPORT,
    BARCODE,
    CUSTOM
};

struct TemplateField {
    std::string name;
    std::string type;
    int x;
    int y;
    int width;
    int height;
    std::string defaultValue;
    std::map<std::string, std::string> properties;
};

struct PrintTemplate {
    std::string id;
    std::string name;
    std::string description;
    TemplateType type;
    int width;
    int height;
    std::string unit;
    int dpi;
    std::vector<TemplateField> fields;
    std::string content;
    int64_t createdAt;
    int64_t updatedAt;
    int version;
    std::string author;
    bool isDefault;
    std::map<std::string, std::string> metadata;
};

struct TemplateRenderOptions {
    std::map<std::string, std::string> fieldValues;
    int copies;
    bool rotate;
    int scale;
    std::string outputFormat;
};

class TemplateManager {
public:
    static TemplateManager& getInstance();

    void initialize(const std::string& templateDir);
    void shutdown();

    std::string createTemplate(const PrintTemplate& templateData);
    bool updateTemplate(const std::string& templateId,
                       const PrintTemplate& templateData);
    bool deleteTemplate(const std::string& templateId);
    PrintTemplate getTemplate(const std::string& templateId) const;

    std::vector<PrintTemplate> getAllTemplates() const;
    std::vector<PrintTemplate> getTemplatesByType(TemplateType type) const;

    std::string renderTemplate(const std::string& templateId,
                              const TemplateRenderOptions& options);
    std::vector<uint8_t> renderTemplateToRawData(
        const std::string& templateId,
        const TemplateRenderOptions& options);

    bool setDefaultTemplate(const std::string& templateId);
    PrintTemplate getDefaultTemplate(TemplateType type) const;

    bool duplicateTemplate(const std::string& templateId,
                          const std::string& newName);
    bool importTemplate(const std::string& filePath);
    bool exportTemplate(const std::string& templateId,
                       const std::string& filePath);

    int batchImportTemplates(const std::string& directoryPath);
    int batchExportTemplates(const std::vector<std::string>& templateIds,
                            const std::string& directoryPath);

    bool validateTemplate(const PrintTemplate& templateData) const;

    std::vector<std::string> getTemplateCategories() const;

private:
    TemplateManager();
    ~TemplateManager();
    TemplateManager(const TemplateManager&) = delete;
    TemplateManager& operator=(const TemplateManager&) = delete;

    std::string generateTemplateId();
    bool loadTemplates();
    bool saveTemplates();
    bool saveTemplateToFile(const PrintTemplate& tpl);

    std::string templateDir_;
    std::map<std::string, PrintTemplate> templates_;
    mutable std::mutex mutex_;
    bool initialized_;
};

}
}
