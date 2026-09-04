# Memoria y Contexto del Proyecto: Estimador / Monitor de Tasas Binance P2P (VES/USDT)

## 1. Repositorio y Enlaces Clave
- **Repositorio GitHub:** [https://github.com/edgarjlmg/Estimador-tasas-binance](https://github.com/edgarjlmg/Estimador-tasas-binance)
- **Documento Base:** [`PLAN_IMPLEMENTACION_BINANCE_P2P_ALERTAS.md`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/PLAN_IMPLEMENTACION_BINANCE_P2P_ALERTAS.md)

---

## 2. Decisiones de Negocio y Reglas Actualizadas
1. **Criterio de Anuncios:**
   - **Sin filtro estricto de reputación:** Se toma directamente la **mejor tasa disponible** (primer anuncio que cumpla con los límites del monto a cambiar: saldo disponible en USDT >= monto y min_ves <= total_ves <= max_ves), sin restringir por `finishRate` ni `orderCount`. El objetivo es reflejar la tasa real más competitiva del libro de órdenes en cada momento.
2. **Métodos de Pago Soportados:**
   - `PagoMovil`
   - `Banesco`
   - `BancoDeVenezuela`
   - `Mercantil`
   - `BNC`
   - `Bancaribe`
3. **Plataforma de Ejecución del Cron / Extractor:**
   - Se evaluó y comprobó compatibilidad con **Cloudflare Workers** (Cron Triggers `* * * * *` cada 60s, 100% Free Tier, sin costo de servidor, con fetch directo a la API de Binance).
   - Alternativa disponible: Extractor en Node.js o Python con script de fondo para pruebas locales.
4. **Almacenamiento y Lógica de Señal:**
   - **Supabase (PostgreSQL Free Tier):** Tabla `p2p_ticks` y función RPC `get_market_signal`.
5. **Frontend Universal:**
   - Expo (React Native Web) con diseño responsivo (`maxWidth: 480px` en Web) y compilación nativa APK Android (`eas build`).

---

## 3. Entorno de Desarrollo Detectado
- **Node.js:** v24.19.0 (Listo)
- **Python:** 3.11.7 (Listo)
- **Git:** No inicializado localmente en la carpeta actual aún.

---

## 4. Estructura de Proyecto Acordada
```text
/
├── .github/workflows/          # CI/CD y automatizaciones
├── worker/                     # Cloudflare Worker (Cron Trigger cada 60s -> Supabase)
├── backend-local/              # Script local opcional de prueba (Node.js/Python)
├── supabase/                   # DDL, migraciones y RPC (schema.sql)
├── frontend/                   # Aplicación Expo Universal (Web + Android APK)
├── CONTEXTO_PROYECTO.md        # Bitácora continua de decisiones y arquitectura
└── PLAN_IMPLEMENTACION_BINANCE_P2P_ALERTAS.md
```

---

## 5. Historial de Decisiones y Avances (Bitácora)
- **2026-09-04:**
  - Verificado entorno: Node.js v24.19.0 y Python 3.11.7 disponibles.
  - Comprobado que la API P2P de Binance responde directamente a llamadas estándar JSON con múltiples métodos de pago (`PagoMovil`, `Banesco`, `BancoDeVenezuela`, `Mercantil`, `BNC`, `Bancaribe`).
  - Confirmado Cloudflare Workers como solución idónea costo cero para el cron de 60s.
  - Regla de filtrado ajustada: evaluación del mejor precio sin filtro de comerciante verificado.
