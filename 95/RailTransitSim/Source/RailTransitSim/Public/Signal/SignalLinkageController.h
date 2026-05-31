
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SignalMachine.h"
#include "SignalLinkageController.generated.h"

UENUM(BlueprintType)
enum class EInterlockPriority : uint8
{
    Occupancy,
    Route,
    Switch,
    Signal,
    Count
};

USTRUCT(BlueprintType)
struct FSignalRoute
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RouteId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<ASignalMachine*> EntrySignals;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<ATrackSegment*> TrackSections;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<ASignalMachine*> ExitSignals;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsActive;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsLocked;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Priority;

    FSignalRoute()
        : bIsActive(false)
        , bIsLocked(false)
        , Priority(0)
    {
    }
};

USTRUCT()
struct FInterlockCheckResult
{
    GENERATED_BODY()

    UPROPERTY()
    bool bPassed;

    UPROPERTY()
    FString FailedCheck;

    UPROPERTY()
    FString Details;

    FInterlockCheckResult()
        : bPassed(true)
    {
    }
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRouteSet, const FString&, RouteId, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRouteCleared, const FString&, RouteId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSignalForcedByInterlock, ASignalMachine*, Signal, ESignalAspect, ForcedAspect);

UCLASS()
class RAILTRANSITSIM_API USignalLinkageController : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interlock")
    float SignalPropagationOrder;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interlock")
    bool bEnableStrictInterlock;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interlock")
    bool bAutoUpdateAllSignalsOnOccupancy;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interlock")
    float OccupancyClearDelaySeconds;

    UPROPERTY()
    TArray<ASignalMachine*> AllSignals;

    UPROPERTY()
    TArray<FSignalRoute> DefinedRoutes;

    UPROPERTY()
    TMap<FString, ASignalMachine*> SignalIdMap;

    UPROPERTY()
    TMap<ATrackSegment*, TArray<ASignalMachine*>> SectionToSignalsMap;

    UPROPERTY()
    TMap<ATrackSegment*, double> SectionOccupancyTimestamps;

    UPROPERTY(BlueprintAssignable, Category = "Interlock|Events")
    FOnRouteSet OnRouteSet;

    UPROPERTY(BlueprintAssignable, Category = "Interlock|Events")
    FOnRouteCleared OnRouteCleared;

    UPROPERTY(BlueprintAssignable, Category = "Interlock|Events")
    FOnSignalForcedByInterlock OnSignalForcedByInterlock;

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void RegisterSignal(ASignalMachine* Signal);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void UnregisterSignal(ASignalMachine* Signal);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void BuildSignalChain();

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void UpdateAllLinkages();

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    bool SetRoute(const FString& RouteId);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void ClearRoute(const FString& RouteId);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    ASignalMachine* FindSignalById(const FString& SignalId);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void HandleTrainApproaching(ASignalMachine* Signal);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void HandleTrainPassed(ASignalMachine* Signal);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void HandleTrainOccupyingSection(ATrackSegment* Section);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void HandleTrainClearingSection(ATrackSegment* Section);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void EmergencyStopAll();

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    FInterlockCheckResult CheckInterlockConditions(const FString& RouteId);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void DefineRoute(const FSignalRoute& Route);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void UpdateSignalChainFromExit(ASignalMachine* StartingSignal, bool bForward);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    bool IsSectionOccupied(ATrackSegment* Section);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    TArray<FString> GetConflictingRoutes(const FString& RouteId);

    UFUNCTION(BlueprintCallable, Category = "Interlock")
    void TickInterlock(float DeltaTime);

private:
    UPROPERTY()
    TSet<ATrackSegment*> OccupiedSections;

    UPROPERTY()
    TMap<FString, int32> LastUpdatedSignalSequences;

    int32 GlobalSignalStateVersion;

    void ProcessDelayedOccupancyClear(float DeltaTime);

    void UpdateSignalBasedOnOccupancy(ATrackSegment* Section);
    ESignalAspect DetermineAspectForSignal(ASignalMachine* Signal);
    bool CheckRouteConditionsForSignal(ASignalMachine* Signal);

    void PropagateSignalState(ASignalMachine* Signal, bool bForceRed = false);
    void UpdateSignalsForSection(ATrackSegment* Section);

    void UpdatePreviousSignals(ASignalMachine* ChangedSignal);
    void ForceSignalToRed(ASignalMachine* Signal, const FString& Reason);

    bool CheckSwitchPositionsForRoute(const FSignalRoute& Route);
    bool CheckSectionOccupancyForRoute(const FSignalRoute& Route);
    bool CheckSignalConflictsForRoute(const FSignalRoute& Route);
    bool CheckRouteConflictsForRoute(const FSignalRoute& Route);

    bool CheckNoConflictingRoutes(const FSignalRoute& Route);
    void LockRoute(const FSignalRoute& Route);
    void UnlockRoute(const FSignalRoute& Route);

    void DebugPrintSignalChain();

public:
    UFUNCTION(BlueprintCallable, Category = "Interlock|FaultSimulation")
    void InjectSignalFault(const FString& SignalId, ESignalFaultType FaultType, float Duration = 0.0f);

    UFUNCTION(BlueprintCallable, Category = "Interlock|FaultSimulation")
    void ClearSignalFault(const FString& SignalId);

    UFUNCTION(BlueprintCallable, Category = "Interlock|FaultSimulation")
    void ClearAllSignalFaults();

    UFUNCTION(BlueprintCallable, Category = "Interlock|FaultSimulation")
    void InjectRandomFault(int32 FaultCount = 1, float MinDuration = 10.0f, float MaxDuration = 60.0f);

    UFUNCTION(BlueprintCallable, Category = "Interlock|FaultSimulation")
    TArray<FString> GetFaultedSignalIds() const;

    UFUNCTION(BlueprintCallable, Category = "Interlock|FaultSimulation")
    int32 GetFaultedSignalCount() const;
};
