# Estimador y Monitor de Tasas Binance P2P (VES/USDT)

Sistema en tiempo real, automatizado y de costo cero (Free Tier) para el seguimiento de la tasa cambiaria de Binance P2P en Venezuela, con semáforo inteligente de oportunidad de compra y cálculo instantáneo por monto a cambiar.

---

## 🚀 Componentes del Proyecto

### 1. `supabase/` - Base de Datos y Métricas en Tiempo Real
- **`schema.sql`**: Define la tabla `p2p_ticks`, índices de alta velocidad, políticas de seguridad RLS y la función SQL `get_market_signal(target_tier)`.
- **`seed_test.sql`**: Ticks de prueba para inicializar métricas.

### 2. `worker/` - Extractor Automático (Cloudflare Worker)
- Extractor serverless con Cron Trigger cada 60 segundos (`* * * * *`).
- Consulta la API P2P de Binance para VES/USDT con los métodos: `PagoMovil`, `Banesco`, `BancoDeVenezuela`, `Mercantil`, `BNC` y `Bancaribe`.
- Evalúa el primer mejor postor para cubrir los montos de **$5, $20, $50, $100 y $300**.
- Inserta los registros directamente en Supabase vía REST.
- Incluye `local-runner.js` para validación local inmediata.

### 3. `frontend/` - Aplicación Universal (Web + Android APK)
- Desarrollada con **React Native / Expo Universal**.
- **Versión Web**: Exportable estáticamente a Vercel o Cloudflare Pages con diseño móvil centrado (`maxWidth: 480px`).
- **Versión Android**: Compilable a archivo `.apk` mediante EAS Build (`eas.json`).

---

## 🛠️ Guía Rápida de Configuración

### Paso 1: Configurar Supabase
1. Crea un proyecto gratuito en [Supabase](https://supabase.com).
2. Ve al **SQL Editor** en Supabase, copia el contenido de [`supabase/schema.sql`](supabase/schema.sql) y ejecútalo.
3. En la configuración de Supabase (**Project Settings -> API**), copia:
   - **Project URL**
   - **anon key** (para el frontend)
   - **service_role key** (para el worker)

### Paso 2: Desplegar el Extractor en Cloudflare Worker
```bash
cd worker
npm install
# Autenticarte en Cloudflare si aún no lo has hecho:
npx wrangler login
# Guardar la clave secreta de Supabase:
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Desplegar:
npm run deploy
```

### Paso 3: Ejecutar el Frontend Universal
```bash
cd frontend
npm install
# Iniciar en modo Web:
npm run web
# Compilar APK para Android:
npx eas build -p android --profile preview
```
