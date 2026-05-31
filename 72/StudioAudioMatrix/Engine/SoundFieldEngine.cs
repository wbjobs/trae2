using System.Diagnostics;
using StudioAudioMatrix.Models;

namespace StudioAudioMatrix.Engine;

public class SoundFieldEngine
{
    private const double AirAbsorption = 0.02;
    private const double RefIntensity = 1e-12;

    public event EventHandler<SoundFieldUpdatedEventArgs>? SoundFieldUpdated;
    public event EventHandler<ZoneSPLResultEventArgs>? ZoneSPLComputed;

    public int MaxParallelDegree { get; set; } = Environment.ProcessorCount;

    public async Task<SoundSamplePoint[]> ComputeFieldAsync(
        IEnumerable<AudioDevice> devices,
        SoundField field,
        IEnumerable<SoundZone>? zones = null,
        CancellationToken ct = default)
    {
        var devList = devices.Where(d => d.IsEnabled).ToArray();
        if (devList.Length == 0)
        {
            SoundFieldUpdated?.Invoke(this, new SoundFieldUpdatedEventArgs(Array.Empty<SoundSamplePoint>(), 0));
            return Array.Empty<SoundSamplePoint>();
        }

        int res = Math.Clamp(field.GridResolution, 10, 200);
        double stepX = field.StudioWidth / res;
        double stepY = field.StudioHeight / Math.Max(1, res / 3);
        double stepZ = field.StudioDepth / res;

        int countX = (int)(field.StudioWidth / stepX) + 1;
        int countY = (int)(field.StudioHeight / stepY) + 1;
        int countZ = (int)(field.StudioDepth / stepZ) + 1;

        var ambientI = Math.Pow(10, field.AmbientLevel / 10.0) * RefIntensity;
        var points = new SoundSamplePoint[countX * countY * countZ];
        long start = Stopwatch.GetTimestamp();

        try
        {
            Parallel.For(0, points.Length, new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelDegree,
                CancellationToken = ct
            }, i =>
            {
                int ix = i / (countY * countZ);
                int rem = i % (countY * countZ);
                int iy = rem / countZ;
                int iz = rem % countZ;

                double x = ix * stepX;
                double y = iy * stepY;
                double z = iz * stepZ;

                double it = ambientI;
                foreach (var d in devList)
                {
                    double dx = x - d.X, dy = y - d.Y, dz = z - d.Z;
                    double dist = Math.Sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < 0.01) dist = 0.01;

                    double atten = 1.0 / (dist * dist);
                    double air = Math.Exp(-AirAbsorption * dist);
                    double dir = GetDirectivity(d.Type, dx, dy, dz, dist);

                    it += d.Gain * atten * air * dir * 1e-6;
                }

                double spl = 10.0 * Math.Log10(it / RefIntensity);
                points[i] = new SoundSamplePoint
                {
                    X = x, Y = y, Z = z,
                    SPL = spl,
                    Intensity = it
                };
            });

            if (zones != null) ComputeZoneStats(points, zones);
        }
        catch (OperationCanceledException) { }

        double ms = Stopwatch.GetElapsedTime(start).TotalMilliseconds;
        SoundFieldUpdated?.Invoke(this, new SoundFieldUpdatedEventArgs(points, ms));
        return points;
    }

    private static double GetDirectivity(DeviceType type, double dx, double dy, double dz, double dist) => type switch
    {
        DeviceType.Subwoofer => 1.0,
        DeviceType.LineArray => Math.Cos(2.0 * Math.Asin(dy / dist)) * 0.5 + 0.5,
        DeviceType.Ceiling => Math.Pow(Math.Max(0, 1.0 - (dy / dist)), 2),
        _ => 0.7
    };

    private void ComputeZoneStats(SoundSamplePoint[] points, IEnumerable<SoundZone> zones)
    {
        foreach (var zone in zones.Where(z => z.IsVisible))
        {
            var inZone = points.Where(p => zone.ContainsPoint(p.X, p.Z)).ToList();
            if (inZone.Count == 0) continue;

            double avg = inZone.Average(p => p.SPL);
            double min = inZone.Min(p => p.SPL);
            double max = inZone.Max(p => p.SPL);
            double cov = inZone.Count(p => p.SPL >= zone.TargetSPL) / (double)inZone.Count;

            ZoneSPLComputed?.Invoke(this, new ZoneSPLResultEventArgs
            {
                ZoneId = zone.Id,
                ZoneName = zone.Name,
                AverageSPL = avg,
                MinSPL = min,
                MaxSPL = max,
                Coverage = cov
            });
        }
    }

    public async Task<double> ComputeCoverageRatioAsync(SoundSamplePoint[] points, double threshold = 85.0)
    {
        if (points == null || points.Length == 0) return 0.0;
        return await Task.Run(() =>
            points.Count(p => p.SPL >= threshold) / (double)points.Length);
    }
}

public class SoundFieldUpdatedEventArgs : EventArgs
{
    public SoundSamplePoint[] Points { get; }
    public double ElapsedMs { get; }

    public SoundFieldUpdatedEventArgs(SoundSamplePoint[] points, double elapsedMs)
    {
        Points = points;
        ElapsedMs = elapsedMs;
    }
}

public class ZoneSPLResultEventArgs : EventArgs
{
    public string ZoneId { get; init; } = string.Empty;
    public string ZoneName { get; init; } = string.Empty;
    public double AverageSPL { get; init; }
    public double MinSPL { get; init; }
    public double MaxSPL { get; init; }
    public double Coverage { get; init; }
}
