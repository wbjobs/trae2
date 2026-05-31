
using UnrealBuildTool;

public class RailTransitSim : ModuleRules
{
    public RailTransitSim(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "Spline",
            "ProceduralMeshComponent",
            "WebSockets",
            "Json",
            "JsonUtilities"
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "Slate",
            "SlateCore"
        });

        PublicIncludePaths.Add(ModuleDirectory + "/ThirdParty/SQLite");

        bEnforceIWYU = true;
    }
}