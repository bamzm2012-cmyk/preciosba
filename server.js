const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const API = 'https://d3e6htiiul5ek9.cloudfront.net/prod';
const LAT = -34.6037;
const LNG = -58.3816;

// Кеш — чтобы не спамить API каждую секунду
const cache = {};
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов

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

// Поиск продуктов
app.get('/api/productos', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json([]);

  try {
    const data = await cached(`productos:${q}`, () =>
      axios.get(`${API}/productos`, {
        params: { string: q, limit: 30, lat: LAT, lng: LNG },
        headers: { 'x-api-key': 'qfcNgctUb27Qw5w07u0sA5pNfp51Q9mo9XhIuZpwA' }
      }).then(r => r.data)
    );
    res.json(data.productos || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Цены конкретного продукта по супермаркетам
app.get('/api/producto/:id', async (req, res) => {
  const id = req.params.id;

  try {
    // Сначала получаем список ближайших к центру BA супермаркетов
    const sucursales = await cached('sucursales', () =>
      axios.get(`${API}/sucursales`, {
        params: { lat: LAT, lng: LNG, limit: 50 },
        headers: { 'x-api-key': 'qfcNgctUb27Qw5w07u0sA5pNfp51Q9mo9XhIuZpwA' }
      }).then(r => r.data.sucursales || [])
    );

    const ids = sucursales.map(s => s.id).slice(0, 15).join(',');

    const data = await cached(`producto:${id}`, () =>
      axios.get(`${API}/producto`, {
        params: { id_producto: id, array_sucursales: ids, limit: 15 },
        headers: { 'x-api-key': 'qfcNgctUb27Qw5w07u0sA5pNfp51Q9mo9XhIuZpwA' }
      }).then(r => r.data)
    );

    res.json(data.sucursales || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', message: 'PreciosBA backend corriendo' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
