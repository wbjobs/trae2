#include "printer/task/TaskQueue.h"
#include <chrono>
#include <random>
#include <sstream>
#include <iomanip>

namespace printer {
namespace task {

TaskQueue& TaskQueue::getInstance() {
    static TaskQueue instance;
    return instance;
}

TaskQueue::TaskQueue()
    : platform_(nullptr)
    , running_(false)
    , maxCompletedTasks_(1000)
    , maxConcurrentTasks_(3) {
}

TaskQueue::~TaskQueue() {
    shutdown();
}

void TaskQueue::initialize(std::shared_ptr<platform::IPlatform> platform) {
    std::lock_guard<std::mutex> lock(mutex_);
    platform_ = platform;

    if (!running_) {
        running_ = true;
        worker_ = std::thread(&TaskQueue::workerThread, this);
    }
}

void TaskQueue::shutdown() {
    running_ = false;
    cv_.notify_all();

    if (worker_.joinable()) {
        worker_.join();
    }
}

std::string TaskQueue::generateTaskId() {
    static std::atomic<uint64_t> counter(0);
    auto now = std::chrono::system_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 9999);

    std::ostringstream oss;
    oss << "TASK_" << timestamp << "_"
        << std::setw(4) << std::setfill('0') << (counter++ % 10000) << "_"
        << std::setw(4) << std::setfill('0') << dis(gen);
    return oss.str();
}

std::string TaskQueue::addFileTask(const std::string& printerId,
                                    const std::string& filePath,
                                    const std::string& documentName,
                                    const driver::PrintSettings& settings,
                                    TaskPriority priority) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto task = std::make_shared<PrintTask>();
    task->id = generateTaskId();
    task->printerId = printerId;
    task->filePath = filePath;
    task->documentName = documentName.empty() ? "Print Job" : documentName;
    task->settings = settings;
    task->priority = priority;
    task->status = TaskStatus::QUEUED;
    task->createdAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    task->progress = 0;
    task->retryCount = 0;
    task->maxRetries = 3;
    task->useRawData = false;

    allTasks_[task->id] = task;
    queue_.push(task);
    cv_.notify_one();

    return task->id;
}

std::string TaskQueue::addRawDataTask(const std::string& printerId,
                                       const std::vector<uint8_t>& data,
                                       const std::string& documentName,
                                       const driver::PrintSettings& settings,
                                       TaskPriority priority) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto task = std::make_shared<PrintTask>();
    task->id = generateTaskId();
    task->printerId = printerId;
    task->rawData = data;
    task->documentName = documentName.empty() ? "Print Job" : documentName;
    task->settings = settings;
    task->priority = priority;
    task->status = TaskStatus::QUEUED;
    task->createdAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    task->progress = 0;
    task->retryCount = 0;
    task->maxRetries = 3;
    task->useRawData = true;

    allTasks_[task->id] = task;
    queue_.push(task);
    cv_.notify_one();

    return task->id;
}

bool TaskQueue::cancelTask(const std::string& taskId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = allTasks_.find(taskId);
    if (it == allTasks_.end()) {
        return false;
    }

    auto& task = it->second;
    if (task->status == TaskStatus::PROCESSING) {
        platform_->cancelAllJobs(task->printerId);
    }

    task->status = TaskStatus::CANCELLED;
    task->completedAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    notifyStatusChange(*task);
    return true;
}

bool TaskQueue::pauseTask(const std::string& taskId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = allTasks_.find(taskId);
    if (it == allTasks_.end()) {
        return false;
    }

    auto& task = it->second;
    if (task->status == TaskStatus::QUEUED || task->status == TaskStatus::PROCESSING) {
        task->status = TaskStatus::PAUSED;
        notifyStatusChange(*task);
        return true;
    }

    return false;
}

bool TaskQueue::resumeTask(const std::string& taskId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = allTasks_.find(taskId);
    if (it == allTasks_.end()) {
        return false;
    }

    auto& task = it->second;
    if (task->status == TaskStatus::PAUSED) {
        task->status = TaskStatus::QUEUED;
        queue_.push(task);
        cv_.notify_one();
        notifyStatusChange(*task);
        return true;
    }

    return false;
}

PrintTask TaskQueue::getTaskStatus(const std::string& taskId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = allTasks_.find(taskId);
    if (it != allTasks_.end()) {
        return *it->second;
    }

    return PrintTask();
}

std::vector<PrintTask> TaskQueue::getActiveTasks() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PrintTask> result;

    for (const auto& pair : allTasks_) {
        if (pair.second->status == TaskStatus::QUEUED ||
            pair.second->status == TaskStatus::PROCESSING ||
            pair.second->status == TaskStatus::PAUSED) {
            result.push_back(*pair.second);
        }
    }

    return result;
}

std::vector<PrintTask> TaskQueue::getCompletedTasks(int maxCount) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PrintTask> result;

    int count = 0;
    for (auto it = completedTasks_.rbegin();
         it != completedTasks_.rend() && count < maxCount;
         ++it, ++count) {
        result.push_back(**it);
    }

    return result;
}

std::vector<PrintTask> TaskQueue::getTasksByPrinter(const std::string& printerId) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PrintTask> result;

    for (const auto& pair : allTasks_) {
        if (pair.second->printerId == printerId) {
            result.push_back(*pair.second);
        }
    }

    return result;
}

void TaskQueue::setTaskStatusCallback(TaskCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    statusCallback_ = callback;
}

void TaskQueue::setTaskProgressCallback(TaskCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    progressCallback_ = callback;
}

void TaskQueue::notifyStatusChange(const PrintTask& task) {
    if (statusCallback_) {
        statusCallback_(task);
    }
}

void TaskQueue::notifyProgressChange(const PrintTask& task) {
    if (progressCallback_) {
        progressCallback_(task);
    }
}

size_t TaskQueue::getQueueSize() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.size();
}

void TaskQueue::clearCompletedTasks() {
    std::lock_guard<std::mutex> lock(mutex_);

    for (auto it = allTasks_.begin(); it != allTasks_.end(); ) {
        if (it->second->status == TaskStatus::COMPLETED ||
            it->second->status == TaskStatus::FAILED ||
            it->second->status == TaskStatus::CANCELLED) {
            it = allTasks_.erase(it);
        } else {
            ++it;
        }
    }

    completedTasks_.clear();
}

void TaskQueue::workerThread() {
    while (running_) {
        std::unique_lock<std::mutex> lock(mutex_);

        cv_.wait(lock, [this] {
            return !queue_.empty() || !running_;
        });

        if (!running_) {
            break;
        }

        size_t activeCount = 0;
        for (const auto& pair : allTasks_) {
            if (pair.second->status == TaskStatus::PROCESSING) {
                activeCount++;
            }
        }

        while (!queue_.empty() && activeCount < maxConcurrentTasks_) {
            auto task = queue_.top();
            queue_.pop();

            if (task->status != TaskStatus::QUEUED) {
                continue;
            }

            auto busyIt = printerBusy_.find(task->printerId);
            if (busyIt != printerBusy_.end() && busyIt->second) {
                std::vector<std::shared_ptr<PrintTask>> skipped;
                skipped.push_back(task);

                bool found = false;
                while (!queue_.empty() && !found) {
                    auto nextTask = queue_.top();
                    queue_.pop();

                    if (nextTask->status != TaskStatus::QUEUED) {
                        continue;
                    }

                    auto nextBusyIt = printerBusy_.find(nextTask->printerId);
                    if (nextBusyIt == printerBusy_.end() || !nextBusyIt->second) {
                        printerBusy_[nextTask->printerId] = true;
                        lock.unlock();
                        executeTask(*nextTask);
                        lock.lock();
                        activeCount++;
                        found = true;
                    } else {
                        skipped.push_back(nextTask);
                    }
                }

                for (auto& skippedTask : skipped) {
                    queue_.push(skippedTask);
                }

                if (!found) {
                    queue_.push(task);
                    break;
                }
                continue;
            }

            printerBusy_[task->printerId] = true;
            lock.unlock();
            executeTask(*task);
            lock.lock();
            activeCount++;
        }
    }
}

bool TaskQueue::executeTask(PrintTask& task) {
    task.status = TaskStatus::PROCESSING;
    task.startedAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    notifyStatusChange(task);

    task.progress = 10;
    notifyProgressChange(task);

    bool success = false;
    std::string errorMsg;

    try {
        auto driver = driver::DriverManager::getInstance().getAdapterByPrinterId(
            task.printerId, platform_);

        task.progress = 30;
        notifyProgressChange(task);

        if (task.useRawData) {
            success = driver->printRawData(task.rawData, task.settings, task.documentName);
        } else {
            success = driver->printFile(task.filePath, task.settings, task.documentName);
        }

        task.progress = 80;
        notifyProgressChange(task);

        if (!success) {
            errorMsg = driver->getLastError();
        }
    } catch (const std::exception& e) {
        errorMsg = e.what();
        success = false;
    }

    task.progress = 100;
    notifyProgressChange(task);

    if (success) {
        task.status = TaskStatus::COMPLETED;
    } else {
        if (task.retryCount < task.maxRetries) {
            task.retryCount++;
            task.status = TaskStatus::QUEUED;
            {
                std::lock_guard<std::mutex> lock(mutex_);
                queue_.push(allTasks_[task.id]);
            }
            cv_.notify_one();
            return false;
        }

        task.status = TaskStatus::FAILED;
        task.errorMessage = errorMsg;
    }

    task.completedAt = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    {
        std::lock_guard<std::mutex> lock(mutex_);
        completedTasks_.push_back(allTasks_[task.id]);
        if (completedTasks_.size() > maxCompletedTasks_) {
            completedTasks_.erase(completedTasks_.begin());
        }
        printerBusy_[task.printerId] = false;
        cv_.notify_one();
    }

    notifyStatusChange(task);
    return success;
}

bool TaskQueue::processNextTask() {
    std::unique_lock<std::mutex> lock(mutex_);

    if (queue_.empty()) {
        return false;
    }

    auto task = queue_.top();
    queue_.pop();

    if (task->status != TaskStatus::QUEUED) {
        return false;
    }

    lock.unlock();
    return executeTask(*task);
}

bool TaskQueue::setTaskPriority(const std::string& taskId, TaskPriority priority) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = allTasks_.find(taskId);
    if (it == allTasks_.end()) {
        return false;
    }

    auto& task = it->second;
    if (task->status != TaskStatus::QUEUED) {
        return false;
    }

    task->priority = priority;
    notifyStatusChange(*task);
    return true;
}

std::vector<PrintTask> TaskQueue::getTasksSortedByPriority() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PrintTask> result;

    for (const auto& pair : allTasks_) {
        result.push_back(*pair.second);
    }

    std::sort(result.begin(), result.end(),
        [](const PrintTask& a, const PrintTask& b) {
            if (static_cast<int>(a.priority) != static_cast<int>(b.priority)) {
                return static_cast<int>(a.priority) > static_cast<int>(b.priority);
            }
            return a.createdAt < b.createdAt;
        });

    return result;
}

void TaskQueue::setMaxConcurrentTasks(size_t maxConcurrent) {
    std::lock_guard<std::mutex> lock(mutex_);
    maxConcurrentTasks_ = maxConcurrent > 0 ? maxConcurrent : 1;
    cv_.notify_one();
}

size_t TaskQueue::getMaxConcurrentTasks() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return maxConcurrentTasks_;
}

}
}
