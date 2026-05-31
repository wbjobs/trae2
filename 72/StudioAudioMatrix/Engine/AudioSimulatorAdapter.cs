using System.IO.Ports;
using System.Text.Json;
using System.Text;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Engine;

public class AudioSimulatorAdapter
{
    private readonly Dictionary<string, SerialPort> _ports = new();
    private readonly object _lock = new();
    private readonly EffectSimulator _localSimulator = new();

    public event EventHandler<SimulatorMessageEventArgs>? MessageReceived;
    public event EventHandler<string>? SimulatorConnected;
    public event EventHandler<string>? SimulatorDisconnected;

    public bool UseLocalSimulation { get; set; } = true;

    public async Task<bool> ConnectAsync(string portName, int baudRate = 115200)
    {
        try
        {
            lock (_lock)
            {
                if (_ports.TryGetValue(portName, out var existing) && existing.IsOpen)
                    return true;

                var port = new SerialPort(portName, baudRate)
                {
                    ReadTimeout = 1000,
                    WriteTimeout = 1000
                };
                port.Open();
                port.DataReceived += Port_DataReceived;
                _ports[portName] = port;
            }

            SimulatorConnected?.Invoke(this, portName);
            return await Task.FromResult(true);
        }
        catch
        {
            return false;
        }
    }

    public void Disconnect(string portName)
    {
        lock (_lock)
        {
            if (_ports.TryGetValue(portName, out var port))
            {
                try { port.Close(); } catch { }
                port.DataReceived -= Port_DataReceived;
                port.Dispose();
                _ports.Remove(portName);
                SimulatorDisconnected?.Invoke(this, portName);
            }
        }
    }

    private void Port_DataReceived(object sender, SerialDataReceivedEventArgs e)
    {
        var port = (SerialPort)sender;
        try
        {
            string data = port.ReadExisting();
            MessageReceived?.Invoke(this, new SimulatorMessageEventArgs(port.PortName, data));
        }
        catch { }
    }

    public async Task TriggerEffectAsync(TimelineEvent ev, double trackVolume, string? targetDeviceId)
    {
        var command = new SimulatorCommand
        {
            EventId = ev.Id,
            EffectType = ev.EffectType,
            DurationMs = (int)ev.DurationMs,
            Gain = ev.Gain * trackVolume,
            TargetDeviceId = targetDeviceId,
            Parameters = ParseParameters(ev.ParametersJson)
        };

        if (UseLocalSimulation)
        {
            await _localSimulator.SimulateAsync(command);
        }
        else
        {
            await SendCommandToAllPortsAsync(command);
        }
    }

    public async Task SendMatrixUpdateAsync(MatrixCell cell)
    {
        var command = new SimulatorCommand
        {
            CommandType = "matrix_update",
            Row = cell.Row,
            Column = cell.Column,
            Gain = cell.Gain,
            IsActive = cell.IsActive
        };

        if (UseLocalSimulation)
        {
            await _localSimulator.SimulateAsync(command);
        }
        else
        {
            await SendCommandToAllPortsAsync(command);
        }
    }

    public async Task SendDeviceConfigAsync(AudioDevice device)
    {
        var command = new SimulatorCommand
        {
            CommandType = "device_config",
            DeviceId = device.Id,
            DeviceType = device.Type.ToString(),
            Gain = device.Gain,
            DelayMs = device.DelayMs,
            X = device.X,
            Y = device.Y,
            Z = device.Z
        };

        if (UseLocalSimulation)
        {
            await _localSimulator.SimulateAsync(command);
        }
        else
        {
            await SendCommandToAllPortsAsync(command);
        }
    }

    private async Task SendCommandToAllPortsAsync(SimulatorCommand command)
    {
        string json = JsonSerializer.Serialize(command) + "\n";
        byte[] buffer = Encoding.UTF8.GetBytes(json);

        List<SerialPort> ports;
        lock (_lock) { ports = _ports.Values.Where(p => p.IsOpen).ToList(); }

        foreach (var port in ports)
        {
            try
            {
                await port.BaseStream.WriteAsync(buffer, 0, buffer.Length);
            }
            catch { }
        }
    }

    private static Dictionary<string, object> ParseParameters(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object>>(json)
                   ?? new Dictionary<string, object>();
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }

    public string[] GetAvailablePorts() => SerialPort.GetPortNames();

    public void Dispose()
    {
        lock (_lock)
        {
            foreach (var port in _ports.Values)
            {
                try { port.Close(); } catch { }
                port.Dispose();
            }
            _ports.Clear();
        }
    }
}

public class SimulatorMessageEventArgs : EventArgs
{
    public string PortName { get; }
    public string Message { get; }

    public SimulatorMessageEventArgs(string portName, string message)
    {
        PortName = portName;
        Message = message;
    }
}

public class SimulatorCommand
{
    public string CommandType { get; set; } = "trigger";
    public string? EventId { get; set; }
    public string? EffectType { get; set; }
    public int DurationMs { get; set; }
    public double Gain { get; set; }
    public string? TargetDeviceId { get; set; }
    public Dictionary<string, object>? Parameters { get; set; }
    public int Row { get; set; }
    public int Column { get; set; }
    public bool IsActive { get; set; }
    public string? DeviceId { get; set; }
    public string? DeviceType { get; set; }
    public double DelayMs { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public double Z { get; set; }
}
