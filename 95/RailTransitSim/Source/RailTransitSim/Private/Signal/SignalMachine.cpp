
#include "Signal/SignalMachine.h"
#include "Components/PointLightComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Track/TrackSegment.h"

ASignalMachine::ASignalMachine()
{
    PrimaryActorTick.bCanEverTick = false;

    SignalPostMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SignalPost"));
    RootComponent = SignalPostMesh;

    HeadMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SignalHead"));
    HeadMesh->SetupAttachment(SignalPostMesh);

    RedLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("RedLight"));
    RedLight->SetupAttachment(HeadMesh);
    RedLight->SetLightColor(FLinearColor::Red);
    RedLight->Intensity = 3000.0f;
    RedLight->SetVisibility(false);

    YellowLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("YellowLight"));
    YellowLight->SetupAttachment(HeadMesh);
    YellowLight->SetLightColor(FLinearColor::Yellow);
    YellowLight->Intensity = 3000.0f;
    YellowLight->SetVisibility(false);

    GreenLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("GreenLight"));
    GreenLight->SetupAttachment(HeadMesh);
    GreenLight->SetLightColor(FLinearColor::Green);
    GreenLight->Intensity = 3000.0f;
    GreenLight->SetVisibility(false);

    CurrentAspect = ESignalAspect::Red;
    OriginalAspectBeforeFault = ESignalAspect::Red;
    bIsActivated = true;
    bIsFailed = false;
    SignalType = ESignalType::Block;
    ApproachDistance = 800.0f;
    OverlapDistance = 100.0f;
    ProtectedTrack = nullptr;
    NextSignal = nullptr;
    PreviousSignal = nullptr;
    CurrentFaultType = ESignalFaultType::None;
    FaultDurationSeconds = 30.0f;
    RemainingFaultDuration = 0.0f;
    bAutoRecoverFromFault = true;
}

void ASignalMachine::BeginPlay()
{
    Super::BeginPlay();
    UpdateVisuals();
}

void ASignalMachine::SetAspect(ESignalAspect NewAspect)
{
    if (CurrentAspect == NewAspect) return;

    ESignalAspect OldAspect = CurrentAspect;
    CurrentAspect = NewAspect;
    UpdateVisuals();

    OnAspectChanged.Broadcast(this, NewAspect);
    PropagateAspectToPrevious();
}

void ASignalMachine::SetActivated(bool bActivate)
{
    if (bIsActivated == bActivate) return;
    bIsActivated = bActivate;

    if (!bIsActivated)
    {
        SetAspect(ESignalAspect::Off);
    }
    else
    {
        SetAspect(ESignalAspect::Red);
    }

    OnSignalActivated.Broadcast(this, bIsActivated);
}

void ASignalMachine::SetFailed(bool bFail)
{
    bIsFailed = bFail;
    if (bIsFailed)
    {
        SetAspect(ESignalAspect::Red);
    }
}

bool ASignalMachine::IsPassable() const
{
    if (bIsFailed || !bIsActivated) return false;
    return CurrentAspect == ESignalAspect::Green || CurrentAspect == ESignalAspect::YellowYellow;
}

bool ASignalMachine::IsRestrictive() const
{
    return CurrentAspect == ESignalAspect::Yellow;
}

void ASignalMachine::UpdateLinkage()
{
    ESignalAspect LinkedAspect = CalculateLinkedAspect();
    if (LinkedAspect != CurrentAspect)
    {
        CurrentAspect = LinkedAspect;
        UpdateVisuals();
        OnAspectChanged.Broadcast(this, CurrentAspect);
    }
}

void ASignalMachine::ForceAspect(ESignalAspect ForcedAspect)
{
    CurrentAspect = ForcedAspect;
    UpdateVisuals();
    OnAspectChanged.Broadcast(this, CurrentAspect);
}

void ASignalMachine::UpdateVisuals()
{
    RedLight->SetVisibility(false);
    YellowLight->SetVisibility(false);
    GreenLight->SetVisibility(false);

    switch (CurrentAspect)
    {
    case ESignalAspect::Red:
        RedLight->SetVisibility(true);
        break;
    case ESignalAspect::Yellow:
        YellowLight->SetVisibility(true);
        break;
    case ESignalAspect::Green:
        GreenLight->SetVisibility(true);
        break;
    case ESignalAspect::YellowYellow:
        YellowLight->SetVisibility(true);
        break;
    case ESignalAspect::Off:
        break;
    }
}

void ASignalMachine::PropagateAspectToPrevious()
{
    if (!PreviousSignal) return;
    PreviousSignal->UpdateLinkage();
}

ESignalAspect ASignalMachine::CalculateLinkedAspect() const
{
    if (!bIsActivated || bIsFailed) return ESignalAspect::Red;
    if (HasFault()) return ESignalAspect::Red;

    if (!NextSignal) return ESignalAspect::Green;

    switch (NextSignal->CurrentAspect)
    {
    case ESignalAspect::Red:
        return ESignalAspect::Yellow;
    case ESignalAspect::Yellow:
        return ESignalAspect::Yellow;
    case ESignalAspect::YellowYellow:
        return ESignalAspect::Green;
    case ESignalAspect::Green:
        return ESignalAspect::Green;
    case ESignalAspect::Off:
        return ESignalAspect::Red;
    }

    return ESignalAspect::Red;
}

void ASignalMachine::InjectFault(ESignalFaultType FaultType, float Duration)
{
    if (FaultType == ESignalFaultType::None) return;

    ESignalFaultType ActualFault = FaultType;
    if (FaultType == ESignalFaultType::Random)
    {
        const int32 MaxType = static_cast<int32>(ESignalFaultType::Random);
        const int32 RandomIndex = FMath::RandRange(1, MaxType - 1);
        ActualFault = static_cast<ESignalFaultType>(RandomIndex);
    }

    OriginalAspectBeforeFault = CurrentAspect;
    CurrentFaultType = ActualFault;
    bIsFailed = true;

    if (Duration > 0.0f)
    {
        RemainingFaultDuration = Duration;
    }
    else
    {
        RemainingFaultDuration = FaultDurationSeconds;
    }

    ApplyFaultEffects();
    OnFaultOccurred.Broadcast(this, ActualFault);

    UE_LOG(LogTemp, Log, TEXT("Signal %s injected fault: %d, duration: %.1fs"),
        *SignalId, static_cast<int32>(ActualFault), RemainingFaultDuration);
}

void ASignalMachine::ClearFault()
{
    if (CurrentFaultType == ESignalFaultType::None) return;

    const ESignalFaultType OldFault = CurrentFaultType;
    RestoreFromFault();
    CurrentFaultType = ESignalFaultType::None;
    bIsFailed = false;
    RemainingFaultDuration = 0.0f;

    OnFaultCleared.Broadcast(this, OldFault);
    UE_LOG(LogTemp, Log, TEXT("Signal %s cleared fault: %d"), *SignalId, static_cast<int32>(OldFault));
}

void ASignalMachine::TickFault(float DeltaTime)
{
    if (CurrentFaultType == ESignalFaultType::None) return;
    if (!bAutoRecoverFromFault) return;

    RemainingFaultDuration -= DeltaTime;
    if (RemainingFaultDuration <= 0.0f)
    {
        ClearFault();
    }
}

void ASignalMachine::ApplyFaultEffects()
{
    switch (CurrentFaultType)
    {
    case ESignalFaultType::LightBurnout:
        ForceAspect(ESignalAspect::Off);
        break;
    case ESignalFaultType::RelayStuck:
        ForceAspect(ESignalAspect::Red);
        break;
    case ESignalFaultType::FalseOccupancy:
        ForceAspect(ESignalAspect::Red);
        break;
    case ESignalFaultType::CommunicationLoss:
        ForceAspect(ESignalAspect::Red);
        break;
    case ESignalFaultType::PowerFailure:
        ForceAspect(ESignalAspect::Off);
        break;
    case ESignalFaultType::AspectMismatch:
        ForceAspect(static_cast<ESignalAspect>(FMath::RandRange(0, 3)));
        break;
    default:
        ForceAspect(ESignalAspect::Red);
        break;
    }
}

void ASignalMachine::RestoreFromFault()
{
    ForceAspect(OriginalAspectBeforeFault);
    UpdateLinkage();
}
