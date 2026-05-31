
#include "Track/TrackSceneBuilder.h"
#include "Track/TrackSegment.h"
#include "Engine/World.h"

ATrackSceneBuilder::ATrackSceneBuilder()
{
    PrimaryActorTick.bCanEverTick = false;
    LineName = TEXT("Line1");
    TotalStations = 0;
    TotalLineLength = 0.0f;
    bLoopLine = false;
}

void ATrackSceneBuilder::BeginPlay()
{
    Super::BeginPlay();
    RegisterTrackSegments();
}

void ATrackSceneBuilder::BuildFullLine()
{
    RegisterTrackSegments();
    ConnectSegments();
    BuildTrackMeshes();
    BuildSwitches();
    BuildPlatforms();
    PlaceSignalMachinesAtSegments();

    TotalLineLength = 0.0f;
    for (ATrackSegment* Seg : TrackSegments)
    {
        if (Seg)
        {
            TotalLineLength += Seg->GetTotalSplineLength();
        }
    }
}

void ATrackSceneBuilder::BuildStationSection(const FString& StationName, float SectionLength)
{
    UWorld* World = GetWorld();
    if (!World) return;

    FActorSpawnParameters Params;
    Params.Owner = this;

    ATrackSegment* NewSegment = World->SpawnActor<ATrackSegment>(ATrackSegment::StaticClass(), Params);
    if (NewSegment)
    {
        NewSegment->TrackType = ETrackType::Platform;
        NewSegment->bHasPlatform = true;
        NewSegment->PlatformName = StationName;
        NewSegment->PlatformLength = SectionLength;
        NewSegment->SectionId = StationName;
        TrackSegments.Add(NewSegment);
        SectionIdMap.Add(StationName, NewSegment);
        TotalStations++;
    }
}

void ATrackSceneBuilder::ConnectSegments()
{
    for (int32 i = 0; i < TrackSegments.Num(); ++i)
    {
        if (!TrackSegments[i]) continue;

        if (i + 1 < TrackSegments.Num() && TrackSegments[i + 1])
        {
            TrackSegments[i]->SetNextTrack(TrackSegments[i + 1]);
            TrackSegments[i + 1]->SetPreviousTrack(TrackSegments[i]);
        }
        else if (bLoopLine && TrackSegments.Num() > 1 && TrackSegments[0])
        {
            TrackSegments[i]->SetNextTrack(TrackSegments[0]);
            TrackSegments[0]->SetPreviousTrack(TrackSegments[i]);
        }
    }
}

ATrackSegment* ATrackSceneBuilder::FindTrackBySectionId(const FString& SectionId)
{
    ATrackSegment** Found = SectionIdMap.Find(SectionId);
    return Found ? *Found : nullptr;
}

TArray<ATrackSegment*> ATrackSceneBuilder::GetRouteBetweenStations(const FString& FromStation, const FString& ToStation)
{
    TArray<ATrackSegment*> Route;

    ATrackSegment* Start = FindTrackBySectionId(FromStation);
    ATrackSegment* End = FindTrackBySectionId(ToStation);

    if (!Start || !End) return Route;

    ATrackSegment* Current = Start;
    TSet<ATrackSegment*> Visited;

    while (Current && !Visited.Contains(Current))
    {
        Route.Add(Current);
        Visited.Add(Current);

        if (Current == End) break;
        Current = Current->GetNextTrack();
    }

    return Route;
}

float ATrackSceneBuilder::CalculateRouteDistance(const TArray<ATrackSegment*>& Route)
{
    float TotalDist = 0.0f;
    for (ATrackSegment* Seg : Route)
    {
        if (Seg)
        {
            TotalDist += Seg->GetTotalSplineLength();
        }
    }
    return TotalDist;
}

void ATrackSceneBuilder::PlaceSignalMachinesAtSegments()
{
}

TArray<FString> ATrackSceneBuilder::GetAllStationNames() const
{
    TArray<FString> Stations;
    for (const auto& Pair : SectionIdMap)
    {
        ATrackSegment* Seg = Pair.Value;
        if (Seg && Seg->bHasPlatform)
        {
            Stations.Add(Seg->PlatformName);
        }
    }
    return Stations;
}

void ATrackSceneBuilder::BuildTrackMeshes()
{
    for (ATrackSegment* Seg : TrackSegments)
    {
        if (Seg)
        {
            Seg->OnConstruction(Seg->GetActorTransform());
        }
    }
}

void ATrackSceneBuilder::BuildSwitches()
{
}

void ATrackSceneBuilder::BuildPlatforms()
{
}

void ATrackSceneBuilder::RegisterTrackSegments()
{
    SectionIdMap.Empty();
    for (ATrackSegment* Seg : TrackSegments)
    {
        if (Seg && !Seg->SectionId.IsEmpty())
        {
            SectionIdMap.Add(Seg->SectionId, Seg);
        }
    }
}
