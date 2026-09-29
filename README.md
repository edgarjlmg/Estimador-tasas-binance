# Estimador y Monitor de Tasas Binance P2P (VES/USDT)

> ⚠️ **ESTADO:** Proyecto pausado / archivado en modo local para optimizar recursos en la nube. La documentación técnica completa, lógica de filtros y datos de muestra se encuentran en [`CONTEXTO_PROYECTO.md`](CONTEXTO_PROYECTO.md) y [`backup_datos/`](backup_datos/).

Sistema automatizado para el seguimiento de la tasa cambiaria de Binance P2P en Venezuela (VES ⇄ USDT), segmentado por banco/método de pago y montos transaccionados ($5, $20, $50, $100, $300), contrastado con las tasas oficiales del Banco Central de Venezuela (BCV).

---

## 🚀 Componentes del Proyecto

### 1. `supabase/` - Base de Datos y Métricas
- **`schema.sql`** / **`migracion_v2.sql`**: Esquemas de tablas (`p2p_ticks`, `bcv_rates`), índices compuestos por método/tipo de orden y funciones RPC para cálculo de métricas.

### 2. `worker/` - Extractor Automático (Node.js / Railway / Cloudflare)
- Extractor que consulta en paralelo mediante `Promise.all` las tasas de Binance P2P y BCV.
- Implementa la **triple validación matemática idéntica a la app de Binance** (`surplusUsdt >= usd`, `requiredVes >= minVes`, `requiredVes <= dynamicMaxVes`).
- `worker/src/runner.js`: Versión de sondeo continuo lista para correr en Railway o cualquier contenedor Node.js.

### 3. `frontend/` - Aplicación Universal (Web + Android APK)
- Desarrollada con **React Native / Expo Universal**.
- Soporte para operar tanto en Compra (BUY) como en Venta (SELL), selector de método de pago preferido, semáforo inteligente de oportunidad basado en el rango real del día (0-100%) y desglose de los 3 mejores comerciantes.

### 4. `backup_datos/` - Respaldo Local de Información
- `bcv_rates_sample.json`: Muestra histórica de tasas del BCV registradas.
- `p2p_ticks_recientes.json`: Muestra de 1.000 capturas completas de ticks del mercado P2P.

---

## 🛠️ Para Reactivar en Local o en la Nube

Consulta la sección detallada de reactivación en [`CONTEXTO_PROYECTO.md`](CONTEXTO_PROYECTO.md).
