
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TrainPawn.h"
#include "DispatchRuleEngine.generated.h"

UENUM(BlueprintType)
enum class EDispatchCommand : uint8
{
    Dispatch,
    Hold,
    Terminate,
    ChangeRoute,
    EmergencyStop
};

USTRUCT(BlueprintType)
struct FDispatchOrder
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString OrderId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EDispatchCommand Command;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TargetStation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<ATrackSegment*> Route;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ScheduledDepartureTime;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bExecuted;
};

USTRUCT(BlueprintType)
struct FTrainSchedule
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString ScheduleId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> StationSequence;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<float> ArrivalTimes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<float> DepartureTimes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TotalDuration;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsActive;
};

UCLASS()
class RAILTRANSITSIM_API UDispatchRuleEngine : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UPROPERTY()
    TArray<ATrainPawn*> ManagedTrains;

    UPROPERTY()
    TArray<FDispatchOrder> PendingOrders;

    UPROPERTY()
    TArray<FTrainSchedule> ActiveSchedules;

    UPROPERTY()
    TMap<FString, ATrainPawn*> TrainIdMap;

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void RegisterTrain(ATrainPawn* Train);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void UnregisterTrain(ATrainPawn* Train);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void IssueOrder(const FDispatchOrder& Order);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void CreateSchedule(const FTrainSchedule& Schedule);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void ActivateSchedule(const FString& ScheduleId);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void ExecutePendingOrders(float CurrentTime);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    bool CheckRouteConflict(const TArray<ATrackSegment*>& ProposedRoute, const FString& ExcludeTrainId);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    bool CanDispatchTrain(const FString& TrainId);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void EmergencyStopAll();

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    ATrainPawn* FindTrainById(const FString& TrainId);

    UFUNCTION(BlueprintCallable, Category = "Dispatch")
    void TickDispatch(float DeltaTime);

private:
    bool ValidateDispatchRules(const FDispatchOrder& Order);
    void UpdateScheduleProgress(float DeltaTime);
    void CheckScheduleAdherence();
};
