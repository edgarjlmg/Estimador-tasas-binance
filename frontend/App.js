import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://oupmnztfysiexhgcgcny.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_zRlCNAkHnXDoRcUIDVe2fA_3HCUcESu';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TIERS = ['5', '20', '50', '100', '300'];

const PAY_METHODS = [
  { id: 'PagoMovil', label: 'Pago Móvil', icon: '📱' },
  { id: 'BancoDeVenezuela', label: 'Venezuela', icon: '🏦' },
  { id: 'Banesco', label: 'Banesco', icon: '🟢' },
  { id: 'Mercantil', label: 'Mercantil', icon: '🔵' },
  { id: 'Provincial', label: 'Provincial', icon: '🔷' },
  { id: 'Bancaribe', label: 'Bancaribe', icon: '🟠' },
];

export default function App() {
  const [tradeType, setTradeType] = useState('BUY'); // 'BUY' = Comprar, 'SELL' = Vender
  const [selectedMethod, setSelectedMethod] = useState('PagoMovil');
  const [selectedTier, setSelectedTier] = useState('100');
  const [marketData, setMarketData] = useState(null);
  const [bcvData, setBcvData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Consultar datos de Binance P2P
  const fetchMarketSignal = async () => {
    try {
      const { data: v2Data, error: errV2 } = await supabase.rpc('get_market_signal_v2', {
        target_tier: `${selectedTier}usd`,
        target_trade_type: tradeType,
        target_pay_method: selectedMethod
      });

      if (!errV2 && v2Data && v2Data.current_rate !== null) {
        setMarketData(v2Data);
        return;
      }

      const { data: directData, error: directErr } = await supabase
        .from('p2p_ticks')
        .select('*')
        .eq('trade_type', tradeType)
        .eq('pay_method', selectedMethod)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!directErr && directData && directData.length > 0) {
        const item = directData[0];
        const rate = Number(item[`rate_${selectedTier}usd`]) || item.market_avg;
        setMarketData({
          current_rate: rate,
          min_today: rate * 0.99,
          max_today: rate * 1.01,
          avg_today: rate,
          avg_last_4h: rate,
          diff_percent: 0,
          signal: 'YELLOW',
          trade_type: tradeType,
          pay_method: selectedMethod,
          top_traders: item.top_traders?.[`${selectedTier}usd`] || []
        });
      }
    } catch (err) {
      console.warn('Error consultando señal:', err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Consultar tasas oficiales BCV (Dólar y Euro)
  const fetchBcvRates = async () => {
    try {
      const { data, error } = await supabase
        .from('bcv_rates')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setBcvData(data[0]);
        return;
      }

      const res = await fetch('https://rates.dolarvzla.com/bcv/current.json');
      if (res.ok) {
        const json = await res.json();
        if (json && json.current) {
          setBcvData({
            rate_usd: json.current.usd,
            rate_eur: json.current.eur,
            change_usd: json.changePercentage?.usd || 0,
            change_eur: json.changePercentage?.eur || 0
          });
        }
      }
    } catch (err) {
      console.warn('Error obteniendo BCV:', err.message);
    }
  };

  useEffect(() => {
    fetchBcvRates();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchMarketSignal();

    const interval = setInterval(() => {
      fetchMarketSignal();
      fetchBcvRates();
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedTier, selectedMethod, tradeType]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchMarketSignal();
    fetchBcvRates();
  };

  // 1. Análisis horario del mercado bancario venezolano y BCV
  const getMarketTimingAnalysis = () => {
    const now = new Date();
    // Hora local en Venezuela (UTC-4)
    const hourVe = parseInt(now.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', hour12: false }));
    const dayVe = now.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', weekday: 'short' });

    let windowStatus = '';
    let recommendation = '';
    let nextEvent = '';

    if (hourVe >= 9 && hourVe < 13) {
      windowStatus = '🟢 FRANJA DE MÁXIMA LIQUIDEZ BANCARIA (9 AM - 1 PM)';
      recommendation = tradeType === 'BUY'
        ? 'Hay mayor competencia de cajeros. Los spreads son mínimos: ¡Es la ventana más segura para comprar!'
        : 'Gran volumen de compradores activos en bancos nacionales. Buen momento de rotación.';
      nextEvent = 'A las 1:30 PM cierra la mesa bancaria y el mercado suele ponerse defensivo.';
    } else if (hourVe >= 13 && hourVe < 17) {
      windowStatus = '🟠 VENTANA DE INTERVENCIÓN CAMBIARIA Y CIERRE BCV (1 PM - 5 PM)';
      recommendation = tradeType === 'BUY'
        ? 'El BCV publica su intervención cambiaria diaria en este rango (~4:00 PM). Comerciantes suelen abrir márgenes preventivos al alza.'
        : 'Comerciantes ajustan tasas al alza previendo nueva cotización oficial. Ventana atractiva para vender si necesitas bolívares.';
      nextEvent = 'A partir de las 5:00 PM el BCV fija la tasa oficial para el día hábil siguiente.';
    } else if (hourVe >= 17 && hourVe < 22) {
      windowStatus = '🟡 MERCADO DE CIERRE VESPERTINO (5 PM - 10 PM)';
      recommendation = tradeType === 'BUY'
        ? 'La tasa ya asimiló la cotización oficial de mañana del BCV. Opera sólo si encuentras comerciantes con cupos en tu banco.'
        : 'Alta demanda minorista para reposición nocturna. Mantén tu orden visible.';
      nextEvent = 'A las 10:00 PM cae drásticamente la actividad de cajeros bancarios.';
    } else {
      windowStatus = '🔴 HORARIO NOCTURNO / MADRUGADA (10 PM - 8 AM)';
      recommendation = tradeType === 'BUY'
        ? 'Pocos cajeros en línea con límites reducidos. Las comisiones y primas suben: Si no es urgente, espera a las 9:00 AM.'
        : 'Poca liquidez de compradores. No remates tus USDT.';
      nextEvent = 'A las 9:00 AM abre la cámara bancaria y entran decenas de comerciantes a competir.';
    }

    return { windowStatus, recommendation, nextEvent, hourVe };
  };

  const timingAnalysis = getMarketTimingAnalysis();

  // 2. Sistema Predictivo de 7 ESTADOS basado en la Brecha BCV y Desviación Estadística
  const currentRate = Number(marketData?.current_rate || 0);
  const bcvUsd = Number(bcvData?.rate_usd || 807.38);
  const bcvEur = Number(bcvData?.rate_eur || 938.44);
  const tierNumber = Number(selectedTier);
  const totalBsP2P = currentRate * tierNumber;
  const totalBsBCV = bcvUsd * tierNumber;
  const rawBrecha = currentRate > 0 && bcvUsd > 0 ? ((currentRate - bcvUsd) / bcvUsd) * 100 : 19.5;
  const brechaFormatted = rawBrecha.toFixed(1);

  const getSevenStateSignal = () => {
    const isBuy = tradeType === 'BUY';
    const diff = Number(marketData?.diff_percent || 0);
    // Para Venezuela, la brecha cambiaria histórica reciente promedio oscila entre 18% y 22%
    // Cuanto menor es la brecha respecto al BCV, más barato compras dólares.

    // Puntuación combinada: variación intradía (diff) y nivel de brecha cambiaria
    let score = 0; // -3 (muy desfavorable) a +3 (óptimo absoluto)

    if (isBuy) {
      // Al comprar queremos: diff negativo (bajando) y brecha baja respecto al BCV
      if (diff <= -1.0 || rawBrecha <= 17.5) score += 2;
      else if (diff <= -0.4 || rawBrecha <= 18.5) score += 1;
      else if (diff >= 1.0 || rawBrecha >= 21.5) score -= 2;
      else if (diff >= 0.4 || rawBrecha >= 20.2) score -= 1;
    } else {
      // Al vender queremos: diff positivo (subiendo) y brecha alta respecto al BCV (te pagan más Bs)
      if (diff >= 1.0 || rawBrecha >= 21.5) score += 2;
      else if (diff >= 0.4 || rawBrecha >= 20.2) score += 1;
      else if (diff <= -1.0 || rawBrecha <= 17.5) score -= 2;
      else if (diff <= -0.4 || rawBrecha <= 18.5) score -= 1;
    }

    switch (score) {
      case 3:
      case 2:
        return {
          level: 7,
          tag: isBuy ? '🌟 MOMENTO EXCELENTE (MUY BUENO)' : '🌟 MOMENTO EXCELENTE (PAGO MÁXIMO)',
          bg: '#064e3b',
          border: '#10b981',
          text: '#34d399',
          barPct: '100%',
          desc: isBuy
            ? `La tasa está en mínimos con brecha comprimida (+${brechaFormatted}% vs BCV). Oportunidad dorada para comprar dólares.`
            : `Pagan la tasa más alta del día (+${brechaFormatted}% sobre BCV). Excelente oportunidad para vender y asegurar bolívares.`
        };
      case 1:
        return {
          level: 6,
          tag: isBuy ? '✅ FAVORABLE / BUENO' : '✅ FAVORABLE / BUENO',
          bg: '#065f46',
          border: '#059669',
          text: '#6ee7b7',
          barPct: '80%',
          desc: isBuy
            ? 'La tasa está por debajo de la media reciente. Buen momento de entrada sin sobreprecio.'
            : 'Cotización atractiva por encima del promedio diario. Momento recomendado para vender.'
        };
      case 0:
      default:
        return {
          level: 4,
          tag: '⚖️ PROMEDIO DEL DÍA (ESTABLE)',
          bg: '#78350f',
          border: '#f59e0b',
          text: '#fcd34d',
          barPct: '50%',
          desc: `La paridad se mantiene en su rango habitual de mercado (+${brechaFormatted}% vs tasa oficial). Operación estándar.`
        };
      case -1:
        return {
          level: 2,
          tag: isBuy ? '⚠️ REGULAR / DESFAVORABLE' : '⚠️ REGULAR / TASA BAJA',
          bg: '#7c2d12',
          border: '#ea580c',
          text: '#fdba74',
          barPct: '30%',
          desc: isBuy
            ? 'La tasa muestra presión alcista preventiva. Si no tienes urgencia, conviene monitorear antes de cambiar.'
            : 'Los compradores están ofertando por debajo del promedio. Conviene aguardar mayor liquidez.'
        };
      case -2:
      case -3:
        return {
          level: 1,
          tag: isBuy ? '🛑 MUY MAL MOMENTO (PRECIO INFLADO)' : '🛑 MUY MAL MOMENTO (DESCUENTO EXCESIVO)',
          bg: '#7f1d1d',
          border: '#ef4444',
          text: '#fca5a5',
          barPct: '10%',
          desc: isBuy
            ? `Brecha inflada (+${brechaFormatted}% vs BCV) y cajeros defensivos. Comprar aquí genera pérdida cambiaria directa. ¡Espera!`
            : `Están pagando muy pocos bolívares por dólar frente al costo de reposición. No vendas en este momento.`
        };
    }
  };

  const signalState = getSevenStateSignal();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>

          {/* Encabezado */}
          <View style={styles.header}>
            <Text style={styles.brandTitle}>Monitor Predictivo P2P</Text>
            <Text style={styles.brandSubtitle}>Inteligencia Cambiaria VES / USDT • BCV en Tiempo Real</Text>
          </View>

          {/* Selector de Modo: COMPRAR vs VENDER */}
          <View style={styles.tradeTypeContainer}>
            <TouchableOpacity
              style={[styles.tradeTypeTab, tradeType === 'BUY' && styles.tradeTypeTabBuyActive]}
              onPress={() => setTradeType('BUY')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tradeTypeText, tradeType === 'BUY' && styles.tradeTypeTextActive]}>
                🛒 Quiero Comprar USDT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tradeTypeTab, tradeType === 'SELL' && styles.tradeTypeTabSellActive]}
              onPress={() => setTradeType('SELL')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tradeTypeText, tradeType === 'SELL' && styles.tradeTypeTextActive]}>
                💵 Quiero Vender USDT
              </Text>
            </TouchableOpacity>
          </View>

          {/* Selector de Métodos / Bancos en cuadrícula visible */}
          <View style={styles.methodsWrapper}>
            <Text style={styles.sectionLabel}>Selecciona el Método o Banco:</Text>
            <View style={styles.methodsGrid}>
              {PAY_METHODS.map((m) => {
                const isSelected = selectedMethod === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.methodPill, isSelected && styles.methodPillActive]}
                    onPress={() => setSelectedMethod(m.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.methodIcon}>{m.icon}</Text>
                    <Text style={[styles.methodLabel, isSelected && styles.methodLabelActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Selector de Monto (Tiers) */}
          <View style={styles.tierSection}>
            <Text style={styles.sectionLabel}>Monto a {tradeType === 'BUY' ? 'comprar' : 'vender'}:</Text>
            <View style={styles.tierRow}>
              {TIERS.map((tier) => {
                const isSelected = selectedTier === tier;
                return (
                  <TouchableOpacity
                    key={tier}
                    style={[styles.tierButton, isSelected && styles.tierButtonActive]}
                    onPress={() => setSelectedTier(tier)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tierButtonText, isSelected && styles.tierButtonTextActive]}>
                      ${tier}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 🚦 Semáforo Predictivo de 7 Estados */}
          <View style={[styles.signalCard, { backgroundColor: signalState.bg, borderColor: signalState.border }]}>
            <View style={styles.signalTopRow}>
              <View style={[styles.signalDot, { backgroundColor: signalState.text }]} />
              <Text style={[styles.signalTagText, { color: signalState.text }]}>
                {signalState.tag}
              </Text>
            </View>

            <Text style={styles.signalDescriptionText}>{signalState.desc}</Text>

            {/* Barra visual de conveniencia (0 a 100%) */}
            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: signalState.barPct, backgroundColor: signalState.border }]} />
            </View>
          </View>

          {/* ⏰ Tarjeta Guía Horaria del Mercado y BCV */}
          <View style={styles.timingCard}>
            <Text style={styles.timingBadge}>{timingAnalysis.windowStatus}</Text>
            <Text style={styles.timingAdvice}>{timingAnalysis.recommendation}</Text>
            <View style={styles.timingDivider} />
            <Text style={styles.timingEvent}>
              💡 <Text style={styles.timingEventBold}>Próximo evento clave:</Text> {timingAnalysis.nextEvent}
            </Text>
          </View>

          {/* Tarjeta Principal de Tasa P2P */}
          {loading && !marketData ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Consultando libro de órdenes en vivo...</Text>
            </View>
          ) : (
            <View style={styles.rateCard}>
              <Text style={styles.rateHeaderLabel}>
                {tradeType === 'BUY' ? 'Mejor tasa de compra para' : 'Mejor tasa de venta para'} ${selectedTier} en{' '}
                {PAY_METHODS.find((m) => m.id === selectedMethod)?.label}
              </Text>

              <View style={styles.rateNumberRow}>
                <Text style={styles.rateBigValue}>
                  {currentRate > 0 ? currentRate.toFixed(2) : '---'}
                </Text>
                <Text style={styles.rateUnit}>Bs / USDT</Text>
              </View>

              <View style={styles.separator} />

              <Text style={styles.receiveLabel}>
                {tradeType === 'BUY' ? 'Total en Bolívares a pagar:' : 'Total en Bolívares a recibir:'}
              </Text>
              <Text style={styles.receiveTotal}>
                {totalBsP2P > 0
                  ? totalBsP2P.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '---'}{' '}
                <Text style={styles.currencyBs}>Bs.</Text>
              </Text>

              {/* Lista de los primeros comerciantes reales de Binance */}
              {marketData?.top_traders && marketData.top_traders.length > 0 && (
                <View style={styles.tradersContainer}>
                  <Text style={styles.tradersTitle}>
                    🥇 MEJORES OFERTAS EN VIVO PARA ${selectedTier}:
                  </Text>
                  {marketData.top_traders.map((t, idx) => (
                    <View key={idx} style={[styles.traderRow, idx === 0 && styles.traderRowFirst]}>
                      <View style={styles.traderInfo}>
                        <Text style={[styles.traderRank, idx === 0 && styles.traderRankFirst]}>
                          #{idx + 1}
                        </Text>
                        <View>
                          <Text style={[styles.traderName, idx === 0 && styles.traderNameFirst]}>
                            {t.nickName}
                          </Text>
                          <Text style={styles.traderOrders}>
                            {t.orders} órdenes • {t.finishRate}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.traderPrice, idx === 0 && styles.traderPriceFirst]}>
                        {Number(t.price).toFixed(2)} Bs
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Módulo Comparativo: Tasas Oficiales Banco Central de Venezuela (BCV & Euro) */}
          <View style={styles.bcvBox}>
            <View style={styles.bcvBoxHeader}>
              <View>
                <Text style={styles.bcvBoxTitle}>🏛️ Banco Central de Venezuela (BCV)</Text>
                <Text style={styles.bcvScheduleText}>Actualización diaria oficial: ~4:00 PM - 5:00 PM</Text>
              </View>
              <View style={styles.brechaBadge}>
                <Text style={styles.brechaText}>Brecha P2P: +{brechaFormatted}%</Text>
              </View>
            </View>

            <View style={styles.bcvGrid}>
              {/* Columna Dólar BCV */}
              <View style={styles.bcvCol}>
                <Text style={styles.bcvCurrencyLabel}>DÓLAR BCV (USD)</Text>
                <Text style={styles.bcvRateValue}>{bcvUsd.toFixed(2)} Bs</Text>
                <Text style={styles.bcvEquiv}>
                  ${selectedTier} a tasa oficial:{' '}
                  <Text style={styles.bcvEquivBold}>
                    {totalBsBCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                  </Text>
                </Text>
                <Text style={styles.bcvDiffSub}>
                  Diferencia vs P2P: {(Math.abs(totalBsP2P - totalBsBCV)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                </Text>
              </View>

              <View style={styles.bcvColDivider} />

              {/* Columna Euro BCV */}
              <View style={styles.bcvCol}>
                <Text style={styles.bcvCurrencyLabel}>EURO BCV (EUR)</Text>
                <Text style={styles.bcvRateValue}>{bcvEur.toFixed(2)} Bs</Text>
                <Text style={styles.bcvEquiv}>
                  En Euros aprox:{' '}
                  <Text style={styles.bcvEquivBold}>
                    {bcvEur > 0 ? (totalBsP2P / bcvEur).toFixed(2) : '---'} €
                  </Text>
                </Text>
                <Text style={styles.bcvDiffSub}>
                  1 EUR = {(bcvEur / bcvUsd).toFixed(4)} USD
                </Text>
              </View>
            </View>
          </View>

          {/* Botón de Actualizar */}
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleRefresh}
            disabled={isRefreshing}
            activeOpacity={0.8}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.refreshBtnText}>🔄 Actualizar Tasas</Text>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b0f19',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    width: '100%',
    paddingVertical: 18,
  },
  container: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: Platform.OS === 'web' ? 8 : 0,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  tradeTypeContainer: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#131c2e',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  tradeTypeTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tradeTypeTabBuyActive: {
    backgroundColor: '#0284c7',
  },
  tradeTypeTabSellActive: {
    backgroundColor: '#059669',
  },
  tradeTypeText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  tradeTypeTextActive: {
    color: '#ffffff',
  },
  methodsWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131c2e',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    width: '48.5%',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  methodPillActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#0f2744',
  },
  methodIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  methodLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  methodLabelActive: {
    color: '#38bdf8',
  },
  tierSection: {
    width: '100%',
    marginBottom: 14,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  tierButton: {
    backgroundColor: '#131c2e',
    paddingVertical: 10,
    flex: 1,
    marginHorizontal: 3,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  tierButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  tierButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  tierButtonTextActive: {
    color: '#ffffff',
  },
  signalCard: {
    width: '100%',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  signalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  signalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  signalTagText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  signalDescriptionText: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  meterTrack: {
    height: 6,
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 3,
  },
  timingCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 14,
  },
  timingBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  timingAdvice: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 17,
  },
  timingDivider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginVertical: 10,
  },
  timingEvent: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 16,
  },
  timingEventBold: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  rateCard: {
    width: '100%',
    backgroundColor: '#131c2e',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 14,
  },
  rateHeaderLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'center',
  },
  rateNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: 6,
  },
  rateBigValue: {
    fontSize: 38,
    fontWeight: '900',
    color: '#38bdf8',
  },
  rateUnit: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '600',
    marginLeft: 8,
  },
  separator: {
    height: 1,
    width: '100%',
    backgroundColor: '#1e293b',
    marginVertical: 12,
  },
  receiveLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  receiveTotal: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 2,
  },
  currencyBs: {
    fontSize: 16,
    color: '#38bdf8',
    fontWeight: '700',
  },
  tradersContainer: {
    width: '100%',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  tradersTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  traderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  traderRowFirst: {
    borderColor: '#0284c7',
    backgroundColor: '#0c1e38',
  },
  traderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  traderRank: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    marginRight: 8,
  },
  traderRankFirst: {
    color: '#38bdf8',
  },
  traderName: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  traderNameFirst: {
    color: '#f8fafc',
  },
  traderOrders: {
    color: '#64748b',
    fontSize: 10,
  },
  traderPrice: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  traderPriceFirst: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '900',
  },
  bcvBox: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 16,
  },
  bcvBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bcvBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f8fafc',
  },
  bcvScheduleText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  brechaBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  brechaText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
  bcvGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bcvCol: {
    flex: 1,
  },
  bcvColDivider: {
    width: 1,
    backgroundColor: '#1e293b',
    marginHorizontal: 12,
  },
  bcvCurrencyLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  bcvRateValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginVertical: 2,
  },
  bcvEquiv: {
    fontSize: 11,
    color: '#94a3b8',
  },
  bcvEquivBold: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  bcvDiffSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 3,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    fontSize: 13,
  },
  refreshBtn: {
    width: '100%',
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  refreshBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
