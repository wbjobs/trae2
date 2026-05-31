
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TrackSegment.generated.h"

UCLASS()
class RAILTRANSITSIM_API ATrackSceneBuilder : public AActor
{
    GENERATED_BODY()

public:
    ATrackSceneBuilder();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TrackScene")
    TArray<ATrackSegment*> TrackSegments;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TrackScene")
    FString LineName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TrackScene")
    int32 TotalStations;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TrackScene")
    float TotalLineLength;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TrackScene")
    bool bLoopLine;

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    void BuildFullLine();

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    void BuildStationSection(const FString& StationName, float SectionLength);

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    void ConnectSegments();

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    ATrackSegment* FindTrackBySectionId(const FString& SectionId);

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    TArray<ATrackSegment*> GetRouteBetweenStations(const FString& FromStation, const FString& ToStation);

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    float CalculateRouteDistance(const TArray<ATrackSegment*>& Route);

    UFUNCTION(BlueprintCallable, Category = "TrackScene")
    void PlaceSignalMachinesAtSegments();

    UFUNCTION(BlueprintPure, Category = "TrackScene")
    TArray<FString> GetAllStationNames() const;

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY()
    TMap<FString, ATrackSegment*> SectionIdMap;

    void BuildTrackMeshes();
    void BuildSwitches();
    void BuildPlatforms();
    void RegisterTrackSegments();
};
