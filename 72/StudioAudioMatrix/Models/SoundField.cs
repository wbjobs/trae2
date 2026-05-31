using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace StudioAudioMatrix.Models;

public class SoundField : INotifyPropertyChanged
{
    private double _studioWidth = 20.0;
    private double _studioHeight = 8.0;
    private double _studioDepth = 15.0;
    private int _gridResolution = 50;
    private double _ambientLevel = 30.0;
    private ObservableCollection<SoundSamplePoint> _samplePoints = new();

    public double StudioWidth
    {
        get => _studioWidth;
        set { _studioWidth = value; OnPropertyChanged(); }
    }

    public double StudioHeight
    {
        get => _studioHeight;
        set { _studioHeight = value; OnPropertyChanged(); }
    }

    public double StudioDepth
    {
        get => _studioDepth;
        set { _studioDepth = value; OnPropertyChanged(); }
    }

    public int GridResolution
    {
        get => _gridResolution;
        set { _gridResolution = value; OnPropertyChanged(); }
    }

    public double AmbientLevel
    {
        get => _ambientLevel;
        set { _ambientLevel = value; OnPropertyChanged(); }
    }

    public ObservableCollection<SoundSamplePoint> SamplePoints
    {
        get => _samplePoints;
        set { _samplePoints = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}

public class SoundSamplePoint : INotifyPropertyChanged
{
    private double _x;
    private double _y;
    private double _z;
    private double _spl;
    private double _intensity;

    public double X
    {
        get => _x;
        set { _x = value; OnPropertyChanged(); }
    }

    public double Y
    {
        get => _y;
        set { _y = value; OnPropertyChanged(); }
    }

    public double Z
    {
        get => _z;
        set { _z = value; OnPropertyChanged(); }
    }

    public double SPL
    {
        get => _spl;
        set { _spl = value; OnPropertyChanged(); }
    }

    public double Intensity
    {
        get => _intensity;
        set { _intensity = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}
