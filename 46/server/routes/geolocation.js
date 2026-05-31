const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/geocode', async (req, res) => {
  try {
    const { address, lat, lng, service = 'nominatim' } = req.query;

    if (!address && !(lat && lng)) {
      return res.status(400).json({ code: 400, message: '请提供地址或经纬度' });
    }

    if (lat && lng) {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat,
          lon: lng,
          format: 'json',
          zoom: 18,
          addressdetails: 1,
          accept_language: 'zh-CN'
        },
        headers: {
          'User-Agent': 'GermplasmPlatform/1.0',
          'Accept-Language': 'zh-CN'
        },
        timeout: 10000
      });

      const data = response.data;
      return res.json({
        code: 200,
        data: {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          display_name: data.display_name,
          address: data.address || {},
          country: data.address?.country,
          state: data.address?.state || data.address?.province,
          city: data.address?.city || data.address?.town || data.address?.village,
          district: data.address?.suburb || data.address?.district,
          road: data.address?.road,
          raw: data
        }
      });
    }

    if (address) {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 5,
          addressdetails: 1,
          accept_language: 'zh-CN'
        },
        headers: {
          'User-Agent': 'GermplasmPlatform/1.0',
          'Accept-Language': 'zh-CN'
        },
        timeout: 10000
      });

      const results = response.data.map(item => ({
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        display_name: item.display_name,
        address: item.address || {},
        country: item.address?.country,
        state: item.address?.state || item.address?.province,
        city: item.address?.city || item.address?.town || item.address?.village,
        district: item.address?.suburb || item.address?.district,
        type: item.type,
        class: item.class
      }));

      return res.json({
        code: 200,
        data: results,
        total: results.length
      });
    }
  } catch (err) {
    console.error('地理编码服务错误:', err.message);
    res.status(502).json({
      code: 502,
      message: '地理编码服务暂时不可用',
      error: err.message
    });
  }
});

router.get('/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ code: 400, message: '请提供经纬度' });
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json',
        zoom: 18,
        addressdetails: 1,
        accept_language: 'zh-CN'
      },
      headers: {
        'User-Agent': 'GermplasmPlatform/1.0',
        'Accept-Language': 'zh-CN'
      },
      timeout: 10000
    });

    const data = response.data;
    res.json({
      code: 200,
      data: {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        display_name: data.display_name,
        address: {
          country: data.address?.country,
          country_code: data.address?.country_code,
          state: data.address?.state || data.address?.province,
          city: data.address?.city || data.address?.town || data.address?.village || data.address?.county,
          district: data.address?.suburb || data.address?.district || data.address?.city_district,
          road: data.address?.road,
          house_number: data.address?.house_number,
          postcode: data.address?.postcode,
          full_address: data.display_name
        }
      }
    });
  } catch (err) {
    console.error('逆地理编码错误:', err.message);
    res.status(502).json({ code: 502, message: '逆地理编码服务不可用', error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q) {
      return res.status(400).json({ code: 400, message: '请提供搜索关键词' });
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q,
        format: 'json',
        limit: parseInt(limit),
        addressdetails: 1,
        accept_language: 'zh-CN'
      },
      headers: {
        'User-Agent': 'GermplasmPlatform/1.0',
        'Accept-Language': 'zh-CN'
      },
      timeout: 10000
    });

    const results = response.data.map(item => ({
      id: item.osm_id,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      name: item.display_name,
      type: item.type,
      class: item.class,
      address: item.address || {}
    }));

    res.json({ code: 200, data: results, total: results.length });
  } catch (err) {
    console.error('地点搜索错误:', err.message);
    res.status(502).json({ code: 502, message: '地点搜索服务不可用', error: err.message });
  }
});

router.get('/ip-locate', async (req, res) => {
  try {
    const response = await axios.get('https://ipapi.co/json/', { timeout: 10000 });
    const data = response.data;
    res.json({
      code: 200,
      data: {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country_name,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        currency: data.currency
      }
    });
  } catch (err) {
    console.error('IP定位错误:', err.message);
    res.status(502).json({ code: 502, message: 'IP定位服务不可用', error: err.message });
  }
});

router.get('/china/provinces', async (req, res) => {
  try {
    const provinces = [
      { code: '110000', name: '北京市' },
      { code: '120000', name: '天津市' },
      { code: '130000', name: '河北省' },
      { code: '140000', name: '山西省' },
      { code: '150000', name: '内蒙古自治区' },
      { code: '210000', name: '辽宁省' },
      { code: '220000', name: '吉林省' },
      { code: '230000', name: '黑龙江省' },
      { code: '310000', name: '上海市' },
      { code: '320000', name: '江苏省' },
      { code: '330000', name: '浙江省' },
      { code: '340000', name: '安徽省' },
      { code: '350000', name: '福建省' },
      { code: '360000', name: '江西省' },
      { code: '370000', name: '山东省' },
      { code: '410000', name: '河南省' },
      { code: '420000', name: '湖北省' },
      { code: '430000', name: '湖南省' },
      { code: '440000', name: '广东省' },
      { code: '450000', name: '广西壮族自治区' },
      { code: '460000', name: '海南省' },
      { code: '500000', name: '重庆市' },
      { code: '510000', name: '四川省' },
      { code: '520000', name: '贵州省' },
      { code: '530000', name: '云南省' },
      { code: '540000', name: '西藏自治区' },
      { code: '610000', name: '陕西省' },
      { code: '620000', name: '甘肃省' },
      { code: '630000', name: '青海省' },
      { code: '640000', name: '宁夏回族自治区' },
      { code: '650000', name: '新疆维吾尔自治区' },
      { code: '710000', name: '台湾省' },
      { code: '810000', name: '香港特别行政区' },
      { code: '820000', name: '澳门特别行政区' }
    ];
    res.json({ code: 200, data: provinces, total: provinces.length });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
