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
  const [tradeType, setTradeType] = useState('BUY'); // 'BUY' = Comprar dólares, 'SELL' = Vender dólares
  const [selectedMethod, setSelectedMethod] = useState('PagoMovil');
  const [selectedTier, setSelectedTier] = useState('20');
  const [marketData, setMarketData] = useState(null);
  const [bcvData, setBcvData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Consultar datos de Binance P2P
  const fetchMarketSignal = async () => {
    try {
      // Intentar primero RPC V2 con parámetros de tradeType y payMethod
      const { data: v2Data, error: errV2 } = await supabase.rpc('get_market_signal_v2', {
        target_tier: `${selectedTier}usd`,
        target_trade_type: tradeType,
        target_pay_method: selectedMethod
      });

      if (!errV2 && v2Data && v2Data.current_rate !== null) {
        setMarketData(v2Data);
        return;
      }

      // Fallback a consulta directa de tabla si la RPC V2 aún no está migrada en Supabase
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
          pay_method: selectedMethod
        });
        return;
      }

      // Consulta de fallback V1 clásica
      const { data: v1Data } = await supabase.rpc('get_market_signal', {
        target_tier: `${selectedTier}usd`
      });
      if (v1Data) {
        setMarketData(v1Data);
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
      // 1. Intentar desde tabla bcv_rates en Supabase
      const { data, error } = await supabase
        .from('bcv_rates')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setBcvData(data[0]);
        return;
      }

      // 2. Fallback directo a dolarvzla.com público
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

  // Metadatos y textos del semáforo adaptados a COMPRA vs VENTA
  const getSignalMeta = () => {
    const isBuy = tradeType === 'BUY';
    const sig = marketData?.signal || 'YELLOW';

    if (sig === 'GREEN') {
      return {
        bg: '#064e3b',
        border: '#10b981',
        title: isBuy ? '¡MOMENTO ÓPTIMO PARA COMPRAR!' : '¡MOMENTO ÓPTIMO PARA VENDER!',
        desc: isBuy
          ? 'El dólar bajó de precio. Pagas menos Bolívares por USDT.'
          : 'La tasa está en su punto más alto. Te pagan más Bolívares por USDT.'
      };
    }

    if (sig === 'RED') {
      return {
        bg: '#7f1d1d',
        border: '#ef4444',
        title: isBuy ? 'PRECIO ELEVADO (ESPERAR)' : 'TASA BAJA (ESPERAR)',
        desc: isBuy
          ? 'El dólar está caro frente a la media. Si puedes, espera a que baje.'
          : 'La tasa de venta está baja frente a la media. Conviene esperar un mejor precio.'
      };
    }

    return {
      bg: '#78350f',
      border: '#f59e0b',
      title: 'PRECIO EN RANGO PROMEDIO',
      desc: 'Comportamiento normal acorde a la media del día.'
    };
  };

  const signalMeta = getSignalMeta();
  const currentRate = Number(marketData?.current_rate || 0);
  const tierNumber = Number(selectedTier);
  const totalBsP2P = currentRate * tierNumber;

  // Comparativas con el Banco Central de Venezuela
  const bcvUsd = Number(bcvData?.rate_usd || 807.38);
  const bcvEur = Number(bcvData?.rate_eur || 938.44);
  const totalBsBCV = bcvUsd * tierNumber;
  const brechaBCV = currentRate > 0 && bcvUsd > 0 ? (((currentRate - bcvUsd) / bcvUsd) * 100).toFixed(1) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>

          {/* Encabezado */}
          <View style={styles.header}>
            <Text style={styles.brandTitle}>Monitor P2P Binance</Text>
            <Text style={styles.brandSubtitle}>Venezuela (VES / USDT) • En tiempo real</Text>
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

          {/* Selector Horizontal de Métodos / Bancos */}
          <View style={styles.methodsWrapper}>
            <Text style={styles.sectionLabel}>Selecciona el Método o Banco:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.methodsScroll}>
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
            </ScrollView>
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

          {/* Tarjeta de Semáforo Inteligente */}
          <View style={[styles.signalCard, { backgroundColor: signalMeta.bg, borderColor: signalMeta.border }]}>
            <View style={[styles.signalDot, { backgroundColor: signalMeta.border }]} />
            <View style={styles.signalContent}>
              <Text style={styles.signalTitle}>{signalMeta.title}</Text>
              <Text style={styles.signalDesc}>{signalMeta.desc}</Text>
            </View>
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
            </View>
          )}

          {/* Módulo Comparativo: Tasas Oficiales Banco Central de Venezuela (BCV & Euro) */}
          <View style={styles.bcvBox}>
            <View style={styles.bcvBoxHeader}>
              <Text style={styles.bcvBoxTitle}>🏛️ Tasas Oficiales BCV (dolarvzla.com)</Text>
              {brechaBCV && (
                <View style={styles.brechaBadge}>
                  <Text style={styles.brechaText}>Brecha: +{brechaBCV}%</Text>
                </View>
              )}
            </View>

            <View style={styles.bcvGrid}>
              {/* Columna Dólar BCV */}
              <View style={styles.bcvCol}>
                <Text style={styles.bcvCurrencyLabel}>DÓLAR BCV (USD)</Text>
                <Text style={styles.bcvRateValue}>{bcvUsd.toFixed(2)} Bs</Text>
                <Text style={styles.bcvEquiv}>
                  ${selectedTier} equivalen a:{' '}
                  <Text style={styles.bcvEquivBold}>
                    {totalBsBCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                  </Text>
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
  methodsScroll: {
    paddingVertical: 2,
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131c2e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginRight: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  signalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  signalContent: {
    flex: 1,
  },
  signalTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  signalDesc: {
    color: '#f1f5f9',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
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
    alignItems: 'center',
    marginBottom: 12,
  },
  bcvBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  brechaBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  brechaText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
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
