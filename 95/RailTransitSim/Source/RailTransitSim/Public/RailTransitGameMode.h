
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "RailTransitGameMode.generated.h"

UCLASS()
class RAILTRANSITSIM_API ARailTransitGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ARailTransitGameMode();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Training")
    float TrainingDurationMinutes;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Training")
    bool bAutoStartTraining;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Training")
    bool bCleanupDatabaseOnStart;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Training")
    int32 DataRetentionDaysOverride;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Training")
    float ElapsedTrainingTime;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Training")
    bool bTrainingInProgress;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "World")
    class ATrackSceneBuilder* TrackSceneBuilder;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "World")
    TArray<class ATrainPawn*> ActiveTrains;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "World")
    TArray<class ASignalMachine*> ActiveSignals;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Simulation")
    float SimulationTickRate;

    UFUNCTION(BlueprintCallable, Category = "Training")
    void StartTraining();

    UFUNCTION(BlueprintCallable, Category = "Training")
    void PauseTraining();

    UFUNCTION(BlueprintCallable, Category = "Training")
    void ResumeTraining();

    UFUNCTION(BlueprintCallable, Category = "Training")
    void StopTraining();

    UFUNCTION(BlueprintCallable, Category = "World")
    void BuildTrackScene();

    UFUNCTION(BlueprintCallable, Category = "World")
    void SpawnTrains(int32 NumTrains);

    UFUNCTION(BlueprintCallable, Category = "World")
    void PlaceSignalMachines();

    UFUNCTION(BlueprintCallable, Category = "Simulation")
    void RunSimulationStep(float DeltaTime);

    UFUNCTION(BlueprintCallable, Category = "Training")
    void EvaluateTrainingPerformance();

    UFUNCTION(BlueprintPure, Category = "Training")
    float GetRemainingTrainingTime() const;

    UFUNCTION(BlueprintPure, Category = "Training")
    float GetTrainingProgressPercent() const;

protected:
    virtual void BeginTrainingImpl();
    virtual void EndTrainingImpl();

private:
    FTimerHandle SimulationTimerHandle;
    bool bPaused;

    void RegisterWorldObjects();
    void UpdateSignalsFromGlobalState(const FServerGlobalState& State);
    void UpdateTrainsFromGlobalState(const FServerGlobalState& State);
    void UpdateTracksFromGlobalState(const FServerGlobalState& State);
    void SyncGlobalStateToServer();
    void CheckTrainingComplete();
};
