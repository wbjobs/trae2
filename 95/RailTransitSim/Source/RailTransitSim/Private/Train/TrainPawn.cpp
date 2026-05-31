
#include "Train/TrainPawn.h"
#include "Track/TrackSegment.h"
#include "Signal/SignalMachine.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Controller.h"

ATrainPawn::ATrainPawn()
{
    PrimaryActorTick.bCanEverTick = true;

    TrainMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("TrainMesh"));
    RootComponent = TrainMesh;

    FrontPosition = CreateDefaultSubobject<USceneComponent>(TEXT("FrontPosition"));
    FrontPosition->SetupAttachment(RootComponent);
    FrontPosition->SetRelativeLocation(FVector(500.0f, 0.0f, 0.0f));

    RearPosition = CreateDefaultSubobject<USceneComponent>(TEXT("RearPosition"));
    RearPosition->SetupAttachment(RootComponent);
    RearPosition->SetRelativeLocation(FVector(-500.0f, 0.0f, 0.0f));

    TrainState = ETrainState::Stopped;
    DoorState = EDoorState::Closed;
    ThrottleInput = 0.0f;
    CurrentBrakeInput = 0.0f;
    bEmergencyBraking = false;
    CarCount = 6;
    DistanceOnCurrentTrack = 0.0f;
    CurrentRouteIndex = 0;
    DistanceToNextSignal = FLT_MAX;

    Dynamics.CurrentSpeed = 0.0f;
    Dynamics.TargetSpeed = 0.0f;
    Dynamics.MaxSpeed = 80.0f;
    Dynamics.AccelerationRate = 1.0f;
    Dynamics.BrakingRate = 1.2f;
    Dynamics.EmergencyBrakeRate = 3.0f;
    Dynamics.CurrentAcceleration = 0.0f;
    Dynamics.TrackDistance = 0.0f;
    Dynamics.TotalDistanceTraveled = 0.0f;
}

void ATrainPawn::BeginPlay()
{
    Super::BeginPlay();
}

void ATrainPawn::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    UpdateTrainPhysics(DeltaTime);
    UpdateTrackPosition(DeltaTime);
    UpdateSignalDetection();
    CheckStationArrival();
}

void ATrainPawn::SetupPlayerInputComponent(UInputComponent* Pic)
{
    Super::SetupPlayerInputComponent(Pic);
}

void ATrainPawn::UpdateTrainPhysics(float DeltaTime)
{
    float SpeedMs = Dynamics.CurrentSpeed;

    if (bEmergencyBraking)
    {
        Dynamics.CurrentAcceleration = -Dynamics.EmergencyBrakeRate;
    }
    else if (CurrentBrakeInput > 0.0f)
    {
        Dynamics.CurrentAcceleration = -Dynamics.BrakingRate * CurrentBrakeInput;
    }
    else if (ThrottleInput > 0.0f)
    {
        Dynamics.CurrentAcceleration = Dynamics.AccelerationRate * ThrottleInput;
    }
    else
    {
        Dynamics.CurrentAcceleration = -0.1f;
    }

    SpeedMs += Dynamics.CurrentAcceleration * DeltaTime;
    SpeedMs = FMath::Clamp(SpeedMs, 0.0f, Dynamics.MaxSpeed / 3.6f);

    if (FMath::Abs(Dynamics.CurrentSpeed - SpeedMs) > 0.01f)
    {
        Dynamics.CurrentSpeed = SpeedMs;
        OnSpeedChanged.Broadcast(this, Dynamics.CurrentSpeed);
    }

    if (Dynamics.CurrentSpeed < 0.01f && TrainState != ETrainState::Stopped)
    {
        TransitToState(ETrainState::Stopped);
    }
    else if (bEmergencyBraking && TrainState != ETrainState::EmergencyBraking)
    {
        TransitToState(ETrainState::EmergencyBraking);
    }
    else if (CurrentBrakeInput > 0.0f && TrainState != ETrainState::Braking)
    {
        TransitToState(ETrainState::Braking);
    }
    else if (ThrottleInput > 0.0f && Dynamics.CurrentSpeed < Dynamics.TargetSpeed / 3.6f && TrainState != ETrainState::Accelerating)
    {
        TransitToState(ETrainState::Accelerating);
    }
    else if (ThrottleInput > 0.0f && Dynamics.CurrentSpeed >= Dynamics.TargetSpeed / 3.6f * 0.95f && TrainState != ETrainState::Cruising)
    {
        TransitToState(ETrainState::Cruising);
    }
}

void ATrainPawn::UpdateTrackPosition(float DeltaTime)
{
    if (!CurrentTrack) return;

    const float MoveDistance = Dynamics.CurrentSpeed * DeltaTime;
    DistanceOnCurrentTrack += MoveDistance;
    Dynamics.TotalDistanceTraveled += MoveDistance;

    const float TrackLen = CurrentTrack->GetTotalSplineLength();

    if (DistanceOnCurrentTrack >= TrackLen)
    {
        MoveToNextTrackSegment();
    }

    if (CurrentTrack)
    {
        const FVector NewPos = CurrentTrack->GetWorldPositionAtDistance(DistanceOnCurrentTrack);
        const FRotator NewRot = CurrentTrack->GetWorldRotationAtDistance(DistanceOnCurrentTrack);
        SetActorLocationAndRotation(NewPos, NewRot);
    }
}

void ATrainPawn::MoveToNextTrackSegment()
{
    ATrackSegment* Next = CurrentTrack->GetNextTrack();
    if (Next)
    {
        const float Overshoot = DistanceOnCurrentTrack - CurrentTrack->GetTotalSplineLength();
        CurrentTrack = Next;
        DistanceOnCurrentTrack = Overshoot;
        CurrentRouteIndex++;
    }
    else
    {
        Dynamics.CurrentSpeed = 0.0f;
        DistanceOnCurrentTrack = CurrentTrack->GetTotalSplineLength();
        TransitToState(ETrainState::Stopped);
    }
}

void ATrainPawn::UpdateSignalDetection()
{
    if (!CurrentTrack) return;

    NextSignalAhead = nullptr;
    DistanceToNextSignal = FLT_MAX;

    ATrackSegment* ScanTrack = CurrentTrack;
    float ScanDist = -DistanceOnCurrentTrack;

    for (int32 i = 0; i < 10 && ScanTrack; ++i)
    {
        ScanDist += ScanTrack->GetTotalSplineLength();

        TArray<AActor*> AttachedActors;
        ScanTrack->GetAttachedActors(AttachedActors);

        for (AActor* Actor : AttachedActors)
        {
            ASignalMachine* Sig = Cast<ASignalMachine>(Actor);
            if (Sig && ScanDist > 0.0f && ScanDist < DistanceToNextSignal)
            {
                NextSignalAhead = Sig;
                DistanceToNextSignal = ScanDist;
            }
        }

        ScanTrack = ScanTrack->GetNextTrack();
    }
}

void ATrainPawn::CheckStationArrival()
{
    if (!CurrentTrack || !CurrentTrack->bHasPlatform) return;
    if (Dynamics.CurrentSpeed > 0.1f) return;

    if (DistanceOnCurrentTrack >= CurrentTrack->GetTotalSplineLength() * 0.4f &&
        DistanceOnCurrentTrack <= CurrentTrack->GetTotalSplineLength() * 0.6f)
    {
        OnArrivedAtStation.Broadcast(this, CurrentTrack->PlatformName);
    }
}

void ATrainPawn::Accelerate(float TargetSpeed)
{
    Dynamics.TargetSpeed = TargetSpeed;
    ThrottleInput = 1.0f;
    CurrentBrakeInput = 0.0f;
    bEmergencyBraking = false;
}

void ATrainPawn::Brake(float BrakingPower)
{
    CurrentBrakeInput = FMath::Clamp(BrakingPower, 0.0f, 1.0f);
    ThrottleInput = 0.0f;
    bEmergencyBraking = false;
}

void ATrainPawn::EmergencyBrake()
{
    bEmergencyBraking = true;
    ThrottleInput = 0.0f;
    CurrentBrakeInput = 0.0f;
    OnEmergencyBrake.Broadcast();
}

void ATrainPawn::Stop()
{
    ThrottleInput = 0.0f;
    CurrentBrakeInput = 1.0f;
    Dynamics.TargetSpeed = 0.0f;
}

void ATrainPawn::OpenDoors()
{
    if (Dynamics.CurrentSpeed > 0.1f) return;
    DoorState = EDoorState::Opening;
}

void ATrainPawn::CloseDoors()
{
    DoorState = EDoorState::Closing;
}

void ATrainPawn::SetRoute(const TArray<ATrackSegment*>& NewRoute)
{
    AssignedRoute = NewRoute;
    CurrentRouteIndex = 0;
    if (NewRoute.Num() > 0)
    {
        CurrentTrack = NewRoute[0];
        DistanceOnCurrentTrack = 0.0f;
    }
}

void ATrainPawn::FollowSignalInstruction()
{
    if (!NextSignalAhead) return;

    if (NextSignalAhead->CurrentAspect == ESignalAspect::Red)
    {
        float StoppingDist = (Dynamics.CurrentSpeed * Dynamics.CurrentSpeed) / (2.0f * Dynamics.BrakingRate);
        if (DistanceToNextSignal <= StoppingDist + 50.0f)
        {
            Brake(1.0f);
        }
        else if (DistanceToNextSignal <= StoppingDist * 2.0f)
        {
            Brake(0.5f);
        }
    }
    else if (NextSignalAhead->CurrentAspect == ESignalAspect::Yellow)
    {
        float ReducedSpeed = Dynamics.MaxSpeed / 3.6f * 0.5f;
        if (Dynamics.CurrentSpeed > ReducedSpeed)
        {
            Brake(0.3f);
        }
    }
    else if (NextSignalAhead->CurrentAspect == ESignalAspect::Green)
    {
        if (Dynamics.CurrentSpeed < Dynamics.TargetSpeed / 3.6f)
        {
            Accelerate(Dynamics.TargetSpeed);
        }
    }
}

void ATrainPawn::TransitToState(ETrainState NewState)
{
    if (TrainState == NewState) return;
    TrainState = NewState;
    OnTrainStateChanged.Broadcast(this, NewState);
}

float ATrainPawn::GetCurrentSpeedKmh() const
{
    return Dynamics.CurrentSpeed * 3.6f;
}

FString ATrainPawn::GetCurrentStation() const
{
    if (CurrentTrack && CurrentTrack->bHasPlatform)
    {
        return CurrentTrack->PlatformName;
    }
    return FString();
}

bool ATrainPawn::IsAtStation() const
{
    return CurrentTrack && CurrentTrack->bHasPlatform && Dynamics.CurrentSpeed < 0.1f;
}

bool ATrainPawn::HasPassedSignal(ASignalMachine* Signal) const
{
    return false;
}

void ATrainPawn::SetThrottle(float ThrottleValue)
{
    ThrottleInput = FMath::Clamp(ThrottleValue, 0.0f, 1.0f);
    if (ThrottleInput > 0.0f)
    {
        CurrentBrakeInput = 0.0f;
        bEmergencyBraking = false;
    }
}
