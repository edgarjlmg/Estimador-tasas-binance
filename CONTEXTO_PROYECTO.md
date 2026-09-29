# Memoria y Contexto Completo: Estimador / Monitor de Tasas Binance P2P (VES/USDT)

> **Estado del Proyecto:** ⏹️ **Archivado / En Pausa**  
> **Fecha de Cierre:** 29 de Septiembre de 2026  
> **Repositorio GitHub:** [https://github.com/edgarjlmg/Estimador-tasas-binance](https://github.com/edgarjlmg/Estimador-tasas-binance)  

---

## 1. Resumen Ejecutivo y Motivación del Cierre

Este proyecto fue concebido y desarrollado para monitorear en tiempo real las tasas efectivas del mercado P2P de Binance (VES ⇄ USDT), segmentadas por banco/método de pago y montos transaccionados ($5, $20, $50, $100, $300), contrastándolas con la tasa oficial del Banco Central de Venezuela (BCV).

### Motivo del archivado:
- El worker en Railway estuvo corriendo ininterrumpidamente durante ~25 días generando cientos de miles de registros (~431.000 ticks en `p2p_ticks` y ~35.000 en `bcv_rates`).
- Esto agotó la cuota gratuita de base de datos en Supabase.
- Al no tener uso intensivo diario, se procedió a **detener el extractor en Railway**, realizar un **backup local de esquemas y muestras de datos en JSON**, y **vaciar la base de datos de Supabase** para liberar todo el espacio y cuota gratis.

---

## 2. Arquitectura del Sistema

```
                      ┌───────────────────────────────────────────┐
                      │             Binance P2P API               │
                      │  (https://p2p.binance.com/bapi/c2c/v2...)  │
                      └─────────────────────┬─────────────────────┘
                                            │
                                            ▼
┌───────────────────────┐            ┌──────────────┐            ┌────────────────────────┐
│  DólarVzla API (BCV)  │ ─────────► │ Worker en    │ ─────────► │ Supabase (PostgreSQL)  │
│  (Tasas USD y EUR)    │            │ Railway (V4) │            │ - p2p_ticks (anuncios) │
└───────────────────────┘            └──────────────┘            │ - bcv_rates (BCV)      │
                                                                 └───────────┬────────────┘
                                                                             │
                                                                             ▼
                                                                 ┌────────────────────────┐
                                                                 │ Frontend Expo / Web    │
                                                                 │ (React Native Web)     │
                                                                 │ - Selector Buy/Sell    │
                                                                 │ - Semáforos y Tiers    │
                                                                 │ - Rango día Min/Max    │
                                                                 └────────────────────────┘
```

---

## 3. Lecciones Técnicas Críticas y Hallazgos de Binance P2P

### A. Límites y Comportamiento de la API de Binance P2P
1. **Límite de `rows`:** La API de Binance rechaza peticiones con `rows: 30` o `rows: 25` arrojando error de código `000002`. El límite máximo y estable es **`rows: 20`**.
2. **`transAmount` en la petición:** Para obtener resultados realistas, se debe pasar `transAmount: String(Math.round(usd * lastKnownRate))`. Esto hace que Binance filtre de su lado anuncios que admitan ese volumen en Bolívares.
3. **Triple validación matemática exacta (Imitación idéntica de la App de Binance):**
   Para que un anuncio aplique fielmente al monto que el usuario ingresa, debe cumplir:
   ```javascript
   const requiredVes = usd * adv.price;
   const isValid = adv.surplusUsdt >= usd && 
                   requiredVes >= adv.minSingleTransAmount && 
                   requiredVes <= (adv.dynamicMaxSingleTransAmount || adv.maxSingleTransAmount);
   ```
4. **Comerciantes Verificados vs. Todo el Mercado:**
   - La app oficial de Binance muestra por defecto a todos los usuarios (verificados o no), ordenados estrictamente por mejor precio.
   - Parámetros: `merchantCheck: false`, `publisherType: null`.

### B. Rendimiento del Extractor (Worker V4 Paralelo)
- Se probó ejecución secuencial (tardaba >40s por ciclo).
- Se optimizó a **`Promise.all`** para ejecutar los 12 combos (6 métodos × 2 operaciones BUY/SELL) en paralelo, reduciendo el ciclo completo a **12 - 15 segundos**.

### C. Cálculo de Máximos, Mínimos y Semáforo Diario
- Para el semáforo inteligente, el frontend extrae el rango del día actual (00:00 UTC a la hora actual) para el método y tipo seleccionado.
- **BUY (Comprar USDT):**
  - Mejor tasa = **Mínimo** precio del día (pagas menos Bs por cada dólar).
  - Peor tasa = **Máximo** precio del día.
- **SELL (Vender USDT):**
  - Mejor tasa = **Máximo** precio del día (recibes más Bs por cada dólar).
  - Peor tasa = **Mínimo** precio del día.

---

## 4. Métodos de Pago y Tiers Soportados

- **Métodos:**
  - `PagoMovil` (Pago Móvil interbancario, 0.3% comisión referencial)
  - `BancoDeVenezuela` (BDV)
  - `Banesco`
  - `Mercantil`
  - `Provincial` (BBVA)
  - `Bancaribe`
- **Tiers de Volumen (USD):**
  - `$5`, `$20`, `$50`, `$100`, `$300`

---

## 5. Datos Respaldados en Local (`backup_datos/`)

1. [`backup_datos/bcv_rates_sample.json`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/backup_datos/bcv_rates_sample.json): Muestra histórica de 1.000 tasas del BCV registradas por el worker con `rate_usd`, `rate_eur` y porcentajes de cambio.
2. [`backup_datos/p2p_ticks_recientes.json`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/backup_datos/p2p_ticks_recientes.json): 1.000 ticks con todos los campos (`rate_5usd`, `rate_20usd`, `rate_50usd`, `rate_100usd`, `rate_300usd`, `top_traders`, `trade_type`, `pay_method`).
3. **Esquema de Base de Datos:**
   - [`supabase/schema.sql`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/supabase/schema.sql)
   - [`supabase/migracion_v2.sql`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/supabase/migracion_v2.sql)
   - [`supabase/schema_v2.sql`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/supabase/schema_v2.sql)

---

## 6. Procedimiento para Reactivar el Proyecto en el Futuro

Si en algún momento se desea reactivar la plataforma:

1. **Supabase:**
   - Crear o limpiar la base de datos y correr el script [`supabase/migracion_v2.sql`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/supabase/migracion_v2.sql) en el SQL Editor.
2. **Worker (Railway / Render / VPS):**
   - Configurar las variables de entorno:
     - `SUPABASE_URL`: URL del proyecto de Supabase.
     - `SUPABASE_SERVICE_ROLE_KEY`: Service role secret key de Supabase.
     - `DOLARVZLA_API_KEY`: API Key de DolarVzla para el BCV.
   - Ejecutar `node worker/src/runner.js`.
3. **Frontend (Expo):**
   - Configurar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   - Iniciar en local: `cd frontend && npm start` o compilar estático con `npx expo export --platform web`.
