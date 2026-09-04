# Plan de Implementación Integral: Sistema Predictivo Multiplataforma (Página Web + APK Android) para Binance P2P (VES/USDT)

---

## 1. Resumen Ejecutivo y Objetivos

### 1.1. Contexto del Problema
En el mercado cambiario venezolano, la paridad Bolívares (VES) a Tether (USDT) en Binance P2P experimenta fluctuaciones y micro-tendencias intradía. Para usuarios particulares, comerciantes y familias que requieren realizar conversiones recurrentes en montos específicos ($5, $20, $50, $100, $300), comprar en momentos de baja liquidez o picos especulativos genera pérdidas continuas.

Las herramientas existentes (canales de Telegram, bots de arbitraje o redes sociales) están saturadas de ruido técnico, publicidad o barreras de entrada para usuarios adultos mayores y no técnicos.

### 1.2. Objetivo General
Construir una solución completa, automatizada y de costo cero (100% Free Tier) que combine:
1. **Motor de Sondeo de Alta Frecuencia (60s):** Extractor en Python con bypass TLS para capturar y filtrar la API P2P de Binance sin bloqueos.
2. **Base de Datos en Tiempo Real (Supabase / PostgreSQL):** Con cómputo de métricas en el servidor (medias móviles, percentiles y semáforo de compra).
3. **Plataforma Dual Frontend (Código Único Universal):**
   * **Página Web responsiva (PWA / Web App):** Accesible desde cualquier navegador de escritorio (PC) o smartphone mediante enlace directo (Vercel / Cloudflare Pages).
   * **APK Android Nativo:** Compilado directamente para instalación local en los dispositivos móviles de la familia, eliminando la dependencia de tiendas de aplicaciones.

---

## 2. Dinámica del Mercado P2P en Venezuela

Para que los cálculos de mínimos tengan validez en el mundo real, el sistema debe incorporar la microestructura del mercado cambiario venezolano.

### 2.1. Factores Macroeconómicos y Bancarios
* **Franja Bancaria Operativa (9:00 AM – 1:00 PM):** Coincide con la apertura bancaria y el mayor volumen transaccional de comercios. Hay abundancia de cajeros compitiendo en Binance, lo que reduce el *spread* (diferencia entre compra y venta) y genera las tasas más competitivas del día.
* **Cierre Bancario e Intervención del BCV (1:30 PM – 4:00 PM):** El Banco Central de Venezuela suele publicar o hacer efectivas las intervenciones cambiarias bancarias en este rango. Se observa volatilidad e incertidumbre, con cajeros ajustando márgenes al alza de forma preventiva.
* **Horario Nocturno y Madrugada (10:00 PM – 7:30 AM):** El número de cajeros verificados activos cae drásticamente. Quienes permanecen en línea amplían sus márgenes para compensar el riesgo operativo fuera de horario bancario regular. Salvo excepciones anómalas, comprar en esta franja suele ser la opción más costosa.
* **Efecto Quincena (Días 14–16 y 29–31):** Presión compradora masiva derivada del pago de salarios y bonificaciones. La pendiente diaria suele ser pronunciada al alza, reduciendo la efectividad de esperar "bajas" prolongadas.

### 2.2. Métodos de Pago y Liquidez
* **Pago Móvil (P2P Interbancario):** Es el método dominante para montos de $5 a $50 debido a su acreditación instantánea. Los cajeros suelen cobrar una ligera prima por la inmediatez y el consumo del límite bancario diario.
* **Transferencias Directas (Banesco, Banco de Venezuela, Mercantil, Provincial):** Manejan montos mayores ($50 a $300+). El sistema se enfoca prioritariamente en **Pago Móvil** y **Banco de Venezuela / Banesco**, que concentran más del 80% del volumen minorista.

### 2.3. La Distorsión del "Ticket Size" (Montos)
Un anunciante que vende a partir de $300 ofrece una tasa sensiblemente menor que uno que vende desde $5 o $20. 
* Si se consulta el mercado de manera global sin discriminar el monto, el precio reflejado será el de órdenes mayoristas inalcanzables para una compra de $20.
* El sistema calcula el precio efectivo **exacto** para cada umbral: $5, $20, $50, $100 y $300.

### 2.4. Filtrado de Anuncios Fantasma ("Ghost Ads") y Bots de Arbitraje
* En sondeos de 1 minuto aparecen ofertas atípicamente baratas tomadas al instante por bots de arbitraje automático o provenientes de perfiles sin historial confiable.
* **Regla de Inclusión del Sistema:** Solo se procesan anuncios de comerciantes con:
  * `finishRate` >= 95% (tasa de finalización).
  * `completedOrders` >= 50 órdenes completadas.
  * Anuncio con saldo disponible suficiente para cubrir el monto evaluado.

---

## 3. Arquitectura del Sistema Multiplataforma

El sistema opera bajo una arquitectura desacoplada donde el backend y la base de datos alimentan simultáneamente tanto a la Web como a la APK móvil.

```
+-----------------------------------------------------------------------+
|                         BINANCE P2P API                               |
|   POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search    |
+-----------------------------------+-----------------------------------+
                                    | (1 petición POST cada 60 seg)
                                    v
+-----------------------------------------------------------------------+
|                    WORKER EXTRACTOR (Python / cffi)                   |
| - Emula huella TLS Chrome (Bypass Cloudflare WAF 403)                 |
| - Recupera los 30 mejores anuncios en VES/USDT                        |
| - Filtra y evalúa en memoria los precios óptimos:                     |
|   [$5, $20, $50, $100, $300] según límites y reputación (>95%)        |
+-----------------------------------+-----------------------------------+
                                    |
                                    | (Insert JSON cada 60 seg)
                                    v
+-----------------------------------------------------------------------+
|                    SUPABASE (PostgreSQL Database)                     |
| - Tabla: p2p_ticks (1.440 registros/día, ~5 MB/mes)                   |
| - Función RPC: get_market_signal(tier) (Cómputo en el servidor)       |
+-----------------------------------+-----------------------------------+
                  |                                     |
                  | (REST / Realtime)                   | (REST / Realtime)
                  v                                     v
+-----------------------------------+   +-----------------------------------+
|     PÁGINA WEB RESPONSIVA (PWA)   |   |        APK MÓVIL ANDROID          |
| - Desplegada en Vercel / CF Pages |   | - Compilada con Expo EAS Build    |
| - Accesible desde PC / Safari     |   | - Instalable directa en el cel    |
| - Contenedor centrado max 480px   |   | - Notificaciones locales          |
+-----------------------------------+   +-----------------------------------+
```

---

## 4. Estrategia Antibloqueo y Sondeo por Minuto

### 4.1. El Problema del TLS Fingerprinting (Error 403 Forbidden)
Binance protege su endpoint P2P con Cloudflare / Akamai WAF. Las herramientas tradicionales de scraping (`requests`, `urllib`, `axios`) envían firmas TLS (cifrados, extensiones ALPN, curvas elípticas) características de librerías de bots, lo que resulta en bloqueo inmediato con código HTTP 403.

### 4.2. Solución: `curl_cffi` con Impersonación de Navegador
En Python, `curl_cffi` compila contra libcurl con soporte para simular de manera idéntica la huella JA3/JA4 de navegadores reales (Chrome 120+).

### 4.3. Reducción de Carga: "Single-Request Multi-Evaluation"
En lugar de disparar 5 peticiones por minuto (una para cada monto), se ejecuta **1 sola petición** con `rows: 30`. Luego, en memoria se recorren los 30 anuncios y se determina cuál es el mejor precio calificado para cubrir:
1. $5 equivalentes en VES.
2. $20 equivalentes en VES.
3. $50 equivalentes en VES.
4. $100 equivalentes en VES.
5. $300 equivalentes en VES.

* Total de llamadas al día: **1.440 llamadas**.
* Total de llamadas al mes: **43.200 llamadas** (completamente dentro de cualquier umbral seguro de uso personal).

---

## 5. Diseño de la Base de Datos (Supabase / PostgreSQL)

### 5.1. DDL de la Tabla Principal (`p2p_ticks`)

```sql
create extension if not exists "uuid-ossp";

-- Tabla de ticks por minuto
create table public.p2p_ticks (
    id bigint generated always as identity primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Tasas calculadas por monto (VES por 1 USDT)
    rate_5usd numeric(12, 4),
    rate_20usd numeric(12, 4),
    rate_50usd numeric(12, 4),
    rate_100usd numeric(12, 4),
    rate_300usd numeric(12, 4),
    
    -- Tasa promedio general del mercado (los 5 mejores anuncios calificados)
    market_avg numeric(12, 4) not null,
    
    -- Cantidad de anuncios válidos encontrados
    valid_ads_count int default 0
);

-- Índices optimizados para lecturas recientes
create index idx_p2p_ticks_created_at on public.p2p_ticks (created_at desc);
```

### 5.2. Función SQL para Métricas del Semáforo (`get_market_signal`)

```sql
create or replace function get_market_signal(target_tier text)
returns json as $$
declare
    current_val numeric;
    min_today numeric;
    avg_last_4h numeric;
    avg_today numeric;
    percentile_20 numeric;
    signal text;
    diff_percent numeric;
begin
    -- 1. Obtener el último valor registrado
    execute format(
        'select %I from public.p2p_ticks order by created_at desc limit 1',
        'rate_' || target_tier
    ) into current_val;

    -- 2. Estadísticas de las últimas 24 horas
    execute format(
        'select 
            min(%I), 
            avg(%I), 
            percentile_cont(0.20) within group (order by %I)
         from public.p2p_ticks 
         where created_at >= now() - interval ''24 hours''',
        'rate_' || target_tier,
        'rate_' || target_tier,
        'rate_' || target_tier
    ) into min_today, avg_today, percentile_20;

    -- 3. Promedio móvil corto (últimas 4 horas)
    execute format(
        'select avg(%I) from public.p2p_ticks where created_at >= now() - interval ''4 hours''',
        'rate_' || target_tier
    ) into avg_last_4h;

    -- Cálculo de desviación porcentual frente a la media de 4h
    diff_percent := round(((current_val - avg_last_4h) / avg_last_4h) * 100, 2);

    -- Lógica del semáforo:
    -- VERDE: El precio está en el 20% más bajo del día o significativamente por debajo de la media reciente
    if current_val <= percentile_20 or diff_percent <= -0.6 then
        signal := 'GREEN';
    -- ROJO: El precio está por encima del promedio reciente en más de 0.8%
    elsif diff_percent >= 0.8 then
        signal := 'RED';
    else
        signal := 'YELLOW';
    end if;

    return json_build_object(
        'current_rate', current_val,
        'min_today', min_today,
        'avg_today', round(avg_today, 4),
        'avg_last_4h', round(avg_last_4h, 4),
        'diff_percent', diff_percent,
        'signal', signal,
        'timestamp', now()
    );
end;
$$ language plpgsql;
```

---

## 6. Código del Worker Extractor (`collector.py`)

```python
import time
import json
import logging
from curl_cffi import requests
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SUPABASE_URL = "https://TU_PROYECTO.supabase.co"
SUPABASE_KEY = "TU_SUPABASE_SERVICE_ROLE_O_ANON_KEY"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BINANCE_P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"

HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "es-ES,es;q=0.9",
    "Cache-Control": "no-cache",
    "ClientType": "web",
    "Content-Type": "application/json",
    "Origin": "https://p2p.binance.com",
    "Pragma": "no-cache",
    "Referer": "https://p2p.binance.com/es/trade/all-payments/USDT?fiat=VES",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
}

PAYLOAD = {
    "asset": "USDT",
    "fiat": "VES",
    "merchantCheck": False,
    "page": 1,
    "payTypes": ["PagoMovil"],
    "publisherType": None,
    "rows": 30,
    "tradeType": "BUY"
}

TARGET_AMOUNTS = [5, 20, 50, 100, 300]

def fetch_p2p_data():
    try:
        response = requests.post(
            BINANCE_P2P_URL,
            headers=HEADERS,
            json=PAYLOAD,
            impersonate="chrome120",
            timeout=15
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "000000" and data.get("data"):
                return data["data"]
            else:
                logging.warning(f"Respuesta inesperada de Binance: {data.get('message')}")
        else:
            logging.error(f"Error HTTP {response.status_code}: {response.text[:100]}")
    except Exception as e:
        logging.error(f"Fallo en la conexión: {e}")
    return None

def process_and_store(ads):
    valid_ads = []
    for ad_obj in ads:
        adv = ad_obj.get("adv", {})
        advertiser = ad_obj.get("advertiser", {})
        
        finish_rate = float(advertiser.get("finishRate", 0)) * 100
        month_order_count = int(advertiser.get("monthOrderCount", 0))
        price = float(adv.get("price", 0))
        min_amount = float(adv.get("minSingleTransAmount", 0))
        max_amount = float(adv.get("dynamicMaxSingleTransAmount") or adv.get("maxSingleTransAmount", 0))
        surplus = float(adv.get("surplusAmount", 0))

        if finish_rate >= 95.0 and month_order_count >= 50 and price > 0:
            valid_ads.append({
                "price": price,
                "min_ves": min_amount,
                "max_ves": max_amount,
                "surplus_usdt": surplus
            })

    if not valid_ads:
        logging.warning("No se encontraron anuncios calificados.")
        return

    sorted_by_price = sorted(valid_ads, key=lambda x: x["price"])
    top_5 = sorted_by_price[:5]
    market_avg = sum(x["price"] for x in top_5) / len(top_5)

    tier_results = {}
    for usd in TARGET_AMOUNTS:
        best_price = None
        for ad in sorted_by_price:
            needed_ves = usd * ad["price"]
            if ad["min_ves"] <= needed_ves <= ad["max_ves"] and ad["surplus_usdt"] >= usd:
                best_price = ad["price"]
                break
        tier_results[f"rate_{usd}usd"] = best_price if best_price else sorted_by_price[0]["price"]

    record = {
        "rate_5usd": tier_results["rate_5usd"],
        "rate_20usd": tier_results["rate_20usd"],
        "rate_50usd": tier_results["rate_50usd"],
        "rate_100usd": tier_results["rate_100usd"],
        "rate_300usd": tier_results["rate_300usd"],
        "market_avg": round(market_avg, 4),
        "valid_ads_count": len(valid_ads)
    }

    try:
        supabase.table("p2p_ticks").insert(record).execute()
        logging.info(f"Tick guardado: Avg={market_avg:.2f} | $20={record['rate_20usd']:.2f}")
    except Exception as e:
        logging.error(f"Error al escribir en Supabase: {e}")

def main_loop():
    logging.info("Iniciando servicio de monitoreo P2P (Intervalo: 60s)...")
    while True:
        start_time = time.time()
        raw_ads = fetch_p2p_data()
        if raw_ads:
            process_and_store(raw_ads)
        
        elapsed = time.time() - start_time
        sleep_time = max(0.0, 60.0 - elapsed)
        time.sleep(sleep_time)

if __name__ == "__main__":
    main_loop()
```

---

## 7. Frontend Universal: Página Web + APK en un Solo Código (Expo Universal)

Para evitar duplicar código (mantener una web en React y una app móvil por separado), la mejor arquitectura es **Expo Universal (React Native Web)**:
1. El mismo componente `App.js` compila a **Página Web responsiva** lista para desplegar en Vercel o Cloudflare Pages.
2. El mismo componente genera el archivo instalable **Android APK** mediante `eas build`.

### 7.1. Componente Universal Responsivo (`App.js`)

```jsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU_SUPABASE_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [selectedTier, setSelectedTier] = useState('20');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSignal = async (tier) => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_market_signal', { target_tier: `${tier}usd` });
      if (!error && res) {
        setData(res);
      }
    } catch (err) {
      console.error("Error al consultar señal:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignal(selectedTier);
    const interval = setInterval(() => fetchSignal(selectedTier), 60000);
    return () => clearInterval(interval);
  }, [selectedTier]);

  const getStatusColor = (signal) => {
    if (signal === 'GREEN') return '#16a34a'; // Verde esmeralda
    if (signal === 'YELLOW') return '#ca8a04'; // Ámbar / Dorado
    return '#dc2626'; // Rojo suave
  };

  const getStatusMessage = (signal) => {
    if (signal === 'GREEN') return '¡BUEN MOMENTO PARA COMPRAR!
El dólar bajó de precio.';
    if (signal === 'YELLOW') return 'PRECIO NORMAL
Está en el promedio del día.';
    return 'PRECIO ELEVADO
Si puedes, espera un poco a que baje.';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      {/* Contenedor centralizado para que en Web (PC) no se estire de forma fea */}
      <View style={styles.mainWrapper}>
        <Text style={styles.headerTitle}>Monitor Binance P2P</Text>
        <Text style={styles.headerSubtitle}>Selecciona el monto a cambiar:</Text>

        {/* Botones de Selección */}
        <View style={styles.tierContainer}>
          {['5', '20', '50', '100', '300'].map((tier) => (
            <TouchableOpacity
              key={tier}
              style={[styles.tierButton, selectedTier === tier && styles.tierButtonActive]}
              onPress={() => setSelectedTier(tier)}
            >
              <Text style={[styles.tierButtonText, selectedTier === tier && styles.tierButtonTextActive]}>
                ${tier}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !data ? (
          <ActivityIndicator size="large" color="#38bdf8" style={{ marginVertical: 40 }} />
        ) : data ? (
          <View style={styles.cardContainer}>
            {/* Tarjeta Semáforo Visual */}
            <View style={[styles.statusCard, { backgroundColor: getStatusColor(data.signal) }]}>
              <Text style={styles.statusText}>{getStatusMessage(data.signal)}</Text>
            </View>

            {/* Tarjeta de Tasa y Conversión en Bolívares */}
            <View style={styles.dataCard}>
              <Text style={styles.label}>Tasa estimada para ${selectedTier}:</Text>
              <Text style={styles.bigRate}>
                {Number(data.current_rate).toFixed(2)} <Text style={styles.currency}>Bs/USDT</Text>
              </Text>
              
              <View style={styles.divider} />

              <Text style={styles.calcLabel}>Total que recibirás aproximadamente:</Text>
              <Text style={styles.totalBs}>
                {(Number(data.current_rate) * Number(selectedTier)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
              </Text>
            </View>

            {/* Referencias Diarias */}
            <View style={styles.referenceCard}>
              <Text style={styles.refText}>Mínimo de hoy: {Number(data.min_today).toFixed(2)} Bs</Text>
              <Text style={styles.refText}>Promedio de hoy: {Number(data.avg_today).toFixed(2)} Bs</Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity style={styles.refreshButton} onPress={() => fetchSignal(selectedTier)}>
          <Text style={styles.refreshText}>Actualizar Ahora</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 480, // Clave para Web: en pantallas de PC se mantiene compacto tipo teléfono
    padding: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: Platform.OS === 'web' ? 20 : 10,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 6,
    marginBottom: 18,
  },
  tierContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  tierButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tierButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  tierButtonText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tierButtonTextActive: {
    color: '#ffffff',
  },
  cardContainer: {
    width: '100%',
    alignItems: 'center',
  },
  statusCard: {
    width: '100%',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
  },
  dataCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  bigRate: {
    color: '#38bdf8',
    fontSize: 38,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  currency: {
    fontSize: 18,
    color: '#94a3b8',
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: '#334155',
    marginVertical: 14,
  },
  calcLabel: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  totalBs: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  referenceCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 14,
  },
  refText: {
    color: '#64748b',
    fontSize: 13,
  },
  refreshButton: {
    marginTop: 'auto',
    marginBottom: 15,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  refreshText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
```

---

## 8. Despliegue de la Página Web (Vercel / Cloudflare Pages)

Gracias a Expo Web, la exportación genera un paquete estático HTML/JS que se aloja de forma 100% gratuita con certificado SSL automático:

1. **Configurar soporte web en Expo:**
   ```bash
   npx expo install react-dom react-native-web @expo/metro-runtime
   ```
2. **Exportar paquete estático para producción:**
   ```bash
   npx expo export --platform web
   ```
   *Esto genera la carpeta optimizada `dist/`.*
3. **Despliegue Gratuito en Vercel:**
   * Conectar el repositorio de GitHub a [Vercel](https://vercel.com).
   * Framework Preset: **Other**.
   * Output Directory: **`dist`**.
   * Build Command: **`npx expo export --platform web`**.
4. **Resultado Web:**
   * Tus padres y familiares pueden abrir el enlace (ej: `https://monitor-binance-p2p.vercel.app`) desde cualquier navegador de computadora, tableta o teléfono sin instalar nada, o guardarlo en la pantalla de inicio como PWA (Acceso Directo).

---

## 9. Generación del APK Android (EAS Build)

Para instalar la aplicación como archivo `.apk` local en los teléfonos de la familia:

1. **Instalar EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```
2. **Crear archivo `eas.json` para compilar APK directo (sin pasar por Play Store):**
   ```json
   {
     "build": {
       "preview": {
         "android": {
           "buildType": "apk"
         }
       }
     }
   }
   ```
3. **Lanzar la compilación en la nube gratuita de Expo:**
   ```bash
   eas build -p android --profile preview
   ```
4. EAS generará el enlace de descarga directa con el archivo `monitor-p2p.apk`. Se puede enviar por WhatsApp o Google Drive e instalarlo en 1 minuto activando "Permitir orígenes desconocidos".

---

## 10. Plan de Implementación Paso a Paso

| Fase | Tarea Principal | Entregable / Resultado | Tiempo Estimado |
| :--- | :--- | :--- | :--- |
| **Fase 1** | Configuración de Supabase | Creación del proyecto, tabla `p2p_ticks` y función RPC `get_market_signal` ejecutadas en el editor SQL. | Día 1 |
| **Fase 2** | Despliegue del Extractor | Script `collector.py` funcionando en servidor/VPS gratuito con `curl_cffi` insertando 1 fila cada 60 seg sin errores 403. | Días 1 – 2 |
| **Fase 3** | Calibración de Datos | Registro de datos continuo por 3–5 días para verificar horarios bancarios y calibrar los umbrales del semáforo. | Días 3 – 7 |
| **Fase 4** | Desarrollo Frontend Universal | Estructuración del componente responsivo en React Native / Expo con soporte Web y Móvil. | Días 8 – 9 |
| **Fase 5** | Despliegue de Página Web | Exportación con `npx expo export --platform web` y publicación en Vercel con URL pública lista. | Día 10 |
| **Fase 6** | Compilación y Entrega de APK | Generación del `.apk` mediante `eas build`, instalación en los teléfonos de los padres y pruebas de usabilidad guiadas. | Día 11 |

---

## 11. Matriz de Riesgos y Medidas de Contingencia

1. **Riesgo: Cambio repentino de endpoints o headers por parte de Binance.**
   * *Contingencia:* El script centraliza el payload y la URL en constantes aisladas. Si Binance actualiza su API P2P, solo se ajusta el JSON del payload en el script de Python, sin tener que reinstalar la APK ni actualizar la web.
2. **Riesgo: Depreciación acelerada del Bolívar (Falsos Semáforos Rojos).**
   * *Contingencia:* La función SQL compara el precio actual contra el promedio de las últimas 4 horas (`avg_last_4h`) y no exclusivamente contra el mínimo de 24 horas. Si el mercado sube gradualmente durante el día, el semáforo se adapta a la nueva meseta de precios sin bloquear las compras.
3. **Riesgo: Visualización en pantallas de computadora.**
   * *Contingencia:* La interfaz web cuenta con un contenedor centralizado (`maxWidth: 480`) con fondo oscuro que preserva la estética limpia de aplicación móvil en cualquier monitor de escritorio sin verse estirada.
