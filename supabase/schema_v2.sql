-- ==============================================================================
-- Esquema V2: Estimador Binance P2P Multi-Instancia (BUY/SELL + Métodos + BCV)
-- ==============================================================================

-- 1. Tabla principal de ticks por método de pago y tipo de operación
create table if not exists public.p2p_ticks (
    id bigint generated always as identity primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Tipo de operación: 'BUY' (Quiero Comprar USDT con Bolívares) o 'SELL' (Quiero Vender USDT por Bolívares)
    trade_type text not null default 'BUY',
    
    -- Método de pago específico
    pay_method text not null default 'PagoMovil',
    
    -- Tasas por monto (VES por 1 USDT)
    rate_5usd numeric(12, 4),
    rate_20usd numeric(12, 4),
    rate_50usd numeric(12, 4),
    rate_100usd numeric(12, 4),
    rate_300usd numeric(12, 4),
    
    market_avg numeric(12, 4) not null,
    valid_ads_count int default 0
);

-- Índices optimizados para búsquedas por método, tipo y fecha
create index if not exists idx_p2p_ticks_query on public.p2p_ticks (trade_type, pay_method, created_at desc);

-- 2. Tabla para tasas oficiales BCV y Euro
create table if not exists public.bcv_rates (
    id bigint generated always as identity primary key,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    rate_usd numeric(12, 4) not null,
    rate_eur numeric(12, 4) not null,
    change_usd numeric(8, 4),
    change_eur numeric(8, 4),
    source text default 'dolarvzla.com'
);

create index if not exists idx_bcv_rates_updated_at on public.bcv_rates (updated_at desc);

-- 3. Row Level Security (RLS)
alter table public.p2p_ticks enable row level security;
alter table public.bcv_rates enable row level security;

-- Políticas de lectura pública
create policy "Permitir lectura publica de ticks"
    on public.p2p_ticks for select to anon, authenticated using (true);

create policy "Permitir lectura publica de bcv"
    on public.bcv_rates for select to anon, authenticated using (true);

-- Políticas de inserción backend
create policy "Permitir insercion solo backend ticks"
    on public.p2p_ticks for insert to service_role, authenticated with check (true);

create policy "Permitir insercion solo backend bcv"
    on public.bcv_rates for insert to service_role, authenticated with check (true);

-- 4. Función RPC avanzada para semáforos de COMPRA y VENTA por método
create or replace function public.get_market_signal_v2(
    target_tier text,
    target_trade_type text default 'BUY',
    target_pay_method text default 'PagoMovil'
)
returns json as $$
declare
    current_val numeric;
    min_today numeric;
    max_today numeric;
    avg_last_4h numeric;
    avg_today numeric;
    percentile_20 numeric;
    percentile_80 numeric;
    signal text;
    diff_percent numeric;
begin
    -- Sanitizar parámetros
    if target_tier not in ('5usd', '20usd', '50usd', '100usd', '300usd') then
        target_tier := '20usd';
    end if;
    if target_trade_type not in ('BUY', 'SELL') then
        target_trade_type := 'BUY';
    end if;

    -- 1. Obtener el último valor registrado para ese método y tipo
    execute format(
        'select %I from public.p2p_ticks 
         where trade_type = %L and pay_method = %L 
         order by created_at desc limit 1',
        'rate_' || target_tier,
        target_trade_type,
        target_pay_method
    ) into current_val;

    if current_val is null then
        return json_build_object(
            'current_rate', null,
            'min_today', null,
            'max_today', null,
            'avg_today', null,
            'avg_last_4h', null,
            'diff_percent', 0,
            'signal', 'YELLOW',
            'trade_type', target_trade_type,
            'pay_method', target_pay_method,
            'timestamp', now()
        );
    end if;

    -- 2. Estadísticas de las últimas 24 horas para este método y tipo
    execute format(
        'select 
            coalesce(min(%I), 0),
            coalesce(max(%I), 0),
            coalesce(avg(%I), 0), 
            coalesce(percentile_cont(0.20) within group (order by %I), 0),
            coalesce(percentile_cont(0.80) within group (order by %I), 0)
         from public.p2p_ticks 
         where trade_type = %L and pay_method = %L and created_at >= now() - interval ''24 hours''',
        'rate_' || target_tier,
        'rate_' || target_tier,
        'rate_' || target_tier,
        'rate_' || target_tier,
        'rate_' || target_tier,
        target_trade_type,
        target_pay_method
    ) into min_today, max_today, avg_today, percentile_20, percentile_80;

    -- 3. Promedio móvil de 4 horas
    execute format(
        'select coalesce(avg(%I), %L) from public.p2p_ticks 
         where trade_type = %L and pay_method = %L and created_at >= now() - interval ''4 hours''',
        'rate_' || target_tier,
        current_val,
        target_trade_type,
        target_pay_method
    ) into avg_last_4h;

    -- 4. Cálculo de variación porcentual vs media 4h
    if avg_last_4h > 0 then
        diff_percent := round(((current_val - avg_last_4h) / avg_last_4h) * 100, 2);
    else
        diff_percent := 0;
    end if;

    -- 5. Lógica del Semáforo según COMPRA vs VENTA
    if target_trade_type = 'BUY' then
        -- AL COMPRAR USDT: Queremos la tasa MÁS BAJA (pagar menos Bs por dólar)
        if current_val <= percentile_20 or diff_percent <= -0.6 then
            signal := 'GREEN'; -- Excelente para comprar
        elsif diff_percent >= 0.8 then
            signal := 'RED';   -- Caro para comprar, esperar
        else
            signal := 'YELLOW';
        end if;
    else
        -- AL VENDER USDT: Queremos la tasa MÁS ALTA (recibir más Bs por dólar)
        if current_val >= percentile_80 or diff_percent >= 0.6 then
            signal := 'GREEN'; -- Excelente para vender
        elsif diff_percent <= -0.8 then
            signal := 'RED';   -- Barato para vender, esperar
        else
            signal := 'YELLOW';
        end if;
    end if;

    return json_build_object(
        'current_rate', current_val,
        'min_today', round(min_today, 2),
        'max_today', round(max_today, 2),
        'avg_today', round(avg_today, 2),
        'avg_last_4h', round(avg_last_4h, 2),
        'diff_percent', diff_percent,
        'signal', signal,
        'trade_type', target_trade_type,
        'pay_method', target_pay_method,
        'timestamp', now()
    );
end;
$$ language plpgsql security definer;
