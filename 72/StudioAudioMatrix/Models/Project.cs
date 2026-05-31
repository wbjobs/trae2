using System.Collections.ObjectModel;

namespace StudioAudioMatrix.Models;

public class Project
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "未命名工程";
    public string Description { get; set; } = string.Empty;
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime ModifiedAt { get; set; } = DateTime.Now;
    public double StudioWidth { get; set; } = 20.0;
    public double StudioHeight { get; set; } = 8.0;
    public double StudioDepth { get; set; } = 15.0;
    public ObservableCollection<AudioDevice> Devices { get; set; } = new();
    public ObservableCollection<SoundZone> Zones { get; set; } = new();
    public ObservableCollection<MatrixCell> MatrixCells { get; set; } = new();
    public ObservableCollection<TimelineTrack> Tracks { get; set; } = new();
    public int MatrixRows { get; set; } = 16;
    public int MatrixColumns { get; set; } = 16;
}
