const TARGET_AMOUNTS = [5, 20, 50, 100, 300];

// Métodos de pago independientes admitidos en Binance P2P VES
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

/**
 * Consulta la API de dolarvzla.com para sincronizar las tasas del Banco Central de Venezuela (USD y EUR)
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
        console.log(`[BCV] Tasas sincronizadas: USD = ${record.rate_usd} Bs | EUR = ${record.rate_eur} Bs`);
      }
    }
  } catch (err) {
    console.error('[BCV] Error sincronizando dolarvzla:', err.message);
  }
}

/**
 * Sondea y guarda ticks de un método y tipo de comercio en particular
 */
async function fetchAndStoreP2P(methodId, tradeType) {
  try {
    const payload = {
      asset: 'USDT',
      fiat: 'VES',
      merchantCheck: false,
      page: 1,
      payTypes: [methodId],
      publisherType: null,
      rows: 20,
      tradeType: tradeType // 'BUY' (para comprar USDT con Bs) o 'SELL' (para vender USDT por Bs)
    };

    const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) return;

    const json = await response.json();
    const rawAds = json.data || [];

    const parsedAds = rawAds
      .map(item => ({
        price: parseFloat(item.adv.price),
        minVes: parseFloat(item.adv.minSingleTransAmount),
        maxVes: parseFloat(item.adv.dynamicMaxSingleTransAmount || item.adv.maxSingleTransAmount),
        surplusUsdt: parseFloat(item.adv.surplusAmount)
      }))
      .filter(a => a.price > 0 && !isNaN(a.price));

    if (parsedAds.length === 0) return;

    // Si es BUY: el comprador busca pagar el menor precio (orden ascendente)
    // Si es SELL: el vendedor busca recibir el mayor precio (orden descendente)
    if (tradeType === 'BUY') {
      parsedAds.sort((a, b) => a.price - b.price);
    } else {
      parsedAds.sort((a, b) => b.price - a.price);
    }

    const top5 = parsedAds.slice(0, 5);
    const marketAvg = top5.reduce((sum, a) => sum + a.price, 0) / top5.length;

    const tierResults = {};
    for (const usd of TARGET_AMOUNTS) {
      let matched = null;
      for (const ad of parsedAds) {
        const requiredVes = usd * ad.price;
        if (ad.surplusUsdt >= usd && requiredVes >= ad.minVes && requiredVes <= ad.maxVes) {
          matched = ad.price;
          break;
        }
      }
      tierResults[`rate_${usd}usd`] = matched ?? parsedAds[0].price;
    }

    const record = {
      trade_type: tradeType,
      pay_method: methodId,
      rate_5usd: Number(tierResults.rate_5usd.toFixed(4)),
      rate_20usd: Number(tierResults.rate_20usd.toFixed(4)),
      rate_50usd: Number(tierResults.rate_50usd.toFixed(4)),
      rate_100usd: Number(tierResults.rate_100usd.toFixed(4)),
      rate_300usd: Number(tierResults.rate_300usd.toFixed(4)),
      market_avg: Number(marketAvg.toFixed(4)),
      valid_ads_count: parsedAds.length
    };

    await fetch(`${SUPABASE_URL}/rest/v1/p2p_ticks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(record)
    });

  } catch (err) {
    console.error(`[P2P] Error procesando ${methodId} (${tradeType}):`, err.message);
  }
}

/**
 * Ciclo general de sondeo: recorre cada método de pago tanto en BUY como en SELL
 */
async function runAllCycles() {
  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] Ejecutando ciclo de sondeo Binance P2P & BCV...`);

  // 1. Sincronizar BCV cada ciclo
  await syncBcvRates();

  // 2. Sondear cada método por separado para COMPRAR y para VENDER
  for (const m of PAY_METHODS) {
    await fetchAndStoreP2P(m.id, 'BUY');
    await fetchAndStoreP2P(m.id, 'SELL');
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] Ciclo completado en ${elapsed}s.`);
}

console.log('Iniciando Extractor V2 Multi-Método y BUY/SELL (cada 60 segundos)...');
runAllCycles();
setInterval(runAllCycles, 60000);
