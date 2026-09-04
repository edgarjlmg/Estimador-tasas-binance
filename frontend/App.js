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

// Configuración de Supabase (reemplazar con las credenciales de tu proyecto)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://TU_PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "TU_SUPABASE_ANON_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TIERS = ['5', '20', '50', '100', '300'];

export default function App() {
  const [selectedTier, setSelectedTier] = useState('20');
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchMarketSignal = async (tier) => {
    try {
      setErrorMsg(null);
      const { data, error } = await supabase.rpc('get_market_signal', {
        target_tier: `${tier}usd`
      });

      if (error) {
        throw error;
      }

      if (data) {
        setMarketData(data);
      }
    } catch (err) {
      console.warn("No se pudo conectar a Supabase, mostrando datos de demostración si aplica:", err.message);
      // Datos de demostración de contingencia si Supabase aún no está conectado
      setMarketData(prev => prev || {
        current_rate: 966.00,
        min_today: 955.00,
        avg_today: 958.50,
        avg_last_4h: 962.00,
        diff_percent: 0.42,
        signal: 'YELLOW',
        is_demo: true
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMarketSignal(selectedTier);

    // Actualización automática cada 60 segundos
    const timer = setInterval(() => {
      fetchMarketSignal(selectedTier);
    }, 60000);

    return () => clearInterval(timer);
  }, [selectedTier]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchMarketSignal(selectedTier);
  };

  const getSignalMeta = (signal) => {
    switch (signal) {
      case 'GREEN':
        return {
          bgColor: '#065f46',
          borderColor: '#10b981',
          badgeText: 'MOMENTO ÓPTIMO PARA COMPRAR',
          desc: 'La tasa está en los niveles más bajos de la jornada.'
        };
      case 'RED':
        return {
          bgColor: '#7f1d1d',
          borderColor: '#ef4444',
          badgeText: 'PRECIO ELEVADO',
          desc: 'La tasa está por encima de la media reciente. Si puedes, espera.'
        };
      case 'YELLOW':
      default:
        return {
          bgColor: '#78350f',
          borderColor: '#f59e0b',
          badgeText: 'PRECIO EN RANGO PROMEDIO',
          desc: 'Comportamiento regular acorde a la media del día.'
        };
    }
  };

  const signalMeta = getSignalMeta(marketData?.signal);
  const currentRate = Number(marketData?.current_rate || 0);
  const totalBs = currentRate * Number(selectedTier);

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

          {/* Selector de Montos (Tiers) */}
          <View style={styles.tierSection}>
            <Text style={styles.sectionLabel}>Selecciona el monto en dólares a cambiar:</Text>
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

          {/* Tarjeta de Estado y Semáforo */}
          {loading && !marketData ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Consultando mejores ofertas...</Text>
            </View>
          ) : (
            <View style={styles.cardWrapper}>
              
              {/* Semáforo Visual */}
              <View style={[styles.signalCard, { backgroundColor: signalMeta.bgColor, borderColor: signalMeta.borderColor }]}>
                <View style={[styles.signalDot, { backgroundColor: signalMeta.borderColor }]} />
                <View style={styles.signalContent}>
                  <Text style={styles.signalBadge}>{signalMeta.badgeText}</Text>
                  <Text style={styles.signalDesc}>{signalMeta.desc}</Text>
                </View>
              </View>

              {/* Tarjeta Principal de Conversión */}
              <View style={styles.rateCard}>
                <Text style={styles.rateLabel}>Mejor tasa para ${selectedTier} USDT</Text>
                <View style={styles.rateNumberRow}>
                  <Text style={styles.rateBigValue}>
                    {currentRate > 0 ? currentRate.toFixed(2) : '---'}
                  </Text>
                  <Text style={styles.rateUnit}>Bs / USDT</Text>
                </View>

                <View style={styles.separator} />

                <Text style={styles.receiveLabel}>Monto total que recibirás:</Text>
                <Text style={styles.receiveTotal}>
                  {totalBs > 0
                    ? totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '---'}{' '}
                  <Text style={styles.currencyBs}>Bs.</Text>
                </Text>

                {marketData?.diff_percent !== undefined && (
                  <View style={styles.diffBadge}>
                    <Text style={[styles.diffText, { color: marketData.diff_percent <= 0 ? '#34d399' : '#f87171' }]}>
                      {marketData.diff_percent > 0 ? `+${marketData.diff_percent}%` : `${marketData.diff_percent}%`} vs media de 4h
                    </Text>
                  </View>
                )}
              </View>

              {/* Tarjeta de Referencias del Día */}
              <View style={styles.referenceCard}>
                <View style={styles.refItem}>
                  <Text style={styles.refLabel}>Mínimo de hoy</Text>
                  <Text style={styles.refValue}>
                    {marketData?.min_today ? `${Number(marketData.min_today).toFixed(2)} Bs` : '---'}
                  </Text>
                </View>
                <View style={styles.refDividerVertical} />
                <View style={styles.refItem}>
                  <Text style={styles.refLabel}>Promedio de hoy</Text>
                  <Text style={styles.refValue}>
                    {marketData?.avg_today ? `${Number(marketData.avg_today).toFixed(2)} Bs` : '---'}
                  </Text>
                </View>
              </View>

              {/* Botón de Actualización */}
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleManualRefresh}
                disabled={isRefreshing}
                activeOpacity={0.8}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.refreshBtnText}>🔄 Actualizar Tasa</Text>
                )}
              </TouchableOpacity>

              {marketData?.is_demo && (
                <Text style={styles.demoNotice}>
                  * Conecta tus credenciales de Supabase en .env para ver datos en vivo.
                </Text>
              )}

            </View>
          )}

          {/* Pie de página con métodos de pago evaluados */}
          <View style={styles.footerMethods}>
            <Text style={styles.footerMethodsTitle}>Métodos evaluados:</Text>
            <Text style={styles.footerMethodsList}>
              Pago Móvil • Banesco • Banco de Venezuela • Mercantil • BNC • Bancaribe
            </Text>
          </View>

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
    paddingVertical: 20,
  },
  container: {
    width: '100%',
    maxWidth: 460, // Limita el ancho en navegadores de PC para mantener vista limpia de app móvil
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: Platform.OS === 'web' ? 10 : 0,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  tierSection: {
    width: '100%',
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    color: '#cbd5e1',
    marginBottom: 10,
    fontWeight: '600',
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  tierButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    flex: 1,
    marginHorizontal: 3,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  tierButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  tierButtonText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '700',
  },
  tierButtonTextActive: {
    color: '#ffffff',
  },
  cardWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  signalCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  signalDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
  },
  signalContent: {
    flex: 1,
  },
  signalBadge: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  signalDesc: {
    color: '#f1f5f9',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  rateCard: {
    width: '100%',
    backgroundColor: '#131c2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 14,
  },
  rateLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rateNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: 10,
  },
  rateBigValue: {
    fontSize: 42,
    fontWeight: '900',
    color: '#38bdf8',
  },
  rateUnit: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '600',
    marginLeft: 8,
  },
  separator: {
    height: 1,
    width: '100%',
    backgroundColor: '#1e293b',
    marginVertical: 14,
  },
  receiveLabel: {
    fontSize: 13,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  receiveTotal: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 4,
  },
  currencyBs: {
    fontSize: 18,
    color: '#38bdf8',
    fontWeight: '700',
  },
  diffBadge: {
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  diffText: {
    fontSize: 12,
    fontWeight: '700',
  },
  referenceCard: {
    width: '100%',
    backgroundColor: '#131c2e',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 20,
  },
  refItem: {
    alignItems: 'center',
    flex: 1,
  },
  refDividerVertical: {
    width: 1,
    backgroundColor: '#1e293b',
    marginHorizontal: 10,
  },
  refLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  refValue: {
    fontSize: 15,
    color: '#cbd5e1',
    fontWeight: '700',
    marginTop: 4,
  },
  refreshBtn: {
    width: '100%',
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  refreshBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  demoNotice: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
  },
  footerMethods: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerMethodsTitle: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  footerMethodsList: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
  },
});
