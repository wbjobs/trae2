
using UnrealBuildTool;
using System.IO;

public class RailTransitSimEditorTarget : TargetRules
{
    public RailTransitSimEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
        ExtraModuleNames.Add("RailTransitSim");
    }
}
