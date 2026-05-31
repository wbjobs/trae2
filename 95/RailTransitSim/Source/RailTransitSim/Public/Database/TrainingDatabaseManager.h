
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Network/NetworkMessageProtocol.h"
#include "sqlite3.h"
#include "TrainingDatabaseManager.generated.h"

USTRUCT(BlueprintType)
struct FTrainingScore
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ClientId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SessionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TotalScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SignalComplianceScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SpeedComplianceScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ScheduleAdherenceScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SafetyScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CommunicationScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TotalViolations;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TrainingDurationSeconds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FDateTime StartTime;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FDateTime EndTime;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> PenaltyDetails;
};

USTRUCT(BlueprintType)
struct FTrainingScoreRule
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RuleId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Category;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PenaltyPoints;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BonusPoints;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bCriticalViolation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Weight;
};

USTRUCT(BlueprintType)
struct FStudentProfile
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StudentName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Role;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Department;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TrainingLevel;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float AverageScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 TotalTrainingHours;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 CompletedSessions;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> Certifications;
};

USTRUCT(BlueprintType)
struct FCleanupStatistics
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 InvalidScoresRemoved;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 InvalidRecordsRemoved;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ExpiredScoresRemoved;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ExpiredRecordsRemoved;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 OrphanedRecordsRemoved;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 DatabaseSizeBeforeBytes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int64 DatabaseSizeAfterBytes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bVacuumExecuted;

    FCleanupStatistics()
        : InvalidScoresRemoved(0)
        , InvalidRecordsRemoved(0)
        , ExpiredScoresRemoved(0)
        , ExpiredRecordsRemoved(0)
        , OrphanedRecordsRemoved(0)
        , DatabaseSizeBeforeBytes(0)
        , DatabaseSizeAfterBytes(0)
        , bVacuumExecuted(false)
    {}
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnTrainingScoreCalculated, const FTrainingScore&, Score);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnViolationDetected, const FClientOperationRecord&, Violation);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDatabaseOperationComplete, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDatabaseCleanupComplete, const FCleanupStatistics&, Stats);

UCLASS()
class RAILTRANSITSIM_API UTrainingDatabaseManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Database")
    FString DatabasePath;

    UPROPERTY(BlueprintReadOnly, Category = "Database")
    bool bIsConnected;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Scoring")
    float MaxTotalScore;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Scoring")
    TMap<FString, FTrainingScoreRule> ScoringRules;

    UPROPERTY(BlueprintReadOnly, Category = "Scoring")
    TMap<FString, FTrainingScore> ActiveScores;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Database|Cleanup")
    int32 DataRetentionDays;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Database|Cleanup")
    bool bAutoVacuumAfterCleanup;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Database|Cleanup")
    float MinValidTrainingDurationSeconds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Database|Cleanup")
    float MaxValidTrainingDurationHours;

    UPROPERTY(BlueprintAssignable, Category = "Database|Events")
    FOnTrainingScoreCalculated OnScoreCalculated;

    UPROPERTY(BlueprintAssignable, Category = "Database|Events")
    FOnViolationDetected OnViolationDetected;

    UPROPERTY(BlueprintAssignable, Category = "Database|Events")
    FOnDatabaseOperationComplete OnDatabaseOperationComplete;

    UPROPERTY(BlueprintAssignable, Category = "Database|Events")
    FOnDatabaseCleanupComplete OnDatabaseCleanupComplete;

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool ConnectToDatabase(const FString& DbPath);

    UFUNCTION(BlueprintCallable, Category = "Database")
    void DisconnectDatabase();

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool InitializeDatabaseTables();

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool SaveTrainingScore(const FTrainingScore& Score);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool LoadTrainingScore(const FString& SessionId, FTrainingScore& OutScore);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool SaveOperationRecord(const FClientOperationRecord& Record);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool LoadOperationRecords(const FString& SessionId, TArray<FClientOperationRecord>& OutRecords);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool SaveStudentProfile(const FStudentProfile& Profile);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool LoadStudentProfile(const FString& StudentId, FStudentProfile& OutProfile);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool LoadAllStudentProfiles(TArray<FStudentProfile>& OutProfiles);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool LoadTrainingScoresForStudent(const FString& StudentId, TArray<FTrainingScore>& OutScores);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void InitializeScoringRules();

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    float CalculateTrainingScore(const FString& ClientId, const FString& SessionId);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void RecordOperationAndEvaluate(const FClientOperationRecord& Record);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void EvaluateSignalViolation(const FClientOperationRecord& Record, FTrainingScore& Score);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void EvaluateSpeedViolation(const FClientOperationRecord& Record, FTrainingScore& Score);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void EvaluateScheduleViolation(const FClientOperationRecord& Record, FTrainingScore& Score);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void EvaluateSafetyViolation(const FClientOperationRecord& Record, FTrainingScore& Score);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    void ApplyBonusPoints(const FString& ClientId, const FString& RuleId, const FString& Reason);

    UFUNCTION(BlueprintPure, Category = "Scoring")
    FTrainingScore GetCurrentScore(const FString& ClientId);

    UFUNCTION(BlueprintCallable, Category = "Scoring")
    FTrainingScore FinalizeTrainingScore(const FString& ClientId, const FString& SessionId);

    UFUNCTION(BlueprintCallable, Category = "Database")
    bool ExportTrainingReport(const FString& SessionId, const FString& ExportPath);

    UFUNCTION(BlueprintPure, Category = "Database")
    bool IsDatabaseConnected() const { return bIsConnected && Database != nullptr; }

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    FCleanupStatistics PerformFullCleanup();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    FCleanupStatistics RemoveInvalidData();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    FCleanupStatistics RemoveExpiredData(int32 OlderThanDays = -1);

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    FCleanupStatistics RemoveOrphanedRecords();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    bool VacuumDatabase();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    int64 GetDatabaseSizeBytes();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    int32 GetTotalScoreCount();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    int32 GetTotalRecordCount();

    UFUNCTION(BlueprintCallable, Category = "Database|Cleanup")
    FString GetCleanupReport(const FCleanupStatistics& Stats);

private:
    sqlite3* Database;
    TArray<FClientOperationRecord> PendingRecords;

    bool ExecuteQuery(const FString& Query);
    bool ExecuteQueryWithCallback(const FString& Query, int (*Callback)(void*, int, char**, char**), void* UserData);
    int32 ExecuteScalarInt(const FString& Query);

    FString EscapeString(const FString& Input);

    void LoadScoringRulesFromDatabase();

    static int LoadScoreCallback(void* Data, int Argc, char** Argv, char** AzColName);
    static int LoadRecordsCallback(void* Data, int Argc, char** Argv, char** AzColName);
    static int LoadStudentProfileCallback(void* Data, int Argc, char** Argv, char** AzColName);
    static int LoadTrainingScoresCallback(void* Data, int Argc, char** Argv, char** AzColName);
    static int LoadAllProfilesCallback(void* Data, int Argc, char** Argv, char** AzColName);
    static int ScalarIntCallback(void* Data, int Argc, char** Argv, char** AzColName);

    float CalculateSignalCompliance(const FString& ClientId);
    float CalculateSpeedCompliance(const FString& ClientId);
    float CalculateScheduleAdherence(const FString& ClientId);
    float CalculateSafetyScore(const FString& ClientId);
    float CalculateCommunicationScore(const FString& ClientId);

    void MergeStatistics(FCleanupStatistics& Dest, const FCleanupStatistics& Src);
};
