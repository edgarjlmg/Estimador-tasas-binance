export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface AdItem {
  adv: {
    price: string;
    minSingleTransAmount: string;
    dynamicMaxSingleTransAmount?: string;
    maxSingleTransAmount: string;
    surplusAmount: string;
  };
}

const BINANCE_P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const TARGET_AMOUNTS = [5, 20, 50, 100, 300];
const PAY_TYPES = [
  "PagoMovil",
  "Banesco",
  "BancoDeVenezuela",
  "Mercantil",
  "BNC",
  "Bancaribe"
];

/**
 * Consulta la API P2P de Binance para el par VES/USDT con los métodos bancarios seleccionados
 */
async function fetchBinanceAds(): Promise<AdItem[]> {
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

  const response = await fetch(BINANCE_P2P_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "ClientType": "web"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Error en Binance API HTTP ${response.status}: ${await response.text()}`);
  }

  const json: any = await response.json();
  if (json.code !== "000000" || !Array.isArray(json.data)) {
    throw new Error(`Respuesta inválida de Binance: ${json.message || "Sin datos"}`);
  }

  return json.data;
}

/**
 * Evalúa los mejores precios por umbral e inserta la métrica en Supabase
 */
async function processAndStore(ads: AdItem[], env: Env) {
  const parsedAds = ads
    .map((item) => {
      const adv = item.adv;
      const price = parseFloat(adv.price);
      const minVes = parseFloat(adv.minSingleTransAmount);
      const maxVes = parseFloat(adv.dynamicMaxSingleTransAmount || adv.maxSingleTransAmount);
      const surplusUsdt = parseFloat(adv.surplusAmount);

      return { price, minVes, maxVes, surplusUsdt };
    })
    .filter((ad) => ad.price > 0 && !isNaN(ad.price));

  if (parsedAds.length === 0) {
    console.warn("No se encontraron anuncios con precios válidos.");
    return;
  }

  // Ordenar de menor a mayor precio (mejor tasa de compra)
  parsedAds.sort((a, b) => a.price - b.price);

  // Promedio de los primeros 5 anuncios
  const top5 = parsedAds.slice(0, 5);
  const marketAvg = top5.reduce((sum, item) => sum + item.price, 0) / top5.length;

  // Evaluar el primer mejor postor que cubra cada monto objetivo
  const tierResults: Record<string, number> = {};

  for (const usd of TARGET_AMOUNTS) {
    let matchedPrice: number | null = null;

    for (const ad of parsedAds) {
      const requiredVes = usd * ad.price;
      // Condición: el comerciante debe tener stock en USDT y el equivalente en VES dentro de sus límites
      if (ad.surplusUsdt >= usd && requiredVes >= ad.minVes && requiredVes <= ad.maxVes) {
        matchedPrice = ad.price;
        break; // Tomar el primero (mejor postor)
      }
    }

    // Fallback: si ningún anuncio cubre exactamente el rango, tomar el más cercano
    tierResults[`rate_${usd}usd`] = matchedPrice ?? parsedAds[0].price;
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

  // Enviar a Supabase mediante la API REST de PostgREST
  const supabaseEndpoint = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/p2p_ticks`;
  const insertResponse = await fetch(supabaseEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(record)
  });

  if (!insertResponse.ok) {
    throw new Error(`Fallo al guardar en Supabase: ${insertResponse.status} ${await insertResponse.text()}`);
  }

  console.log(`Tick guardado con éxito. Promedio: ${record.market_avg} | $20: ${record.rate_20usd}`);
}

export default {
  // Manejador del Cron Trigger (ejecutado cada 60s por Cloudflare)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const ads = await fetchBinanceAds();
          await processAndStore(ads, env);
        } catch (err) {
          console.error("Error en ejecución de cron:", err);
        }
      })()
    );
  },

  // Manejador HTTP para pruebas manuales o verificación de estado
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const ads = await fetchBinanceAds();
      await processAndStore(ads, env);
      return new Response(JSON.stringify({ status: "ok", message: "Tick extraído y procesado con éxito" }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ status: "error", error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
