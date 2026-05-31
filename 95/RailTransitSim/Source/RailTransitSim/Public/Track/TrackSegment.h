
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/SplineComponent.h"
#include "Components/SplineMeshComponent.h"
#include "TrackSegment.generated.h"

UENUM(BlueprintType)
enum class ETrackType : uint8
{
    Straight,
    CurveLeft,
    CurveRight,
    SwitchBranch,
    Platform
};

UCLASS()
class RAILTRANSITSIM_API ATrackSegment : public AActor
{
    GENERATED_BODY()

public:
    ATrackSegment();

    virtual void OnConstruction(const FTransform& Transform) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track")
    ETrackType TrackType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track")
    float TrackLength;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track")
    float RailGauge;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track")
    float SpeedLimit;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track")
    FString SectionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track")
    bool bIsElectrified;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Track")
    USplineComponent* TrackSpline;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Visual")
    UStaticMesh* RailMesh;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Visual")
    UStaticMesh* SleeperMesh;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Visual")
    float SleeperSpacing;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Switch")
    bool bIsSwitch;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Switch", meta = (EditCondition = "bIsSwitch"))
    int32 SwitchPosition;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Switch", meta = (EditCondition = "bIsSwitch"))
    ATrackSegment* BranchTrack;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Platform")
    bool bHasPlatform;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Platform", meta = (EditCondition = "bHasPlatform"))
    FString PlatformName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Track|Platform", meta = (EditCondition = "bHasPlatform"))
    float PlatformLength;

    UPROPERTY()
    TArray<USplineMeshComponent*> RailMeshComponents;

    UPROPERTY()
    TArray<UStaticMeshComponent*> SleeperComponents;

    ATrackSegment* GetNextTrack() const;
    ATrackSegment* GetPreviousTrack() const;

    void SetNextTrack(ATrackSegment* Next);
    void SetPreviousTrack(ATrackSegment* Prev);

    FVector GetWorldPositionAtDistance(float Distance) const;
    FRotator GetWorldRotationAtDistance(float Distance) const;
    float GetTotalSplineLength() const;

    void ToggleSwitch();

    UFUNCTION(BlueprintCallable, Category = "Track|Switch")
    void SetSwitchPosition(int32 Position);

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY()
    ATrackSegment* NextTrack;

    UPROPERTY()
    ATrackSegment* PreviousTrack;

    void GenerateTrackMesh();
    void GenerateSleepers();
    void GeneratePlatformMesh();
};
