const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const LAT = -34.6037;
const LNG = -58.3816;

// Кеш — 6 часов
const cache = {};
const CACHE_TTL = 6 * 60 * 60 * 1000;

function cached(key, fn) {
  const now = Date.now();
  if (cache[key] && now - cache[key].time < CACHE_TTL) {
    return Promise.resolve(cache[key].data);
  }
  return fn().then(data => {
    cache[key] = { data, time: now };
    return data;
  });
}

// Заголовки как у браузера при открытии preciosclaros.gob.ar
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://www.preciosclaros.gob.ar',
  'Referer': 'https://www.preciosclaros.gob.ar/',
  'x-api-key': 'qfcNgctUb27Qw5w07u0sA5pNfp51Q9mo9XhIuZpwA',
};

// Поиск продуктов
app.get('/api/productos', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json([]);

  try {
    const data = await cached(`productos:${q}`, () =>
      axios.get('https://d3e6htiiul5ek9.cloudfront.net/prod/productos', {
        params: { string: q, limit: 30, lat: LAT, lng: LNG },
        headers: HEADERS,
        timeout: 10000,
      }).then(r => r.data)
    );
    res.json(data.productos || []);
  } catch (e) {
    console.error('Error productos:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Цены конкретного продукта
app.get('/api/producto/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const sucursales = await cached('sucursales', () =>
      axios.get('https://d3e6htiiul5ek9.cloudfront.net/prod/sucursales', {
        params: { lat: LAT, lng: LNG, limit: 50 },
        headers: HEADERS,
        timeout: 10000,
      }).then(r => r.data.sucursales || [])
    );

    const ids = sucursales.map(s => s.id).slice(0, 15).join(',');

    const data = await cached(`producto:${id}`, () =>
      axios.get('https://d3e6htiiul5ek9.cloudfront.net/prod/producto', {
        params: { id_producto: id, array_sucursales: ids, limit: 15 },
        headers: HEADERS,
        timeout: 10000,
      }).then(r => r.data)
    );

    res.json(data.sucursales || []);
  } catch (e) {
    console.error('Error producto:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', message: 'PreciosBA backend corriendo' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor en puerto ${PORT}`));
