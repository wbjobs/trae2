import axios from 'axios';

export interface GeoCodeResult {
  province: string | null;
  city: string | null;
  district: string | null;
  address: string;
  formatted_address: string;
}

export interface ReverseGeoCodeParams {
  latitude: number;
  longitude: number;
  provider?: 'gaode' | 'baidu';
}

const GAODE_BASE_URL = 'https://restapi.amap.com/v3';
const BAIDU_BASE_URL = 'https://api.map.baidu.com';

export async function reverseGeocode(
  params: ReverseGeoCodeParams
): Promise<GeoCodeResult | null> {
  const { latitude, longitude, provider = process.env.GEOCODER_PROVIDER || 'gaode' } = params;

  try {
    if (provider === 'gaode') {
      return await gaodeReverseGeocode(latitude, longitude);
    } else {
      return await baiduReverseGeocode(latitude, longitude);
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

async function gaodeReverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeoCodeResult | null> {
  const apiKey = process.env.GAODE_API_KEY;

  if (!apiKey || apiKey === 'your_gaode_api_key') {
    return null;
  }

  try {
    const response = await axios.get(`${GAODE_BASE_URL}/geocode/regeo`, {
      params: {
        key: apiKey,
        location: `${longitude},${latitude}`,
        extensions: 'base'
      }
    });

    if (response.data.status === '1') {
      const regeo = response.data.regeocode;
      const addressComponent = regeo.addressComponent || {};

      return {
        province: addressComponent.province || null,
        city: typeof addressComponent.city === 'string' ? addressComponent.city : null,
        district: addressComponent.district || null,
        address: regeo.formatted_address || '',
        formatted_address: regeo.formatted_address || ''
      };
    }

    return null;
  } catch (error) {
    console.error('Gaode geocoding error:', error);
    return null;
  }
}

async function baiduReverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeoCodeResult | null> {
  const apiKey = process.env.BAIDU_API_KEY;

  if (!apiKey || apiKey === 'your_baidu_api_key') {
    return null;
  }

  try {
    const response = await axios.get(`${BAIDU_BASE_URL}/reverse_geocoding/v3/`, {
      params: {
        ak: apiKey,
        location: `${latitude},${longitude}`,
        output: 'json'
      }
    });

    if (response.data.status === 0) {
      const result = response.data.result;
      const addressComponent = result.addressComponent || {};

      return {
        province: addressComponent.province || null,
        city: addressComponent.city || null,
        district: addressComponent.district || null,
        address: result.formatted_address || '',
        formatted_address: result.formatted_address || ''
      };
    }

    return null;
  } catch (error) {
    console.error('Baidu geocoding error:', error);
    return null;
  }
}

export function parseCoordinates(coordString: string): { latitude: number; longitude: number } | null {
  const cleaned = coordString.trim();
  const patterns = [
    /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/,
    /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/,
    /^([NSns])?\s*(-?\d+\.?\d*°?)\s*[, ]\s*([EWew])?\s*(-?\d+\.?\d*°?)$/
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      if (match.length === 3) {
        return {
          latitude: parseFloat(match[1]),
          longitude: parseFloat(match[2])
        };
      }
      if (match.length === 5) {
        let lat = parseFloat(match[2].replace('°', ''));
        let lon = parseFloat(match[4].replace('°', ''));

        if (match[1]?.toLowerCase() === 's') lat = -lat;
        if (match[3]?.toLowerCase() === 'w') lon = -lon;

        return { latitude: lat, longitude: lon };
      }
    }
  }

  return null;
}
