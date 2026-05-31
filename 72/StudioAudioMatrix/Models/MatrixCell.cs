using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace StudioAudioMatrix.Models;

public class MatrixCell : INotifyPropertyChanged
{
    private int _row;
    private int _column;
    private double _signalLevel;
    private bool _isActive;
    private string? _sourceDeviceId;
    private string? _targetDeviceId;
    private double _gain = 1.0;
    private double _phase;

    public int Row
    {
        get => _row;
        set { _row = value; OnPropertyChanged(); }
    }

    public int Column
    {
        get => _column;
        set { _column = value; OnPropertyChanged(); }
    }

    public double SignalLevel
    {
        get => _signalLevel;
        set { _signalLevel = value; OnPropertyChanged(); }
    }

    public bool IsActive
    {
        get => _isActive;
        set { _isActive = value; OnPropertyChanged(); }
    }

    public string? SourceDeviceId
    {
        get => _sourceDeviceId;
        set { _sourceDeviceId = value; OnPropertyChanged(); }
    }

    public string? TargetDeviceId
    {
        get => _targetDeviceId;
        set { _targetDeviceId = value; OnPropertyChanged(); }
    }

    public double Gain
    {
        get => _gain;
        set { _gain = value; OnPropertyChanged(); }
    }

    public double Phase
    {
        get => _phase;
        set { _phase = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
}
