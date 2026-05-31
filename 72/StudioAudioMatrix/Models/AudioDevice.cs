using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace StudioAudioMatrix.Models;

public class AudioDevice : INotifyPropertyChanged
{
    private string _id = Guid.NewGuid().ToString("N");
    private string _name = string.Empty;
    private DeviceType _type;
    private double _x;
    private double _y;
    private double _z;
    private double _gain = 1.0;
    private double _delayMs;
    private bool _isEnabled = true;
    private string _simulatorPort = string.Empty;

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

    public DeviceType Type
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

    public double Gain
    {
        get => _gain;
        set { _gain = value; OnPropertyChanged(); }
    }

    public double DelayMs
    {
        get => _delayMs;
        set { _delayMs = value; OnPropertyChanged(); }
    }

    public bool IsEnabled
    {
        get => _isEnabled;
        set { _isEnabled = value; OnPropertyChanged(); }
    }

    public string SimulatorPort
    {
        get => _simulatorPort;
        set { _simulatorPort = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}

public enum DeviceType
{
    MainSpeaker,
    Subwoofer,
    Surround,
    Ceiling,
    StageMonitor,
    Microphone,
    LineArray
}
