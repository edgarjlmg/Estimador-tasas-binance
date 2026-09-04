-- ==============================================================================
-- MIGRACIÓN / ACTUALIZACIÓN: Soporte para BUY / SELL, Métodos de Pago y BCV
-- Copia y corre esto en el SQL Editor de tu Supabase
-- ==============================================================================

-- 1. Agregar columnas para tipo de comercio y método de pago
alter table public.p2p_ticks add column if not exists trade_type text not null default 'BUY';
alter table public.p2p_ticks add column if not exists pay_method text not null default 'PagoMovil';

-- Índice de alto rendimiento compuesto
create index if not exists idx_p2p_ticks_query on public.p2p_ticks (trade_type, pay_method, created_at desc);

-- 2. Tabla para almacenar las tasas oficiales del Banco Central de Venezuela (BCV) y Euro
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

-- Habilitar RLS en bcv_rates
alter table public.bcv_rates enable row level security;

create policy "Permitir lectura publica de bcv"
    on public.bcv_rates for select to anon, authenticated using (true);

create policy "Permitir insercion backend de bcv"
    on public.bcv_rates for insert to service_role, authenticated with check (true);

-- 3. Función RPC V2: Cálculo de Semáforos Inteligentes (BUY = Comprar, SELL = Vender)
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
    if target_tier not in ('5usd', '20usd', '50usd', '100usd', '300usd') then
        target_tier := '20usd';
    end if;
    if target_trade_type not in ('BUY', 'SELL') then
        target_trade_type := 'BUY';
    end if;

    -- 1. Obtener última tasa registrada para este método y tipo
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

    -- 2. Estadísticas de las últimas 24h para este método y tipo
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

    if avg_last_4h > 0 then
        diff_percent := round(((current_val - avg_last_4h) / avg_last_4h) * 100, 2);
    else
        diff_percent := 0;
    end if;

    -- 4. Lógica del Semáforo
    if target_trade_type = 'BUY' then
        -- Comprando USDT: queremos pagar lo mínimo
        if current_val <= percentile_20 or diff_percent <= -0.6 then
            signal := 'GREEN'; -- Excelente para comprar dólares
        elsif diff_percent >= 0.8 then
            signal := 'RED';   -- Precio caro para comprar, esperar
        else
            signal := 'YELLOW';
        end if;
    else
        -- Vendiendo USDT: queremos recibir lo máximo
        if current_val >= percentile_80 or diff_percent >= 0.6 then
            signal := 'GREEN'; -- Excelente para vender dólares (pagan más)
        elsif diff_percent <= -0.8 then
            signal := 'RED';   -- Tasa baja para vender, esperar
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
