import { Device } from '../../../shared/types';
import {
  Anemometer,
  WindVane,
  Thermometer,
  Hygrometer,
  Barometer,
  RainGauge,
} from './devices';

interface WeatherDeviceProps {
  device: Device;
  isSelected: boolean;
  onClick: () => void;
}

export function WeatherDevice({ device, isSelected, onClick }: WeatherDeviceProps) {
  const commonProps = {
    position: device.position,
    status: device.status,
    durability: device.durability,
    isSelected,
    onClick,
  };

  switch (device.type) {
    case 'anemometer':
      return <Anemometer {...commonProps} />;
    case 'wind_vane':
      return <WindVane {...commonProps} />;
    case 'thermometer':
      return <Thermometer {...commonProps} value={device.value} />;
    case 'hygrometer':
      return <Hygrometer {...commonProps} value={device.value} />;
    case 'barometer':
      return <Barometer {...commonProps} value={device.value} />;
    case 'rain_gauge':
      return <RainGauge {...commonProps} value={device.value} />;
    default:
      return null;
  }
}
