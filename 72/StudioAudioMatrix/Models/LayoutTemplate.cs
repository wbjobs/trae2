using System.Collections.ObjectModel;

namespace StudioAudioMatrix.Models;

public class LayoutTemplate
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "通用";
    public string PreviewImage { get; set; } = string.Empty;
    public int DeviceCount { get; set; }
    public double StudioWidth { get; set; }
    public double StudioHeight { get; set; }
    public double StudioDepth { get; set; }
    public bool IsBuiltIn { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;

    public ObservableCollection<AudioDevice> Devices { get; set; } = new();
    public ObservableCollection<SoundZone> Zones { get; set; } = new();
    public ObservableCollection<MatrixCell> MatrixCells { get; set; } = new();
    public int MatrixRows { get; set; } = 16;
    public int MatrixColumns { get; set; } = 16;
}
