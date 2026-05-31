#pragma once

#include "printer/platform/IPlatform.h"
#include "printer/driver/IDriverAdapter.h"
#include <string>
#include <vector>
#include <queue>
#include <memory>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <atomic>
#include <functional>
#include <map>
#include <cstdint>

namespace printer {
namespace task {

enum class TaskPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    URGENT = 3
};

enum class TaskStatus {
    PENDING,
    QUEUED,
    PROCESSING,
    COMPLETED,
    FAILED,
    CANCELLED,
    PAUSED
};

struct PrintTask {
    std::string id;
    std::string printerId;
    std::string documentName;
    std::string filePath;
    std::vector<uint8_t> rawData;
    driver::PrintSettings settings;
    TaskPriority priority;
    TaskStatus status;
    int64_t createdAt;
    int64_t startedAt;
    int64_t completedAt;
    uint32_t progress;
    std::string errorMessage;
    int retryCount;
    int maxRetries;

    bool useRawData;
};

class TaskQueue {
public:
    static TaskQueue& getInstance();

    using TaskCallback = std::function<void(const PrintTask&)>;

    void initialize(std::shared_ptr<platform::IPlatform> platform);
    void shutdown();

    std::string addFileTask(const std::string& printerId,
                           const std::string& filePath,
                           const std::string& documentName,
                           const driver::PrintSettings& settings,
                           TaskPriority priority = TaskPriority::NORMAL);

    std::string addRawDataTask(const std::string& printerId,
                              const std::vector<uint8_t>& data,
                              const std::string& documentName,
                              const driver::PrintSettings& settings,
                              TaskPriority priority = TaskPriority::NORMAL);

    bool cancelTask(const std::string& taskId);
    bool pauseTask(const std::string& taskId);
    bool resumeTask(const std::string& taskId);
    bool setTaskPriority(const std::string& taskId, TaskPriority priority);
    PrintTask getTaskStatus(const std::string& taskId);

    std::vector<PrintTask> getActiveTasks();
    std::vector<PrintTask> getCompletedTasks(int maxCount = 100);
    std::vector<PrintTask> getTasksByPrinter(const std::string& printerId);
    std::vector<PrintTask> getTasksSortedByPriority();

    void setTaskStatusCallback(TaskCallback callback);
    void setTaskProgressCallback(TaskCallback callback);

    bool processNextTask();
    size_t getQueueSize() const;
    void clearCompletedTasks();
    void setMaxConcurrentTasks(size_t maxConcurrent);
    size_t getMaxConcurrentTasks() const;

private:
    TaskQueue();
    ~TaskQueue();
    TaskQueue(const TaskQueue&) = delete;
    TaskQueue& operator=(const TaskQueue&) = delete;

    void workerThread();
    bool executeTask(PrintTask& task);
    std::string generateTaskId();
    void notifyStatusChange(const PrintTask& task);
    void notifyProgressChange(const PrintTask& task);

    std::shared_ptr<platform::IPlatform> platform_;

    struct TaskComparator {
        bool operator()(const std::shared_ptr<PrintTask>& a,
                        const std::shared_ptr<PrintTask>& b) const {
            if (static_cast<int>(a->priority) != static_cast<int>(b->priority)) {
                return static_cast<int>(a->priority) < static_cast<int>(b->priority);
            }
            return a->createdAt > b->createdAt;
        }
    };

    std::priority_queue<std::shared_ptr<PrintTask>,
                        std::vector<std::shared_ptr<PrintTask>>,
                        TaskComparator> queue_;

    std::map<std::string, std::shared_ptr<PrintTask>> allTasks_;
    std::vector<std::shared_ptr<PrintTask>> completedTasks_;

    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::thread worker_;
    std::atomic<bool> running_;

    TaskCallback statusCallback_;
    TaskCallback progressCallback_;

    size_t maxCompletedTasks_;
    size_t maxConcurrentTasks_;
    std::map<std::string, bool> printerBusy_;
};

}
}
