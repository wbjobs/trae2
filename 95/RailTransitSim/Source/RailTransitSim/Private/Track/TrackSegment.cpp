
#include "Track/TrackSegment.h"
#include "Components/SplineMeshComponent.h"
#include "UObject/ConstructorHelpers.h"

ATrackSegment::ATrackSegment()
{
    PrimaryActorTick.bCanEverTick = false;

    TrackSpline = CreateDefaultSubobject<USplineComponent>(TEXT("TrackSpline"));
    RootComponent = TrackSpline;

    TrackType = ETrackType::Straight;
    TrackLength = 1000.0f;
    RailGauge = 1435.0f;
    SpeedLimit = 80.0f;
    bIsElectrified = true;
    bIsSwitch = false;
    SwitchPosition = 0;
    bHasPlatform = false;
    PlatformLength = 200.0f;
    SleeperSpacing = 60.0f;
    NextTrack = nullptr;
    PreviousTrack = nullptr;

    static ConstructorHelpers::FObjectFinder<UStaticMesh> DefaultRailMesh(
        TEXT("/Engine/BasicShapes/Cylinder")
    );
    if (DefaultRailMesh.Succeeded())
    {
        RailMesh = DefaultRailMesh.Object;
    }
}

void ATrackSegment::BeginPlay()
{
    Super::BeginPlay();
}

void ATrackSegment::OnConstruction(const FTransform& Transform)
{
    Super::OnConstruction(Transform);
    GenerateTrackMesh();
    GenerateSleepers();
    if (bHasPlatform)
    {
        GeneratePlatformMesh();
    }
}

void ATrackSegment::GenerateTrackMesh()
{
    for (USplineMeshComponent* Comp : RailMeshComponents)
    {
        if (Comp)
        {
            Comp->DestroyComponent();
        }
    }
    RailMeshComponents.Empty();

    if (!RailMesh || !TrackSpline) return;

    const int32 NumPoints = TrackSpline->GetNumberOfSplinePoints();
    if (NumPoints < 2) return;

    for (int32 i = 0; i < NumPoints - 1; ++i)
    {
        USplineMeshComponent* SplineMesh = NewObject<USplineMeshComponent>(this);
        SplineMesh->SetStaticMesh(RailMesh);
        SplineMesh->SetMobility(EComponentMobility::Movable);
        SplineMesh->CreationMethod = EComponentCreationMethod::UserConstructionScript;
        SplineMesh->SetupAttachment(TrackSpline);
        SplineMesh->RegisterComponent();

        FVector StartPos, StartTangent, EndPos, EndTangent;
        TrackSpline->GetLocationAndTangentAtSplinePoint(i, StartPos, StartTangent, ESplineCoordinateSpace::Local);
        TrackSpline->GetLocationAndTangentAtSplinePoint(i + 1, EndPos, EndTangent, ESplineCoordinateSpace::Local);

        SplineMesh->SetStartAndEnd(StartPos, StartTangent, EndPos, EndTangent, true);

        const float HalfGauge = RailGauge / 2.0f;

        USplineMeshComponent* LeftRail = NewObject<USplineMeshComponent>(this);
        LeftRail->SetStaticMesh(RailMesh);
        LeftRail->SetMobility(EComponentMobility::Movable);
        LeftRail->CreationMethod = EComponentCreationMethod::UserConstructionScript;
        LeftRail->SetupAttachment(TrackSpline);
        LeftRail->RegisterComponent();
        LeftRail->SetStartAndEnd(
            StartPos + FVector(0, -HalfGauge, 0),
            StartTangent,
            EndPos + FVector(0, -HalfGauge, 0),
            EndTangent, true
        );

        USplineMeshComponent* RightRail = NewObject<USplineMeshComponent>(this);
        RightRail->SetStaticMesh(RailMesh);
        RightRail->SetMobility(EComponentMobility::Movable);
        RightRail->CreationMethod = EComponentCreationMethod::UserConstructionScript;
        RightRail->SetupAttachment(TrackSpline);
        RightRail->RegisterComponent();
        RightRail->SetStartAndEnd(
            StartPos + FVector(0, HalfGauge, 0),
            StartTangent,
            EndPos + FVector(0, HalfGauge, 0),
            EndTangent, true
        );

        RailMeshComponents.Add(LeftRail);
        RailMeshComponents.Add(RightRail);
    }
}

void ATrackSegment::GenerateSleepers()
{
    for (UStaticMeshComponent* Comp : SleeperComponents)
    {
        if (Comp)
        {
            Comp->DestroyComponent();
        }
    }
    SleeperComponents.Empty();

    if (!SleeperMesh || !TrackSpline) return;

    const float TotalLength = TrackSpline->GetSplineLength();
    const int32 NumSleepers = FMath::FloorToInt(TotalLength / SleeperSpacing);

    for (int32 i = 0; i <= NumSleepers; ++i)
    {
        const float Distance = i * SleeperSpacing;
        if (Distance > TotalLength) break;

        const FVector Location = TrackSpline->GetLocationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::Local);
        const FRotator Rotation = TrackSpline->GetRotationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::Local);

        UStaticMeshComponent* Sleeper = NewObject<UStaticMeshComponent>(this);
        Sleeper->SetStaticMesh(SleeperMesh);
        Sleeper->SetMobility(EComponentMobility::Movable);
        Sleeper->CreationMethod = EComponentCreationMethod::UserConstructionScript;
        Sleeper->SetupAttachment(TrackSpline);
        Sleeper->SetRelativeLocation(Location);
        Sleeper->SetRelativeRotation(Rotation);
        Sleeper->RegisterComponent();
        SleeperComponents.Add(Sleeper);
    }
}

void ATrackSegment::GeneratePlatformMesh()
{
}

ATrackSegment* ATrackSegment::GetNextTrack() const
{
    if (bIsSwitch && SwitchPosition == 1 && BranchTrack)
    {
        return BranchTrack;
    }
    return NextTrack;
}

ATrackSegment* ATrackSegment::GetPreviousTrack() const
{
    return PreviousTrack;
}

void ATrackSegment::SetNextTrack(ATrackSegment* Next)
{
    NextTrack = Next;
}

void ATrackSegment::SetPreviousTrack(ATrackSegment* Prev)
{
    PreviousTrack = Prev;
}

FVector ATrackSegment::GetWorldPositionAtDistance(float Distance) const
{
    if (!TrackSpline) return FVector::ZeroVector;
    return TrackSpline->GetLocationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World);
}

FRotator ATrackSegment::GetWorldRotationAtDistance(float Distance) const
{
    if (!TrackSpline) return FRotator::ZeroRotator;
    return TrackSpline->GetRotationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World);
}

float ATrackSegment::GetTotalSplineLength() const
{
    if (!TrackSpline) return 0.0f;
    return TrackSpline->GetSplineLength();
}

void ATrackSegment::ToggleSwitch()
{
    if (!bIsSwitch) return;
    SwitchPosition = (SwitchPosition == 0) ? 1 : 0;
}

void ATrackSegment::SetSwitchPosition(int32 Position)
{
    if (!bIsSwitch) return;
    SwitchPosition = FMath::Clamp(Position, 0, 1);
}
