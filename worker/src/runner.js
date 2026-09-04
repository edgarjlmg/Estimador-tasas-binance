const TARGET_AMOUNTS = [5, 20, 50, 100, 300];
const PAY_TYPES = [
  "PagoMovil",
  "Banesco",
  "BancoDeVenezuela",
  "Mercantil",
  "BNC",
  "Bancaribe"
];

const SUPABASE_URL = process.env.SUPABASE_URL || "https://oupmnztfysiexhgcgcny.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("ERROR: Debes definir la variable de entorno SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function executeTick() {
  const timestamp = new Date().toISOString();
  try {
    const payload = {
      asset: "USDT",
      fiat: "VES",
      merchantCheck: false,
      page: 1,
      payTypes: PAY_TYPES,
      publisherType: null,
      rows: 20,
      tradeType: "BUY"
    };

    const response = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify(payload)
    });

    const json = await response.json();
    const rawAds = json.data || [];

    const parsedAds = rawAds
      .map(item => ({
        price: parseFloat(item.adv.price),
        minVes: parseFloat(item.adv.minSingleTransAmount),
        maxVes: parseFloat(item.adv.dynamicMaxSingleTransAmount || item.adv.maxSingleTransAmount),
        surplusUsdt: parseFloat(item.adv.surplusAmount)
      }))
      .filter(a => a.price > 0 && !isNaN(a.price))
      .sort((a, b) => a.price - b.price);

    if (parsedAds.length === 0) {
      console.warn(`[${timestamp}] No se recibieron anuncios válidos de Binance.`);
      return;
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
      rate_5usd: Number(tierResults.rate_5usd.toFixed(4)),
      rate_20usd: Number(tierResults.rate_20usd.toFixed(4)),
      rate_50usd: Number(tierResults.rate_50usd.toFixed(4)),
      rate_100usd: Number(tierResults.rate_100usd.toFixed(4)),
      rate_300usd: Number(tierResults.rate_300usd.toFixed(4)),
      market_avg: Number(marketAvg.toFixed(4)),
      valid_ads_count: parsedAds.length
    };

    const postResponse = await fetch(`${SUPABASE_URL}/rest/v1/p2p_ticks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(record)
    });

    if (!postResponse.ok) {
      console.error(`[${timestamp}] Error al insertar en Supabase: ${postResponse.status}`);
    } else {
      console.log(`[${timestamp}] Tick guardado: $20 = ${record.rate_20usd} Bs | Avg = ${record.market_avg} Bs`);
    }
  } catch (error) {
    console.error(`[${timestamp}] Error en ciclo de sondeo:`, error.message);
  }
}

console.log("Iniciando servicio de extracción continua Binance P2P (cada 60 segundos)...");
executeTick();
setInterval(executeTick, 60000);
