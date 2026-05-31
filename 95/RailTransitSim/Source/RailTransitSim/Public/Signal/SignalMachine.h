
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SignalMachine.generated.h"

UENUM(BlueprintType)
enum class ESignalAspect : uint8
{
    Red,
    Yellow,
    Green,
    YellowYellow,
    Off
};

UENUM(BlueprintType)
enum class ESignalType : uint8
{
    Entry,
    Exit,
    Block,
    Shunting,
    Repeater
};

UENUM(BlueprintType)
enum class ESignalFaultType : uint8
{
    None UMETA(DisplayName = "无故障"),
    LightBurnout UMETA(DisplayName = "灯泡烧毁"),
    RelayStuck UMETA(DisplayName = "继电器卡滞"),
    FalseOccupancy UMETA(DisplayName = "误报占用"),
    CommunicationLoss UMETA(DisplayName = "通信中断"),
    PowerFailure UMETA(DisplayName = "电源故障"),
    AspectMismatch UMETA(DisplayName = "显示不一致"),
    Random UMETA(DisplayName = "随机故障")
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSignalAspectChanged, ASignalMachine*, Signal, ESignalAspect, NewAspect);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSignalActivated, ASignalMachine*, Signal, bool, bActivated);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSignalFaultOccurred, ASignalMachine*, Signal, ESignalFaultType, FaultType);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSignalFaultCleared, ASignalMachine*, Signal, ESignalFaultType, FaultType);

UCLASS()
class RAILTRANSITSIM_API ASignalMachine : public AActor
{
    GENERATED_BODY()

public:
    ASignalMachine();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal")
    FString SignalId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal")
    ESignalType SignalType;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal")
    ESignalAspect CurrentAspect;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal")
    bool bIsActivated;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal")
    bool bIsFailed;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Fault")
    ESignalFaultType CurrentFaultType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal|Fault")
    float FaultDurationSeconds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal|Fault")
    bool bAutoRecoverFromFault;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Fault")
    float RemainingFaultDuration;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal")
    float ApproachDistance;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Signal")
    float OverlapDistance;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal")
    class ATrackSegment* ProtectedTrack;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal")
    ASignalMachine* NextSignal;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal")
    ASignalMachine* PreviousSignal;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Visual")
    UStaticMeshComponent* SignalPostMesh;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Visual")
    UStaticMeshComponent* HeadMesh;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Visual")
    UPointLightComponent* RedLight;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Visual")
    UPointLightComponent* YellowLight;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Signal|Visual")
    UPointLightComponent* GreenLight;

    UPROPERTY(BlueprintAssignable, Category = "Signal|Events")
    FOnSignalAspectChanged OnAspectChanged;

    UPROPERTY(BlueprintAssignable, Category = "Signal|Events")
    FOnSignalActivated OnSignalActivated;

    UPROPERTY(BlueprintAssignable, Category = "Signal|Events")
    FOnSignalFaultOccurred OnFaultOccurred;

    UPROPERTY(BlueprintAssignable, Category = "Signal|Events")
    FOnSignalFaultCleared OnFaultCleared;

    UFUNCTION(BlueprintCallable, Category = "Signal")
    void SetAspect(ESignalAspect NewAspect);

    UFUNCTION(BlueprintCallable, Category = "Signal")
    void SetActivated(bool bActivate);

    UFUNCTION(BlueprintCallable, Category = "Signal")
    void SetFailed(bool bFail);

    UFUNCTION(BlueprintPure, Category = "Signal")
    bool IsPassable() const;

    UFUNCTION(BlueprintPure, Category = "Signal")
    bool IsRestrictive() const;

    UFUNCTION(BlueprintCallable, Category = "Signal")
    void UpdateLinkage();

    UFUNCTION(BlueprintCallable, Category = "Signal")
    void ForceAspect(ESignalAspect ForcedAspect);

    UFUNCTION(BlueprintCallable, Category = "Signal|Fault")
    void InjectFault(ESignalFaultType FaultType, float Duration = 0.0f);

    UFUNCTION(BlueprintCallable, Category = "Signal|Fault")
    void ClearFault();

    UFUNCTION(BlueprintPure, Category = "Signal|Fault")
    bool HasFault() const { return CurrentFaultType != ESignalFaultType::None; }

    UFUNCTION(BlueprintPure, Category = "Signal|Fault")
    bool HasFaultType(ESignalFaultType FaultType) const { return CurrentFaultType == FaultType; }

    UFUNCTION(BlueprintCallable, Category = "Signal|Fault")
    void TickFault(float DeltaTime);

protected:
    virtual void BeginPlay() override;

private:
    ESignalAspect OriginalAspectBeforeFault;

    void ApplyFaultEffects();
    void RestoreFromFault();
    void UpdateVisuals();
    void PropagateAspectToPrevious();
    ESignalAspect CalculateLinkedAspect() const;
};
