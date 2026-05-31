
using UnrealBuildTool;
using System.IO;

public class RailTransitSimTarget : TargetRules
{
    public RailTransitSimTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
        ExtraModuleNames.Add("RailTransitSim");
    }
}
