using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;

namespace StudioAudioMatrix.Models;

public class SoundZone : INotifyPropertyChanged
{
    private string _id = Guid.NewGuid().ToString("N");
    private string _name = "未命名区域";
    private ZoneType _type;
    private double _x;
    private double _y;
    private double _z;
    private double _width = 5.0;
    private double _height = 3.0;
    private double _depth = 5.0;
    private string _colorHex = "#FF4CAF50";
    private double _targetSPL = 85.0;
    private bool _isVisible = true;
    private ObservableCollection<ZonePoint> _boundaryPoints = new();

    public string Id
    {
        get => _id;
        set { _id = value; OnPropertyChanged(); }
    }

    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(); }
    }

    public ZoneType Type
    {
        get => _type;
        set { _type = value; OnPropertyChanged(); }
    }

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

    public double Width
    {
        get => _width;
        set { _width = value; OnPropertyChanged(); }
    }

    public double Height
    {
        get => _height;
        set { _height = value; OnPropertyChanged(); }
    }

    public double Depth
    {
        get => _depth;
        set { _depth = value; OnPropertyChanged(); }
    }

    public string ColorHex
    {
        get => _colorHex;
        set { _colorHex = value; OnPropertyChanged(); }
    }

    public double TargetSPL
    {
        get => _targetSPL;
        set { _targetSPL = value; OnPropertyChanged(); }
    }

    public bool IsVisible
    {
        get => _isVisible;
        set { _isVisible = value; OnPropertyChanged(); }
    }

    public ObservableCollection<ZonePoint> BoundaryPoints
    {
        get => _boundaryPoints;
        set { _boundaryPoints = value; OnPropertyChanged(); }
    }

    public bool ContainsPoint(double px, double pz)
    {
        return px >= X && px <= X + Width && pz >= Z && pz <= Z + Depth;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}

public class ZonePoint : INotifyPropertyChanged
{
    private double _x;
    private double _z;

    public double X
    {
        get => _x;
        set { _x = value; OnPropertyChanged(); }
    }

    public double Z
    {
        get => _z;
        set { _z = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}

public enum ZoneType
{
    Audience,
    Stage,
    VIP,
    ControlRoom,
    Rehearsal,
    Custom
}
