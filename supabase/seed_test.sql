-- Datos de prueba para inicializar métricas y simular 24 horas de ticks
insert into public.p2p_ticks (created_at, rate_5usd, rate_20usd, rate_50usd, rate_100usd, rate_300usd, market_avg, valid_ads_count)
values
  (now() - interval '12 hours', 955.00, 954.50, 954.00, 953.80, 953.00, 954.00, 25),
  (now() - interval '8 hours', 958.00, 957.50, 957.00, 956.80, 956.00, 957.00, 28),
  (now() - interval '4 hours', 962.00, 961.50, 961.00, 960.50, 960.00, 961.00, 30),
  (now() - interval '2 hours', 960.00, 959.50, 959.00, 958.50, 958.00, 959.00, 30),
  (now() - interval '5 minutes', 957.00, 956.50, 956.00, 955.50, 955.00, 956.00, 30);
