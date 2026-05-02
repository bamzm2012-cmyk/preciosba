const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const LAT = -34.6037;
const LNG = -58.3816;

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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://www.preciosclaros.gob.ar',
  'Referer': 'https://www.preciosclaros.gob.ar/',
  'x-api-key': 'qfcNgctUb27Qw5w07u0sA5pNfp51Q9mo9XhIuZpwA',
};

const CADENAS_SUPER = ['COTO','JUMBO','CARREFOUR','DIA','WALMART','DISCO','VEA','LA ANONIMA','SUPER'];

// Búsqueda de productos
app.get('/api/productos', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json([]);

  try {
    const data = await cached('productos:' + q, () =>
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

// Precios de un producto — filtrando solo supermercados reales
app.get('/api/producto/:id', async (req, res) => {
  const id = req.params.id;

  try {
    // Obtener sucursales y filtrar solo supermercados
    const sucursales = await cached('sucursales_super', () =>
      axios.get('https://d3e6htiiul5ek9.cloudfront.net/prod/sucursales', {
        params: { lat: LAT, lng: LNG, limit: 100 },
        headers: HEADERS,
        timeout: 10000,
      }).then(r => {
        const all = r.data.sucursales || [];
        return all.filter(s => {
          const b = (s.banderaDescripcion || '').toUpperCase();
          return CADENAS_SUPER.some(c => b.includes(c));
        });
      })
    );

    console.log('Sucursales supermercados encontradas:', sucursales.length);

    if (sucursales.length === 0) {
      return res.json([]);
    }

    const ids = sucursales.map(s => s.id).slice(0, 20).join(',');
    console.log('IDs usados:', ids.slice(0, 80));

    const data = await cached('producto:' + id, () =>
      axios.get('https://d3e6htiiul5ek9.cloudfront.net/prod/producto', {
        params: { id_producto: id, array_sucursales: ids, limit: 20 },
        headers: HEADERS,
        timeout: 10000,
      }).then(r => r.data)
    );

    console.log('Precios encontrados:', (data.sucursales || []).length);
    res.json(data.sucursales || []);
  } catch (e) {
    console.error('Error producto:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sucursales debug endpoint
app.get('/api/sucursales', async (req, res) => {
  try {
    const r = await axios.get('https://d3e6htiiul5ek9.cloudfront.net/prod/sucursales', {
      params: { lat: LAT, lng: LNG, limit: 100 },
      headers: HEADERS,
      timeout: 10000,
    });
    const all = r.data.sucursales || [];
    const supers = all.filter(s => {
      const b = (s.banderaDescripcion || '').toUpperCase();
      return CADENAS_SUPER.some(c => b.includes(c));
    });
    res.json({ total: all.length, supermercados: supers.length, lista: supers.slice(0, 10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', message: 'PreciosBA backend corriendo' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
