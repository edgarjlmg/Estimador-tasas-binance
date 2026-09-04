-- ==============================================================================
-- Esquema de Base de Datos para Supabase / PostgreSQL
-- Proyecto: Estimador / Monitor de Tasas Binance P2P (VES/USDT)
-- ==============================================================================

-- 1. Tabla de ticks por minuto
create table if not exists public.p2p_ticks (
    id bigint generated always as identity primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Tasas calculadas por monto (VES por 1 USDT)
    rate_5usd numeric(12, 4),
    rate_20usd numeric(12, 4),
    rate_50usd numeric(12, 4),
    rate_100usd numeric(12, 4),
    rate_300usd numeric(12, 4),
    
    -- Tasa promedio de los primeros 5 mejores anuncios calificados
    market_avg numeric(12, 4) not null,
    
    -- Conteo de anuncios evaluados
    valid_ads_count int default 0
);

-- 2. Índices de alta velocidad para consultas ordenadas por fecha reciente
create index if not exists idx_p2p_ticks_created_at on public.p2p_ticks (created_at desc);

-- 3. Habilitar Row Level Security (RLS)
alter table public.p2p_ticks enable row level security;

-- Política de lectura pública (cualquier cliente o frontend anónimo puede consultar)
create policy "Permitir lectura publica de ticks"
    on public.p2p_ticks
    for select
    to anon, authenticated
    using (true);

-- Política de inserción protegida (solo service_role o autenticado)
create policy "Permitir insercion solo backend"
    on public.p2p_ticks
    for insert
    to service_role, authenticated
    with check (true);

-- 4. Función RPC para cálculo del semáforo y estadísticas en el servidor
create or replace function public.get_market_signal(target_tier text)
returns json as $$
declare
    current_val numeric;
    min_today numeric;
    avg_last_4h numeric;
    avg_today numeric;
    percentile_20 numeric;
    signal text;
    diff_percent numeric;
begin
    -- Validar formato del parámetro (ej: 5usd, 20usd, 50usd, 100usd, 300usd)
    if target_tier not in ('5usd', '20usd', '50usd', '100usd', '300usd') then
        target_tier := '20usd';
    end if;

    -- 1. Obtener la última tasa registrada para el tier solicitado
    execute format(
        'select %I from public.p2p_ticks order by created_at desc limit 1',
        'rate_' || target_tier
    ) into current_val;

    -- Si aún no hay registros, retornar nulo controlado
    if current_val is null then
        return json_build_object(
            'current_rate', null,
            'min_today', null,
            'avg_today', null,
            'avg_last_4h', null,
            'diff_percent', 0,
            'signal', 'YELLOW',
            'timestamp', now()
        );
    end if;

    -- 2. Estadísticas de las últimas 24 horas
    execute format(
        'select 
            coalesce(min(%I), 0), 
            coalesce(avg(%I), 0), 
            coalesce(percentile_cont(0.20) within group (order by %I), 0)
         from public.p2p_ticks 
         where created_at >= now() - interval ''24 hours''',
        'rate_' || target_tier,
        'rate_' || target_tier,
        'rate_' || target_tier
    ) into min_today, avg_today, percentile_20;

    -- 3. Promedio móvil de corto plazo (últimas 4 horas)
    execute format(
        'select coalesce(avg(%I), %L) from public.p2p_ticks where created_at >= now() - interval ''4 hours''',
        'rate_' || target_tier,
        current_val
    ) into avg_last_4h;

    -- 4. Cálculo de desviación porcentual frente a la media de 4 horas
    if avg_last_4h > 0 then
        diff_percent := round(((current_val - avg_last_4h) / avg_last_4h) * 100, 2);
    else
        diff_percent := 0;
    end if;

    -- 5. Determinación del semáforo
    -- VERDE: El precio está en el 20% más bajo del día o ha caído >= 0.6% vs la media reciente
    if current_val <= percentile_20 or diff_percent <= -0.6 then
        signal := 'GREEN';
    -- ROJO: El precio subió >= 0.8% frente a la media reciente
    elsif diff_percent >= 0.8 then
        signal := 'RED';
    -- AMARILLO: Variación normal dentro del rango promedio
    else
        signal := 'YELLOW';
    end if;

    return json_build_object(
        'current_rate', current_val,
        'min_today', round(min_today, 2),
        'avg_today', round(avg_today, 2),
        'avg_last_4h', round(avg_last_4h, 2),
        'diff_percent', diff_percent,
        'signal', signal,
        'timestamp', now()
    );
end;
$$ language plpgsql security definer;
