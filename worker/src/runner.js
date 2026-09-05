const TARGET_AMOUNTS = [5, 20, 50, 100, 300];

const PAY_METHODS = [
  { id: 'PagoMovil', name: 'Pago Móvil' },
  { id: 'BancoDeVenezuela', name: 'Banco de Venezuela' },
  { id: 'Banesco', name: 'Banesco' },
  { id: 'Mercantil', name: 'Mercantil' },
  { id: 'Provincial', name: 'Provincial / BBVA' },
  { id: 'Bancaribe', name: 'Bancaribe' }
];

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oupmnztfysiexhgcgcny.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOLARVZLA_KEY = process.env.DOLARVZLA_API_KEY || '563138838b3380459523707216bc2d25134bd0960c6d514e202a077237fc5afd';

if (!SERVICE_KEY) {
  console.error('ERROR: Falta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Servidor HTTP ligero para health check en plataformas en la nube (Railway, Render, Koyeb)
const http = require('http');
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'estimador-binance-extractor', uptime: process.uptime() }));
}).listen(PORT, () => {
  console.log(`[HTTP] Servidor de salud escuchando en puerto ${PORT}`);
});

// Tasa aproximada de referencia en memoria para convertir USD a VES al consultar la API
let lastKnownRate = 966.0;

/**
 * Sincronizar tasas oficiales de BCV y Euro
 */
async function syncBcvRates() {
  try {
    const res = await fetch('https://rates.dolarvzla.com/bcv/current.json', {
      headers: {
        'x-dolarvzla-key': DOLARVZLA_KEY,
        'User-Agent': 'EstimadorP2P/2.0'
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.current) {
        const record = {
          rate_usd: data.current.usd,
          rate_eur: data.current.eur,
          change_usd: data.changePercentage ? data.changePercentage.usd : 0,
          change_eur: data.changePercentage ? data.changePercentage.eur : 0,
          source: 'dolarvzla.com'
        };

        await fetch(`${SUPABASE_URL}/rest/v1/bcv_rates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(record)
        });
      }
    }
  } catch (err) {
    console.error('[BCV] Error sincronizando dolarvzla:', err.message);
  }
}

/**
 * Sondea y guarda ticks EXACTOS con transAmount filtrado por cada monto
 */
async function fetchAndStoreP2P(methodId, tradeType) {
  try {
    const tierResults = {};
    const topTradersMap = {};
    let allPrices = [];

    // Consultamos por cada monto objetivo enviando transAmount exactamente como la app de Binance
    for (const usd of TARGET_AMOUNTS) {
      const estimatedVes = Math.round(usd * lastKnownRate);

      const payload = {
        asset: 'USDT',
        fiat: 'VES',
        merchantCheck: false,
        page: 1,
        payTypes: [methodId],
        publisherType: null, // null permite ver TODOS los anuncios reales que aparecen en la app de Binance
        rows: 15,
        tradeType: tradeType,
        transAmount: String(estimatedVes) // Clave para obtener los anuncios reales y eliminar órdenes mayoristas incompatibles
      };

      const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) continue;

      const json = await response.json();
      const rawAds = json.data || [];

      // Filtrar anuncios que REALMENTE pueden cubrir el monto exacto solicitado
      // Replica la misma validacion que hace la app de Binance al ingresar un monto especifico:
      // 1. El vendedor tiene saldo suficiente (surplusUsdt >= usd)
      // 2. El monto en VES cabe dentro del limite maximo dinamico del anuncio (dynMax >= usd * price)
      // 3. El monto en VES supera el minimo del anuncio
      const qualified = rawAds
        .map(item => ({
          nickName: item.advertiser?.nickName || 'Comerciante',
          monthOrderCount: item.advertiser?.monthOrderCount || 0,
          finishRate: Math.round(((item.advertiser?.monthFinishRate ?? item.advertiser?.finishRate) || 0) * 100),
          price: parseFloat(item.adv.price),
          minVes: parseFloat(item.adv.minSingleTransAmount),
          maxVes: parseFloat(item.adv.dynamicMaxSingleTransAmount || item.adv.maxSingleTransAmount),
          surplusUsdt: parseFloat(item.adv.surplusAmount)
        }))
        .filter(a => {
          if (a.price <= 0 || isNaN(a.price)) return false;
          const requiredVes = usd * a.price;
          // El anuncio debe poder cubrir el monto exacto en USDT y en VES
          return a.surplusUsdt >= usd && requiredVes >= a.minVes && requiredVes <= a.maxVes;
        });

      if (qualified.length > 0) {
        // En BUY el primer anuncio es la tasa más baja que acepta el monto exacto
        // En SELL el primer anuncio es la tasa más alta que paga por el monto exacto
        const bestAd = qualified[0];
        tierResults[`rate_${usd}usd`] = bestAd.price;
        lastKnownRate = bestAd.price;
        allPrices.push(bestAd.price);

        // Guardamos los 3 primeros comerciantes que SÍ pueden cumplir este monto exacto
        topTradersMap[`${usd}usd`] = qualified.slice(0, 3).map(t => ({
          nickName: t.nickName,
          price: t.price,
          orders: t.monthOrderCount,
          finishRate: `${t.finishRate}%`
        }));
      } else {
        tierResults[`rate_${usd}usd`] = lastKnownRate;
        topTradersMap[`${usd}usd`] = [];
      }
    }

    if (allPrices.length === 0) return;

    const marketAvg = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;

    const record = {
      trade_type: tradeType,
      pay_method: methodId,
      rate_5usd: Number(tierResults.rate_5usd.toFixed(4)),
      rate_20usd: Number(tierResults.rate_20usd.toFixed(4)),
      rate_50usd: Number(tierResults.rate_50usd.toFixed(4)),
      rate_100usd: Number(tierResults.rate_100usd.toFixed(4)),
      rate_300usd: Number(tierResults.rate_300usd.toFixed(4)),
      market_avg: Number(marketAvg.toFixed(4)),
      valid_ads_count: allPrices.length,
      top_traders: topTradersMap
    };

    const postRes = await fetch(`${SUPABASE_URL}/rest/v1/p2p_ticks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(record)
    });

    if (postRes.ok) {
      const top1 = topTradersMap['100usd'] && topTradersMap['100usd'][0] ? topTradersMap['100usd'][0].nickName : 'N/A';
      console.log(`[P2P] ${methodId} (${tradeType}): $100 = ${record.rate_100usd} Bs (Primero: ${top1})`);
    }

  } catch (err) {
    console.error(`[P2P] Error procesando ${methodId} (${tradeType}):`, err.message);
  }
}

async function runAllCycles() {
  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] Ejecutando ciclo de sondeo exacto Binance P2P & BCV...`);

  await syncBcvRates();

  for (const m of PAY_METHODS) {
    await fetchAndStoreP2P(m.id, 'BUY');
    await fetchAndStoreP2P(m.id, 'SELL');
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] Ciclo completado en ${elapsed}s.`);
}

console.log('Iniciando Extractor V3 con transAmount exacto y Top 3 comerciantes...');
runAllCycles();
setInterval(runAllCycles, 60000);
