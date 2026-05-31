
#include "Signal/SignalLinkageController.h"
#include "Track/TrackSegment.h"
#include "Misc/DateTime.h"

void USignalLinkageController::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    AllSignals.Empty();
    DefinedRoutes.Empty();
    SignalIdMap.Empty();
    SectionToSignalsMap.Empty();
    SectionOccupancyTimestamps.Empty();
    OccupiedSections.Empty();
    LastUpdatedSignalSequences.Empty();
    GlobalSignalStateVersion = 0;
    bEnableStrictInterlock = true;
    bAutoUpdateAllSignalsOnOccupancy = true;
    OccupancyClearDelaySeconds = 3.0f;
}

void USignalLinkageController::Deinitialize()
{
    Super::Deinitialize();
}

void USignalLinkageController::RegisterSignal(ASignalMachine* Signal)
{
    if (!Signal || AllSignals.Contains(Signal)) return;
    AllSignals.Add(Signal);

    if (!Signal->SignalId.IsEmpty())
    {
        SignalIdMap.Add(Signal->SignalId, Signal);
    }

    if (Signal->ProtectedTrack)
    {
        TArray<ASignalMachine*>& SignalsForSection = SectionToSignalsMap.FindOrAdd(Signal->ProtectedTrack);
        SignalsForSection.Add(Signal);
    }
}

void USignalLinkageController::UnregisterSignal(ASignalMachine* Signal)
{
    if (!Signal) return;
    AllSignals.Remove(Signal);
    SignalIdMap.Remove(Signal->SignalId);

    if (Signal->ProtectedTrack)
    {
        TArray<ASignalMachine*>* SignalsForSection = SectionToSignalsMap.Find(Signal->ProtectedTrack);
        if (SignalsForSection)
        {
            SignalsForSection->Remove(Signal);
        }
    }
}

void USignalLinkageController::BuildSignalChain()
{
    for (ASignalMachine* Signal : AllSignals)
    {
        if (!Signal) continue;

        if (!Signal->NextSignal && Signal->ProtectedTrack)
        {
            ATrackSegment* NextSeg = Signal->ProtectedTrack->GetNextTrack();
            while (NextSeg)
            {
                TArray<ASignalMachine*>* SignalsOnSection = SectionToSignalsMap.Find(NextSeg);
                if (SignalsOnSection && SignalsOnSection->Num() > 0)
                {
                    for (ASignalMachine* Other : *SignalsOnSection)
                    {
                        if (Other && Other != Signal)
                        {
                            Signal->NextSignal = Other;
                            Other->PreviousSignal = Signal;
                            break;
                        }
                    }
                    if (Signal->NextSignal) break;
                }
                NextSeg = NextSeg->GetNextTrack();
            }
        }
    }

    for (ASignalMachine* Signal : AllSignals)
    {
        if (Signal && !Signal->PreviousSignal)
        {
            PropagateSignalState(Signal);
        }
    }

    DebugPrintSignalChain();
}

void USignalLinkageController::UpdateAllLinkages()
{
    GlobalSignalStateVersion++;

    for (ASignalMachine* Signal : AllSignals)
    {
        if (!Signal) continue;

        if (!Signal->NextSignal)
        {
            PropagateSignalState(Signal);
        }
    }
}

bool USignalLinkageController::SetRoute(const FString& RouteId)
{
    for (FSignalRoute& Route : DefinedRoutes)
    {
        if (Route.RouteId == RouteId)
        {
            if (Route.bIsLocked)
            {
                OnRouteSet.Broadcast(RouteId, false);
                return false;
            }

            FInterlockCheckResult CheckResult = CheckInterlockConditions(RouteId);
            if (!CheckResult.bPassed)
            {
                UE_LOG(LogTemp, Warning, TEXT("Interlock check failed for route %s: %s - %s"),
                    *RouteId, *CheckResult.FailedCheck, *CheckResult.Details);
                OnRouteSet.Broadcast(RouteId, false);
                return false;
            }

            LockRoute(Route);
            Route.bIsActive = true;

            for (ASignalMachine* EntrySignal : Route.EntrySignals)
            {
                if (EntrySignal)
                {
                    UpdateSignalChainFromExit(EntrySignal, true);
                }
            }

            OnRouteSet.Broadcast(RouteId, true);
            return true;
        }
    }

    OnRouteSet.Broadcast(RouteId, false);
    return false;
}

void USignalLinkageController::ClearRoute(const FString& RouteId)
{
    for (FSignalRoute& Route : DefinedRoutes)
    {
        if (Route.RouteId == RouteId)
        {
            Route.bIsActive = false;
            UnlockRoute(Route);

            for (ASignalMachine* EntrySignal : Route.EntrySignals)
            {
                if (EntrySignal)
                {
                    ForceSignalToRed(EntrySignal, TEXT("进路取消"));
                }
            }

            OnRouteCleared.Broadcast(RouteId);
            break;
        }
    }
}

ASignalMachine* USignalLinkageController::FindSignalById(const FString& SignalId)
{
    ASignalMachine** Found = SignalIdMap.Find(SignalId);
    return Found ? *Found : nullptr;
}

void USignalLinkageController::HandleTrainApproaching(ASignalMachine* Signal)
{
    if (!Signal) return;

    if (bEnableStrictInterlock)
    {
        if (Signal->CurrentAspect == ESignalAspect::Red)
        {
            return;
        }
    }
}

void USignalLinkageController::HandleTrainPassed(ASignalMachine* Signal)
{
    if (!Signal) return;

    ForceSignalToRed(Signal, TEXT("列车通过"));
}

void USignalLinkageController::HandleTrainOccupyingSection(ATrackSegment* Section)
{
    if (!Section) return;

    OccupiedSections.Add(Section);
    SectionOccupancyTimestamps.Add(Section, FPlatformTime::Seconds());

    UpdateSignalBasedOnOccupancy(Section);

    if (bAutoUpdateAllSignalsOnOccupancy)
    {
        UpdateAllLinkages();
    }
}

void USignalLinkageController::HandleTrainClearingSection(ATrackSegment* Section)
{
    if (!Section) return;

    if (OccupancyClearDelaySeconds > 0.0f)
    {
        return;
    }

    OccupiedSections.Remove(Section);
    SectionOccupancyTimestamps.Remove(Section);
    UpdateSignalBasedOnOccupancy(Section);

    if (bAutoUpdateAllSignalsOnOccupancy)
    {
        UpdateAllLinkages();
    }
}

void USignalLinkageController::EmergencyStopAll()
{
    for (ASignalMachine* Signal : AllSignals)
    {
        if (Signal)
        {
            ForceSignalToRed(Signal, TEXT("紧急制动"));
        }
    }
}

FInterlockCheckResult USignalLinkageController::CheckInterlockConditions(const FString& RouteId)
{
    FInterlockCheckResult Result;

    for (const FSignalRoute& Route : DefinedRoutes)
    {
        if (Route.RouteId == RouteId)
        {
            if (!CheckSwitchPositionsForRoute(Route))
            {
                Result.bPassed = false;
                Result.FailedCheck = TEXT("SwitchPosition");
                Result.Details = TEXT("道岔位置不正确");
                return Result;
            }

            if (!CheckSectionOccupancyForRoute(Route))
            {
                Result.bPassed = false;
                Result.FailedCheck = TEXT("SectionOccupancy");
                Result.Details = TEXT("进路内有区段被占用");
                return Result;
            }

            if (!CheckSignalConflictsForRoute(Route))
            {
                Result.bPassed = false;
                Result.FailedCheck = TEXT("SignalConflict");
                Result.Details = TEXT("信号机冲突");
                return Result;
            }

            if (!CheckNoConflictingRoutes(Route))
            {
                Result.bPassed = false;
                Result.FailedCheck = TEXT("RouteConflict");
                Result.Details = TEXT("存在冲突进路");
                return Result;
            }

            break;
        }
    }

    return Result;
}

void USignalLinkageController::DefineRoute(const FSignalRoute& Route)
{
    for (int32 i = 0; i < DefinedRoutes.Num(); ++i)
    {
        if (DefinedRoutes[i].RouteId == Route.RouteId)
        {
            DefinedRoutes[i] = Route;
            return;
        }
    }

    DefinedRoutes.Add(Route);
}

void USignalLinkageController::UpdateSignalChainFromExit(ASignalMachine* StartingSignal, bool bForward)
{
    if (!StartingSignal) return;

    ESignalAspect ExitAspect = StartingSignal->CurrentAspect;

    ASignalMachine* Current = StartingSignal->PreviousSignal;
    while (Current)
    {
        Current->UpdateLinkage();
        Current = Current->PreviousSignal;
    }
}

bool USignalLinkageController::IsSectionOccupied(ATrackSegment* Section)
{
    return OccupiedSections.Contains(Section);
}

TArray<FString> USignalLinkageController::GetConflictingRoutes(const FString& RouteId)
{
    TArray<FString> Conflicting;

    const FSignalRoute* TargetRoute = nullptr;
    for (const FSignalRoute& Route : DefinedRoutes)
    {
        if (Route.RouteId == RouteId)
        {
            TargetRoute = &Route;
            break;
        }
    }

    if (!TargetRoute) return Conflicting;

    for (const FSignalRoute& Route : DefinedRoutes)
    {
        if (Route.RouteId == RouteId || !Route.bIsActive) continue;

        for (ATrackSegment* Seg : TargetRoute->TrackSections)
        {
            if (Route.TrackSections.Contains(Seg))
            {
                Conflicting.Add(Route.RouteId);
                break;
            }
        }
    }

    return Conflicting;
}

void USignalLinkageController::TickInterlock(float DeltaTime)
{
    ProcessDelayedOccupancyClear(DeltaTime);
}

void USignalLinkageController::ProcessDelayedOccupancyClear(float DeltaTime)
{
    if (OccupancyClearDelaySeconds <= 0.0f) return;

    const double CurrentTime = FPlatformTime::Seconds();
    TArray<ATrackSegment*> SectionsToClear;

    for (const auto& Pair : SectionOccupancyTimestamps)
    {
        ATrackSegment* Section = Pair.Key;
        const double OccupiedSince = Pair.Value;

        if (CurrentTime - OccupiedSince >= OccupancyClearDelaySeconds)
        {
            SectionsToClear.Add(Section);
        }
    }

    for (ATrackSegment* Section : SectionsToClear)
    {
        OccupiedSections.Remove(Section);
        SectionOccupancyTimestamps.Remove(Section);
        UpdateSignalBasedOnOccupancy(Section);
    }
}

void USignalLinkageController::UpdateSignalBasedOnOccupancy(ATrackSegment* Section)
{
    if (!Section) return;

    TArray<ASignalMachine*>* Signals = SectionToSignalsMap.Find(Section);
    if (!Signals) return;

    const bool bIsOccupied = OccupiedSections.Contains(Section);

    for (ASignalMachine* Signal : *Signals)
    {
        if (!Signal) continue;

        if (bIsOccupied)
        {
            ForceSignalToRed(Signal, TEXT("区段占用"));
        }
        else
        {
            UpdatePreviousSignals(Signal);
        }
    }
}

ESignalAspect USignalLinkageController::DetermineAspectForSignal(ASignalMachine* Signal)
{
    if (!Signal) return ESignalAspect::Red;

    if (!Signal->bIsActivated || Signal->bIsFailed) return ESignalAspect::Red;

    if (Signal->ProtectedTrack && OccupiedSections.Contains(Signal->ProtectedTrack))
    {
        return ESignalAspect::Red;
    }

    if (!Signal->NextSignal)
    {
        return ESignalAspect::Green;
    }

    switch (Signal->NextSignal->CurrentAspect)
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

bool USignalLinkageController::CheckRouteConditionsForSignal(ASignalMachine* Signal)
{
    if (!Signal) return false;

    for (const FSignalRoute& Route : DefinedRoutes)
    {
        if (!Route.bIsActive || !Route.bIsLocked) continue;

        if (Route.EntrySignals.Contains(Signal))
        {
            return true;
        }
    }

    return false;
}

void USignalLinkageController::PropagateSignalState(ASignalMachine* Signal, bool bForceRed)
{
    if (!Signal) return;

    TArray<ASignalMachine*> Order;
    ASignalMachine* Current = Signal;

    while (Current && Current->PreviousSignal)
    {
        Current = Current->PreviousSignal;
    }

    while (Current)
    {
        Order.Add(Current);
        Current = Current->NextSignal;
    }

    for (int32 i = Order.Num() - 1; i >= 0; --i)
    {
        ASignalMachine* Sig = Order[i];
        if (!Sig) continue;

        if (bForceRed)
        {
            ForceSignalToRed(Sig, TEXT("连锁强制"));
        }
        else
        {
            Sig->UpdateLinkage();
        }
    }
}

void USignalLinkageController::UpdateSignalsForSection(ATrackSegment* Section)
{
    UpdateSignalBasedOnOccupancy(Section);
}

void USignalLinkageController::UpdatePreviousSignals(ASignalMachine* ChangedSignal)
{
    if (!ChangedSignal) return;

    ASignalMachine* Current = ChangedSignal->PreviousSignal;
    while (Current)
    {
        Current->UpdateLinkage();
        Current = Current->PreviousSignal;
    }
}

void USignalLinkageController::ForceSignalToRed(ASignalMachine* Signal, const FString& Reason)
{
    if (!Signal) return;

    if (Signal->CurrentAspect != ESignalAspect::Red)
    {
        Signal->ForceAspect(ESignalAspect::Red);
        OnSignalForcedByInterlock.Broadcast(Signal, ESignalAspect::Red);
    }

    UpdatePreviousSignals(Signal);
}

bool USignalLinkageController::CheckSwitchPositionsForRoute(const FSignalRoute& Route)
{
    for (ATrackSegment* Seg : Route.TrackSections)
    {
        if (!Seg) continue;
        if (Seg->bIsSwitch)
        {
        }
    }
    return true;
}

bool USignalLinkageController::CheckSectionOccupancyForRoute(const FSignalRoute& Route)
{
    for (ATrackSegment* Seg : Route.TrackSections)
    {
        if (!Seg) continue;
        if (OccupiedSections.Contains(Seg))
        {
            return false;
        }
    }
    return true;
}

bool USignalLinkageController::CheckSignalConflictsForRoute(const FSignalRoute& Route)
{
    for (ASignalMachine* EntrySignal : Route.EntrySignals)
    {
        if (!EntrySignal) continue;
        if (EntrySignal->CurrentAspect != ESignalAspect::Red &&
            EntrySignal->CurrentAspect != ESignalAspect::Off)
        {
        }
    }
    return true;
}

bool USignalLinkageController::CheckRouteConflictsForRoute(const FSignalRoute& Route)
{
    return CheckNoConflictingRoutes(Route);
}

bool USignalLinkageController::CheckNoConflictingRoutes(const FSignalRoute& Route)
{
    for (const FSignalRoute& Other : DefinedRoutes)
    {
        if (Other.RouteId == Route.RouteId || !Other.bIsActive) continue;

        for (ATrackSegment* Seg : Route.TrackSections)
        {
            if (Other.TrackSections.Contains(Seg))
            {
                return false;
            }
        }
    }
    return true;
}

void USignalLinkageController::LockRoute(const FSignalRoute& Route)
{
    for (FSignalRoute& R : DefinedRoutes)
    {
        if (R.RouteId == Route.RouteId)
        {
            R.bIsLocked = true;
            break;
        }
    }
}

void USignalLinkageController::UnlockRoute(const FSignalRoute& Route)
{
    for (FSignalRoute& R : DefinedRoutes)
    {
        if (R.RouteId == Route.RouteId)
        {
            R.bIsLocked = false;
            break;
        }
    }
}

void USignalLinkageController::DebugPrintSignalChain()
{
    UE_LOG(LogTemp, Log, TEXT("=== Signal Chain Debug ===");

    for (ASignalMachine* Signal : AllSignals)
    {
        if (!Signal) continue;

        FString PrevId = Signal->PreviousSignal ? Signal->PreviousSignal->SignalId : TEXT("None");
        FString NextId = Signal->NextSignal ? Signal->NextSignal->SignalId : TEXT("None");

        UE_LOG(LogTemp, Log, TEXT("Signal %s: Prev=%s, Next=%s, Aspect=%d"),
            *Signal->SignalId, *PrevId, *NextId, static_cast<int32>(Signal->CurrentAspect));
    }

    UE_LOG(LogTemp, Log, TEXT("=========================="));
}

void USignalLinkageController::InjectSignalFault(const FString& SignalId, ESignalFaultType FaultType, float Duration)
{
    ASignalMachine* Signal = FindSignalById(SignalId);
    if (Signal)
    {
        Signal->InjectFault(FaultType, Duration);
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("Signal %s not found for fault injection"), *SignalId);
    }
}

void USignalLinkageController::ClearSignalFault(const FString& SignalId)
{
    ASignalMachine* Signal = FindSignalById(SignalId);
    if (Signal)
    {
        Signal->ClearFault();
    }
}

void USignalLinkageController::ClearAllSignalFaults()
{
    for (ASignalMachine* Signal : AllSignals)
    {
        if (Signal && Signal->HasFault())
        {
            Signal->ClearFault();
        }
    }
}

void USignalLinkageController::InjectRandomFault(int32 FaultCount, float MinDuration, float MaxDuration)
{
    TArray<ASignalMachine*> AvailableSignals;
    for (ASignalMachine* S : AllSignals)
    {
        if (S && !S->HasFault())
        {
            AvailableSignals.Add(S);
        }
    }

    const int32 ActualCount = FMath::Min(FaultCount, AvailableSignals.Num());
    for (int32 i = 0; i < ActualCount; ++i)
    {
        const int32 RandomIndex = FMath::RandRange(0, AvailableSignals.Num() - 1);
        ASignalMachine* Signal = AvailableSignals[RandomIndex];
        AvailableSignals.RemoveAt(RandomIndex);

        const float Duration = FMath::RandRange(MinDuration, MaxDuration);
        Signal->InjectFault(ESignalFaultType::Random, Duration);
    }
}

TArray<FString> USignalLinkageController::GetFaultedSignalIds() const
{
    TArray<FString> Ids;
    for (ASignalMachine* Signal : AllSignals)
    {
        if (Signal && Signal->HasFault())
        {
            Ids.Add(Signal->SignalId);
        }
    }
    return Ids;
}

int32 USignalLinkageController::GetFaultedSignalCount() const
{
    int32 Count = 0;
    for (ASignalMachine* Signal : AllSignals)
    {
        if (Signal && Signal->HasFault())
        {
            Count++;
        }
    }
    return Count;
}
