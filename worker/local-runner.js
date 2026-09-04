/**
 * Script de prueba local para verificar la extracción directa y el cálculo de tiers.
 * Ejecutar con: node local-runner.js
 */

const TARGET_AMOUNTS = [5, 20, 50, 100, 300];
const PAY_TYPES = [
  "PagoMovil",
  "Banesco",
  "BancoDeVenezuela",
  "Mercantil",
  "BNC",
  "Bancaribe"
];

async function runLocalCheck() {
  console.log("Consultando Binance P2P (VES/USDT)...");
  
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

  try {
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

    console.log(`Anuncios recuperados: ${rawAds.length}`);

    const parsedAds = rawAds.map(item => {
      const adv = item.adv;
      return {
        price: parseFloat(adv.price),
        minVes: parseFloat(adv.minSingleTransAmount),
        maxVes: parseFloat(adv.dynamicMaxSingleTransAmount || adv.maxSingleTransAmount),
        surplusUsdt: parseFloat(adv.surplusAmount),
        methods: (adv.tradeMethods || []).map(m => m.identifier)
      };
    }).sort((a, b) => a.price - b.price);

    console.log("\n--- Primeros 3 anuncios más baratos ---");
    parsedAds.slice(0, 3).forEach((ad, i) => {
      console.log(`  [${i + 1}] Tasa: ${ad.price} Bs | Min: ${ad.minVes.toLocaleString()} Bs | Max: ${ad.maxVes.toLocaleString()} Bs | Stock: ${ad.surplusUsdt} USDT | Métodos: ${ad.methods.join(", ")}`);
    });

    console.log("\n--- Mejor precio según monto requerido (sin filtro de comerciante) ---");
    for (const usd of TARGET_AMOUNTS) {
      let matched = null;
      for (const ad of parsedAds) {
        const requiredVes = usd * ad.price;
        if (ad.surplusUsdt >= usd && requiredVes >= ad.minVes && requiredVes <= ad.maxVes) {
          matched = ad;
          break;
        }
      }
      const price = matched ? matched.price : parsedAds[0].price;
      const totalBs = (price * usd).toLocaleString("es-VE", { minimumFractionDigits: 2 });
      console.log(`  Monto $${usd}: Tasa = ${price.toFixed(2)} Bs/USDT -> Total a recibir: ${totalBs} Bs`);
    }

  } catch (error) {
    console.error("Error al ejecutar prueba local:", error);
  }
}

runLocalCheck();
