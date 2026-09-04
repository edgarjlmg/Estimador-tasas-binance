# Memoria y Contexto del Proyecto: Estimador / Monitor de Tasas Binance P2P (VES/USDT)

## 1. Repositorio y Enlaces Clave
- **Repositorio GitHub:** [https://github.com/edgarjlmg/Estimador-tasas-binance](https://github.com/edgarjlmg/Estimador-tasas-binance)
- **Documento Base:** [`PLAN_IMPLEMENTACION_BINANCE_P2P_ALERTAS.md`](file:///c:/Users/pc/Documents/Proyecto/App_Estimador_p2p/PLAN_IMPLEMENTACION_BINANCE_P2P_ALERTAS.md)

---

## 2. Decisiones de Negocio y Reglas Técnicas
1. **Criterio de Anuncios:**
   - **Sin filtro de reputación:** Se toma directamente la **mejor tasa disponible** (primer anuncio que cumpla con los límites del monto a cambiar: saldo disponible en USDT >= monto y min_ves <= total_ves <= max_ves).
2. **Métodos de Pago Soportados:**
   - `PagoMovil`, `Banesco`, `BancoDeVenezuela`, `Mercantil`, `BNC`, `Bancaribe`.
3. **Límite de la API P2P de Binance:**
   - La API de Binance retorna error de código `000002` si se solicita `rows: 30` o `rows: 25`. El límite óptimo y estable comprobado es **`rows: 20`**, el cual retorna las 20 mejores órdenes de forma confiable.
4. **Extractor Costo Cero:**
   - **Cloudflare Workers** con Cron Trigger `* * * * *` (1 ejecución cada 60s = 1.440/día, dentro de las 100.000 gratuitas diarias).
   - Incluye ejecutor de prueba local en Node.js (`worker/local-runner.js`).
5. **Base de Datos:**
   - **Supabase (PostgreSQL):** Tabla `p2p_ticks` y función RPC `get_market_signal` con índices de fecha descendente y seguridad RLS.
6. **Frontend Universal:**
   - Expo SDK con React Native Web, exportación a estático Web (`dist/`) lista para Vercel y compilación de APK Android (`eas.json`).

---

## 3. Estructura Limpia del Proyecto (Monorepo)
```text
App_Estimador_p2p/
├── .gitignore
├── README.md
├── CONTEXTO_PROYECTO.md
├── PLAN_IMPLEMENTACION_BINANCE_P2P_ALERTAS.md
├── supabase/
│   ├── schema.sql              # Creación de tabla p2p_ticks, RLS, índices y RPC get_market_signal
│   └── seed_test.sql           # Datos simulados para pruebas
├── worker/
│   ├── wrangler.toml           # Configuración de Cloudflare Worker y Cron Triggers (* * * * *)
│   ├── package.json
│   ├── local-runner.js         # Prueba directa sin dependencias
│   └── src/
│       └── index.ts            # Lógica serverless: fetch a Binance P2P + inserción en Supabase
└── frontend/
    ├── App.js                  # Componente universal reactivo con semáforo, calculadora y tiers
    ├── app.json                # Configuración Expo
    ├── eas.json                # Configuración EAS build para APK local
    ├── .env.example
    └── package.json
```

---

## 4. Estado de Implementación (Bitácora)
- **2026-09-04:**
  - Estructurado esquema SQL en [`supabase/schema.sql`](supabase/schema.sql) con RPC de cálculo de semáforo.
  - Implementado Cloudflare Worker en TypeScript con Cron Trigger de 60s en [`worker/src/index.ts`](worker/src/index.ts).
  - Creado runner local [`worker/local-runner.js`](worker/local-runner.js); validado con tasas reales de Binance P2P.
  - Inicializado y configurado frontend Expo universal en [`frontend/App.js`](frontend/App.js).
  - Probada compilación estática web (`npx expo export --platform web`) generando bundle exitosamente en `frontend/dist/`.
  - Inicializado repositorio Git y creado primer commit estructurado.
