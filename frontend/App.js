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
  { id: 'PagoMovil', label: 'Pago Móvil', icon: '📱', commissionPct: 0.3 }, // 0.3% comisión bancaria estándar interbancaria
  { id: 'BancoDeVenezuela', label: 'Venezuela', icon: '🏦', commissionPct: 0 },
  { id: 'Banesco', label: 'Banesco', icon: '🟢', commissionPct: 0 },
  { id: 'Mercantil', label: 'Mercantil', icon: '🔵', commissionPct: 0 },
  { id: 'Provincial', label: 'Provincial', icon: '🔷', commissionPct: 0 },
  { id: 'Bancaribe', label: 'Bancaribe', icon: '🟠', commissionPct: 0 },
];

export default function App() {
  const [tradeType, setTradeType] = useState('BUY'); // 'BUY' = Comprar, 'SELL' = Vender
  const [selectedMethods, setSelectedMethods] = useState(['Mercantil', 'PagoMovil', 'Banesco']); // Selección múltiple de métodos
  const [activeTabMethod, setActiveTabMethod] = useState('Mercantil'); // Método visualizado en el detalle principal
  const [selectedTier, setSelectedTier] = useState('100');
  const [methodsData, setMethodsData] = useState({}); // Mapa de datos por cada método
  const [bcvData, setBcvData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [includePagoMovilFee, setIncludePagoMovilFee] = useState(true); // Opción para desglosar la comisión del Pago Móvil
  const [showComparison, setShowComparison] = useState(true); // Control desplegable de la comparativa de rentabilidad
  const [showSignalStats, setShowSignalStats] = useState(false); // Desplegable de máximos y mínimos con sus horas
  const [historicalTicks, setHistoricalTicks] = useState([]); // Historial de cotizaciones recientes para análisis de extremos

  // Conmutar selección múltiple de métodos
  const toggleMethod = (methodId) => {
    setSelectedMethods((prev) => {
      let updated;
      if (prev.includes(methodId)) {
        if (prev.length === 1) return prev; // Mantener al menos 1 seleccionado
        updated = prev.filter((id) => id !== methodId);
        if (activeTabMethod === methodId) {
          setActiveTabMethod(updated[0]);
        }
      } else {
        updated = [...prev, methodId];
      }
      return updated;
    });
  };

  // Consultar datos de Binance P2P para todos los métodos seleccionados simultáneamente
  const fetchAllMarketData = async () => {
    try {
      const [latestRes, historyRes] = await Promise.all([
        supabase
          .from('p2p_ticks')
          .select('*')
          .eq('trade_type', tradeType)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('p2p_ticks')
          .select('rate_5usd, rate_20usd, rate_50usd, rate_100usd, rate_300usd, market_avg, pay_method, trade_type, created_at')
          .eq('trade_type', tradeType)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

      if (!latestRes.error && latestRes.data) {
        const latestByMethod = {};
        latestRes.data.forEach((item) => {
          if (!latestByMethod[item.pay_method]) {
            latestByMethod[item.pay_method] = item;
          }
        });
        setMethodsData(latestByMethod);
      }

      if (!historyRes.error && historyRes.data) {
        setHistoricalTicks(historyRes.data);
      }
    } catch (err) {
      console.warn('Error consultando métodos:', err.message);
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
    fetchAllMarketData();

    const interval = setInterval(() => {
      fetchAllMarketData();
      fetchBcvRates();
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedTier, tradeType]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAllMarketData();
    fetchBcvRates();
  };

  // Análisis horario del mercado venezolano
  const getMarketTimingAnalysis = () => {
    const now = new Date();
    const hourVe = parseInt(now.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', hour12: false }));

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
        ? 'El BCV publica su cotización diaria oficial (~4:00 PM - 5:00 PM). Comerciantes suelen abrir márgenes preventivos al alza.'
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

    return { windowStatus, recommendation, nextEvent };
  };

  const timingAnalysis = getMarketTimingAnalysis();

  // Datos del método actualmente enfocado
  const currentMethodRecord = methodsData[activeTabMethod];
  const tierKey = `rate_${selectedTier}usd`;
  const currentRate = Number(currentMethodRecord?.[tierKey] || currentMethodRecord?.market_avg || 0);
  const tierNumber = Number(selectedTier);
  const baseTotalBs = currentRate * tierNumber;

  // Lista de los 3 mejores comerciantes para el tier y método activo
  const activeTopTraders =
    currentMethodRecord?.top_traders?.[`${selectedTier}usd`] ||
    currentMethodRecord?.top_traders?.[tierKey] ||
    [];

  // Cálculo de comisiones bancarias para Pago Móvil (0.3% del monto transferido)
  const isPagoMovil = activeTabMethod === 'PagoMovil';
  const pagoMovilFeeBs = isPagoMovil ? baseTotalBs * 0.003 : 0;
  const totalWithFeeBs = tradeType === 'BUY' ? baseTotalBs + pagoMovilFeeBs : baseTotalBs - pagoMovilFeeBs;

  // Datos oficiales BCV y cálculo de brecha
  const bcvUsd = Number(bcvData?.rate_usd || 807.38);
  const bcvEur = Number(bcvData?.rate_eur || 938.44);
  const totalBsBCV = bcvUsd * tierNumber;
  const rawBrecha = currentRate > 0 && bcvUsd > 0 ? ((currentRate - bcvUsd) / bcvUsd) * 100 : 19.5;
  const brechaFormatted = rawBrecha.toFixed(1);

  // Sistema de 7 Estados
  const getSevenStateSignal = () => {
    const isBuy = tradeType === 'BUY';
    let score = 0;

    if (isBuy) {
      if (rawBrecha <= 18.0) score += 2;
      else if (rawBrecha <= 19.2) score += 1;
      else if (rawBrecha >= 21.5) score -= 2;
      else if (rawBrecha >= 20.3) score -= 1;
    } else {
      if (rawBrecha >= 21.5) score += 2;
      else if (rawBrecha >= 20.3) score += 1;
      else if (rawBrecha <= 18.0) score -= 2;
      else if (rawBrecha <= 19.2) score -= 1;
    }

    switch (score) {
      case 2:
        return {
          tag: isBuy ? '🌟 MOMENTO EXCELENTE (MUY BUENO)' : '🌟 MOMENTO EXCELENTE (PAGO MÁXIMO)',
          bg: '#064e3b',
          border: '#10b981',
          text: '#34d399',
          barPct: '100%',
          desc: isBuy
            ? `La tasa está en mínimos con brecha comprimida (+${brechaFormatted}% vs BCV). Oportunidad dorada para comprar.`
            : `Pagan la tasa más alta del día (+${brechaFormatted}% sobre BCV). Excelente oportunidad para vender y asegurar bolívares.`
        };
      case 1:
        return {
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
          tag: '⚖️ PROMEDIO DEL DÍA (ESTABLE)',
          bg: '#78350f',
          border: '#f59e0b',
          text: '#fcd34d',
          barPct: '50%',
          desc: `La paridad se mantiene en su rango habitual de mercado (+${brechaFormatted}% vs tasa oficial). Operación estándar.`
        };
      case -1:
        return {
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
        return {
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

  // Cálculo de Máximos y Mínimos con sus horas para el método y monto actual
  const getMethodHistoricalStats = () => {
    // Filtrar ticks que coincidan con el método actual (o todos si no hay suficientes)
    const matchingTicks = historicalTicks.filter((t) => t.pay_method === activeTabMethod);
    const pool = matchingTicks.length >= 5 ? matchingTicks : historicalTicks;

    if (!pool || pool.length === 0) {
      return null;
    }

    let minItem = null;
    let maxItem = null;
    const key = tierKey;

    pool.forEach((item) => {
      const val = Number(item[key] || item.market_avg || 0);
      if (val > 0) {
        if (!minItem || val < minItem.val) {
          minItem = { val, created_at: item.created_at };
        }
        if (!maxItem || val > maxItem.val) {
          maxItem = { val, created_at: item.created_at };
        }
      }
    });

    const formatHour = (isoStr) => {
      if (!isoStr) return '--:--';
      try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('es-VE', {
          timeZone: 'America/Caracas',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      } catch (e) {
        return '--:--';
      }
    };

    return {
      minRate: minItem ? minItem.val : currentRate,
      minHour: minItem ? formatHour(minItem.created_at) : '--:--',
      maxRate: maxItem ? maxItem.val : currentRate,
      maxHour: maxItem ? formatHour(maxItem.created_at) : '--:--',
      totalSamples: pool.length
    };
  };

  const methodStats = getMethodHistoricalStats();

  // Encontrar el método más rentable de los seleccionados
  const rankedMethods = selectedMethods
    .map((mId) => {
      const rec = methodsData[mId];
      const rate = Number(rec?.[tierKey] || rec?.market_avg || 0);
      const isPm = mId === 'PagoMovil';
      const netTotal = tradeType === 'BUY'
        ? (isPm && includePagoMovilFee ? rate * tierNumber * 1.003 : rate * tierNumber)
        : (isPm && includePagoMovilFee ? rate * tierNumber * 0.997 : rate * tierNumber);
      return { id: mId, rate, netTotal };
    })
    .filter((m) => m.rate > 0)
    .sort((a, b) => (tradeType === 'BUY' ? a.netTotal - b.netTotal : b.netTotal - a.netTotal));

  const bestMethodId = rankedMethods[0]?.id;

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

          {/* Selector Múltiple de Métodos o Bancos */}
          <View style={styles.methodsWrapper}>
            <View style={styles.methodsHeaderRow}>
              <Text style={styles.sectionLabel}>Tus Métodos Disponibles (Toca para activar/desactivar):</Text>
            </View>
            <View style={styles.methodsGrid}>
              {PAY_METHODS.map((m) => {
                const isSelected = selectedMethods.includes(m.id);
                const isBest = bestMethodId === m.id && selectedMethods.length > 1;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.methodPill,
                      isSelected && styles.methodPillActive,
                      isBest && styles.methodPillBest
                    ]}
                    onPress={() => toggleMethod(m.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.methodIcon}>{m.icon}</Text>
                    <View style={styles.methodTextWrap}>
                      <Text style={[styles.methodLabel, isSelected && styles.methodLabelActive]}>
                        {m.label}
                      </Text>
                      {isBest && (
                        <Text style={styles.bestTag}>
                          {tradeType === 'BUY' ? 'MÁS BARATO' : 'MÁS PAGA'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.checkboxIcon}>{isSelected ? '☑️' : '◻️'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Cuadro Comparativo de Rentabilidad entre los bancos elegidos */}
          {selectedMethods.length > 1 && (
            <View style={styles.comparisonBox}>
              <View style={styles.comparisonHeaderRow}>
                <Text style={styles.comparisonTitle}>
                  ⚖️ COMPARATIVA DE RENTABILIDAD PARA ${selectedTier}:
                </Text>
                <TouchableOpacity
                  style={styles.comparisonToggleBtn}
                  onPress={() => setShowComparison(!showComparison)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.comparisonToggleBtnText}>
                    {showComparison ? 'Ocultar ▲' : 'Desplegar ▼'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showComparison && (
                <>
                  <Text style={styles.comparisonSubtitle}>
                    {tradeType === 'BUY'
                      ? 'Te conviene el método con menor desembolso total en Bs:'
                      : 'Te conviene el método donde recibes más Bolívares:'}
                  </Text>

                  <View style={styles.comparisonTable}>
                    {rankedMethods.map((item, idx) => {
                      const mInfo = PAY_METHODS.find((p) => p.id === item.id);
                      const isFirst = idx === 0;
                      const isPM = item.id === 'PagoMovil';
                      const isCurrentTab = activeTabMethod === item.id;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.compRow,
                            isFirst && styles.compRowWinner,
                            isCurrentTab && styles.compRowSelected
                          ]}
                          onPress={() => setActiveTabMethod(item.id)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.compLeft}>
                            <Text style={styles.compIcon}>{mInfo?.icon}</Text>
                            <View>
                              <View style={styles.compTitleRow}>
                                <Text style={[styles.compName, isFirst && styles.compNameWinner]}>
                                  {mInfo?.label}
                                </Text>
                                {isFirst && <Text style={styles.winnerBadge}>🏆 RECOMENDADO</Text>}
                              </View>
                              <Text style={styles.compRateSub}>
                                Tasa: {item.rate.toFixed(2)} Bs
                                {isPM && includePagoMovilFee ? ' (+0.3% com.)' : ''}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.compRight}>
                            <Text style={[styles.compTotal, isFirst && styles.compTotalWinner]}>
                              {item.netTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                            </Text>
                            <Text style={styles.viewDetailsHint}>
                              {isCurrentTab ? '• Viendo detalles •' : 'Tocar para ver'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}

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
              <View style={styles.signalTitleGroup}>
                <View style={[styles.signalDot, { backgroundColor: signalState.text }]} />
                <Text style={[styles.signalTagText, { color: signalState.text }]}>
                  {signalState.tag}
                </Text>
              </View>

              {/* Botón desplegable para ver máximos y mínimos con sus horas */}
              <TouchableOpacity
                style={styles.signalDropdownBtn}
                onPress={() => setShowSignalStats(!showSignalStats)}
                activeOpacity={0.7}
              >
                <Text style={styles.signalDropdownBtnText}>
                  {showSignalStats ? 'Ocultar horas ▲' : 'Ver máx/mín ▼'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.signalDescriptionText}>{signalState.desc}</Text>

            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: signalState.barPct, backgroundColor: signalState.border }]} />
            </View>

            {/* Desplegable interactivo: Récords de Máximos y Mínimos con Horas exactas */}
            {showSignalStats && methodStats && (
              <View style={styles.signalExtremesBox}>
                <Text style={styles.signalExtremesTitle}>
                  📊 MOVIMIENTOS Y EXTREMOS REGISTRADOS HOY ({PAY_METHODS.find((m) => m.id === activeTabMethod)?.label} - ${selectedTier}):
                </Text>

                <View style={styles.signalExtremesGrid}>
                  {/* Tarjeta de Tasa Mínima */}
                  <View style={[styles.extremeCard, styles.extremeCardMin]}>
                    <View style={styles.extremeCardHeader}>
                      <Text style={styles.extremeIcon}>📉</Text>
                      <Text style={styles.extremeLabelMin}>TASA MÍNIMA</Text>
                    </View>
                    <Text style={styles.extremePrice}>
                      {Number(methodStats.minRate).toFixed(2)}{' '}
                      <Text style={styles.extremeUnit}>Bs</Text>
                    </Text>
                    <View style={styles.extremeTimeBadge}>
                      <Text style={styles.extremeTimeText}>⏰ Registrada: {methodStats.minHour}</Text>
                    </View>
                    <Text style={styles.extremeHint}>
                      {tradeType === 'BUY'
                        ? '🔥 La mejor oportunidad de compra del ciclo.'
                        : '⚠️ El precio más bajo ofrecido a vendedores.'}
                    </Text>
                  </View>

                  {/* Tarjeta de Tasa Máxima */}
                  <View style={[styles.extremeCard, styles.extremeCardMax]}>
                    <View style={styles.extremeCardHeader}>
                      <Text style={styles.extremeIcon}>📈</Text>
                      <Text style={styles.extremeLabelMax}>TASA MÁXIMA</Text>
                    </View>
                    <Text style={styles.extremePrice}>
                      {Number(methodStats.maxRate).toFixed(2)}{' '}
                      <Text style={styles.extremeUnit}>Bs</Text>
                    </Text>
                    <View style={styles.extremeTimeBadge}>
                      <Text style={styles.extremeTimeText}>⏰ Registrada: {methodStats.maxHour}</Text>
                    </View>
                    <Text style={styles.extremeHint}>
                      {tradeType === 'BUY'
                        ? '⚠️ El precio más caro cobrado a compradores.'
                        : '🔥 La mejor oportunidad de venta del ciclo.'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
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

          {/* Tarjetas de Pestañas de Métodos para Alternar la Ficha Principal */}
          <View style={styles.subTabsContainer}>
            <Text style={styles.subTabsLabel}>Inspeccionando detalle de:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabsScroll}>
              {selectedMethods.map((mId) => {
                const mInfo = PAY_METHODS.find((p) => p.id === mId);
                const isActive = activeTabMethod === mId;
                return (
                  <TouchableOpacity
                    key={mId}
                    style={[styles.subTabPill, isActive && styles.subTabPillActive]}
                    onPress={() => setActiveTabMethod(mId)}
                  >
                    <Text style={styles.subTabIcon}>{mInfo?.icon}</Text>
                    <Text style={[styles.subTabLabel, isActive && styles.subTabLabelActive]}>
                      {mInfo?.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Tarjeta Principal de Tasa P2P con Énfasis de Método */}
          {loading && !currentMethodRecord ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Consultando libro de órdenes en vivo...</Text>
            </View>
          ) : (
            <View style={styles.rateCard}>
              {/* Énfasis claro del Método o Banco */}
              <View style={styles.methodHeaderBadge}>
                <Text style={styles.methodHeaderBadgeText}>
                  {PAY_METHODS.find((m) => m.id === activeTabMethod)?.icon}{' '}
                  CANAL SELECCIONADO: {PAY_METHODS.find((m) => m.id === activeTabMethod)?.label?.toUpperCase()}
                </Text>
              </View>

              <Text style={styles.rateHeaderLabel}>
                {tradeType === 'BUY' ? 'Mejor tasa de compra para' : 'Mejor tasa de venta para'} ${selectedTier}:
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
                {baseTotalBs > 0
                  ? baseTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '---'}{' '}
                <Text style={styles.currencyBs}>Bs.</Text>
              </Text>

              {/* Módulo Especial de Comisión Bancaria para Pago Móvil */}
              {isPagoMovil && (
                <View style={styles.feeCard}>
                  <View style={styles.feeHeader}>
                    <Text style={styles.feeTitle}>⚠️ AVISO COMISIÓN PAGO MÓVIL (0.3%)</Text>
                    <TouchableOpacity
                      style={styles.feeToggleBtn}
                      onPress={() => setIncludePagoMovilFee(!includePagoMovilFee)}
                    >
                      <Text style={styles.feeToggleBtnText}>
                        {includePagoMovilFee ? 'Ocultar desglose' : 'Calcular con comisión'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.feeExplanation}>
                    Los bancos en Venezuela cobran un 0.3% por transferencias P2P interbancarias (aprox.{' '}
                    {pagoMovilFeeBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs).
                  </Text>

                  {includePagoMovilFee && (
                    <View style={styles.feeCalculationBox}>
                      <Text style={styles.feeCalcText}>
                        {tradeType === 'BUY'
                          ? `Total real a desembolsar: (${baseTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs + ${pagoMovilFeeBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs com.) = `
                          : `Total neto a recibir: (${baseTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs - ${pagoMovilFeeBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs com.) = `}
                        <Text style={styles.feeCalcTotal}>
                          {totalWithFeeBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                        </Text>
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Lista de los primeros comerciantes reales de Binance con Énfasis en Banco */}
              {activeTopTraders && activeTopTraders.length > 0 && (
                <View style={styles.tradersContainer}>
                  <Text style={styles.tradersTitle}>
                    🥇 TOP COMERCIANTES EN {PAY_METHODS.find((m) => m.id === activeTabMethod)?.label?.toUpperCase()} PARA ${selectedTier}:
                  </Text>
                  {activeTopTraders.map((t, idx) => (
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
                            Vía {PAY_METHODS.find((m) => m.id === activeTabMethod)?.label} • {t.orders} órdenes • {t.finishRate}
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
                  Diferencia vs P2P: {(Math.abs(baseTotalBs - totalBsBCV)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                </Text>
              </View>

              <View style={styles.bcvColDivider} />

              <View style={styles.bcvCol}>
                <Text style={styles.bcvCurrencyLabel}>EURO BCV (EUR)</Text>
                <Text style={styles.bcvRateValue}>{bcvEur.toFixed(2)} Bs</Text>
                <Text style={styles.bcvEquiv}>
                  En Euros aprox:{' '}
                  <Text style={styles.bcvEquivBold}>
                    {bcvEur > 0 ? (baseTotalBs / bcvEur).toFixed(2) : '---'} €
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
    marginBottom: 14,
  },
  methodsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
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
  methodPillBest: {
    borderColor: '#10b981',
  },
  methodIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  methodTextWrap: {
    flex: 1,
  },
  methodLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  methodLabelActive: {
    color: '#38bdf8',
  },
  bestTag: {
    fontSize: 9,
    color: '#34d399',
    fontWeight: '800',
  },
  checkboxIcon: {
    fontSize: 12,
    marginLeft: 4,
  },
  comparisonBox: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  comparisonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comparisonTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 0.5,
    flex: 1,
  },
  comparisonToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginLeft: 8,
  },
  comparisonToggleBtnText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
  },
  comparisonSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    marginBottom: 10,
  },
  comparisonTable: {
    width: '100%',
  },
  compRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131c2e',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  compRowWinner: {
    borderColor: '#10b981',
    backgroundColor: '#062d22',
  },
  compRowSelected: {
    borderWidth: 1.5,
    borderColor: '#38bdf8',
  },
  compLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  compTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compName: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  compNameWinner: {
    color: '#34d399',
  },
  winnerBadge: {
    fontSize: 9,
    backgroundColor: '#059669',
    color: '#ffffff',
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  compRateSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1,
  },
  compRight: {
    alignItems: 'flex-end',
  },
  compTotal: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  compTotalWinner: {
    color: '#34d399',
    fontSize: 15,
  },
  viewDetailsHint: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 1,
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
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  signalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  signalDropdownBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginLeft: 8,
  },
  signalDropdownBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
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
  signalExtremesBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    width: '100%',
  },
  signalExtremesTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.4,
    marginBottom: 10,
    textAlign: 'center',
  },
  signalExtremesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  extremeCard: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1.5,
  },
  extremeCardMin: {
    backgroundColor: '#062d22',
    borderColor: '#10b981',
  },
  extremeCardMax: {
    backgroundColor: '#3b0d0c',
    borderColor: '#ef4444',
  },
  extremeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  extremeIcon: {
    fontSize: 14,
    marginRight: 5,
  },
  extremeLabelMin: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34d399',
    letterSpacing: 0.4,
  },
  extremeLabelMax: {
    fontSize: 10,
    fontWeight: '900',
    color: '#f87171',
    letterSpacing: 0.4,
  },
  extremePrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    marginVertical: 2,
  },
  extremeUnit: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '700',
  },
  extremeTimeBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  extremeTimeText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '700',
  },
  extremeHint: {
    color: '#cbd5e1',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
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
  subTabsContainer: {
    width: '100%',
    marginBottom: 10,
  },
  subTabsLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  subTabsScroll: {
    paddingVertical: 2,
  },
  subTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131c2e',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  subTabPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  subTabIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  subTabLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  subTabLabelActive: {
    color: '#ffffff',
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
  methodHeaderBadge: {
    backgroundColor: '#0f2744',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 10,
  },
  methodHeaderBadgeText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
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
    marginTop: 4,
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
  feeCard: {
    width: '100%',
    backgroundColor: '#1c1917',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#78350f',
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feeTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f59e0b',
  },
  feeToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#292524',
    borderRadius: 6,
  },
  feeToggleBtnText: {
    fontSize: 10,
    color: '#fcd34d',
    fontWeight: '700',
  },
  feeExplanation: {
    fontSize: 11,
    color: '#d6d3d1',
    lineHeight: 15,
  },
  feeCalculationBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#44403c',
  },
  feeCalcText: {
    fontSize: 12,
    color: '#fcd34d',
  },
  feeCalcTotal: {
    fontWeight: '900',
    fontSize: 14,
    color: '#ffffff',
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
