
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "TrainPawn.generated.h"

UENUM(BlueprintType)
enum class ETrainState : uint8
{
    Stopped,
    Accelerating,
    Cruising,
    Braking,
    EmergencyBraking,
    Coasting
};

UENUM(BlueprintType)
enum class EDoorState : uint8
{
    Closed,
    Opening,
    Open,
    Closing
};

USTRUCT(BlueprintType)
struct FTrainDynamics
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CurrentSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TargetSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MaxSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float AccelerationRate;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BrakingRate;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EmergencyBrakeRate;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CurrentAcceleration;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TrackDistance;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TotalDistanceTraveled;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnTrainSpeedChanged, AActor*, Train, float, NewSpeed);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnTrainStateChanged, AActor*, Train, ETrainState, NewState);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnTrainPassedSignal, AActor*, Train, class ASignalMachine*, Signal, ESignalAspect, Aspect);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnTrainArrivedAtStation, AActor*, Train, const FString&, StationName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnTrainEmergencyBrake);

UCLASS()
class RAILTRANSITSIM_API ATrainPawn : public APawn
{
    GENERATED_BODY()

public:
    ATrainPawn();

    virtual void Tick(float DeltaTime) override;
    virtual void SetupPlayerInputComponent(class UInputComponent* Pic) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Train")
    FString TrainId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Train")
    FString TrainNumber;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Train")
    int32 CarCount;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train")
    ETrainState TrainState;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train")
    EDoorState DoorState;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Train|Dynamics")
    FTrainDynamics Dynamics;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Train|Route")
    class ATrackSegment* CurrentTrack;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train|Route")
    float DistanceOnCurrentTrack;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Train|Route")
    TArray<class ATrackSegment*> AssignedRoute;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train|Route")
    int32 CurrentRouteIndex;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train")
    class ASignalMachine* NextSignalAhead;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train")
    float DistanceToNextSignal;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train|Visual")
    USkeletalMeshComponent* TrainMesh;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train|Visual")
    USceneComponent* FrontPosition;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Train|Visual")
    USceneComponent* RearPosition;

    UPROPERTY(BlueprintAssignable, Category = "Train|Events")
    FOnTrainSpeedChanged OnSpeedChanged;

    UPROPERTY(BlueprintAssignable, Category = "Train|Events")
    FOnTrainStateChanged OnTrainStateChanged;

    UPROPERTY(BlueprintAssignable, Category = "Train|Events")
    FOnTrainPassedSignal OnPassedSignal;

    UPROPERTY(BlueprintAssignable, Category = "Train|Events")
    FOnTrainArrivedAtStation OnArrivedAtStation;

    UPROPERTY(BlueprintAssignable, Category = "Train|Events")
    FOnTrainEmergencyBrake OnEmergencyBrake;

    UFUNCTION(BlueprintCallable, Category = "Train")
    void Accelerate(float TargetSpeed);

    UFUNCTION(BlueprintCallable, Category = "Train")
    void Brake(float BrakingPower);

    UFUNCTION(BlueprintCallable, Category = "Train")
    void EmergencyBrake();

    UFUNCTION(BlueprintCallable, Category = "Train")
    void Stop();

    UFUNCTION(BlueprintCallable, Category = "Train")
    void OpenDoors();

    UFUNCTION(BlueprintCallable, Category = "Train")
    void CloseDoors();

    UFUNCTION(BlueprintCallable, Category = "Train")
    void SetRoute(const TArray<ATrackSegment*>& NewRoute);

    UFUNCTION(BlueprintCallable, Category = "Train")
    void FollowSignalInstruction();

    UFUNCTION(BlueprintPure, Category = "Train")
    float GetCurrentSpeedKmh() const;

    UFUNCTION(BlueprintPure, Category = "Train")
    FString GetCurrentStation() const;

    UFUNCTION(BlueprintPure, Category = "Train")
    bool IsAtStation() const;

    UFUNCTION(BlueprintPure, Category = "Train")
    bool HasPassedSignal(ASignalMachine* Signal) const;

    UFUNCTION(BlueprintCallable, Category = "Train")
    void SetThrottle(float ThrottleValue);

protected:
    virtual void BeginPlay() override;

private:
    float ThrottleInput;
    float CurrentBrakeInput;
    bool bEmergencyBraking;

    void UpdateTrainPhysics(float DeltaTime);
    void UpdateTrackPosition(float DeltaTime);
    void UpdateSignalDetection();
    void CheckStationArrival();
    void TransitToState(ETrainState NewState);
    void MoveToNextTrackSegment();
};
