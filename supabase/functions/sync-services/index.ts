import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Calculates the dynamic profit margin percentage for a SMM service.
 */
function calculateDynamicMargin(name: string, cost: number): number {
    const nameLower = name.toLowerCase();

    // Regra 5: Custo superior a R$ 100,00 -> Margem fixa de proteção de 60%
    if (cost > 100.00) {
        return 60;
    }

    // Regra 1: Visualizações, Views ou Impressões -> 500%
    if (
        nameLower.includes('visualizações') || 
        nameLower.includes('visualizacoes') || 
        nameLower.includes('views') || 
        nameLower.includes('impressões') || 
        nameLower.includes('impressoes')
    ) {
        return 500;
    }

    // Regra 2: Curtidas, Likes, Compartilhamentos, Shares ou Reactions -> 300%
    if (
        nameLower.includes('curtidas') || 
        nameLower.includes('likes') || 
        nameLower.includes('compartilhamentos') || 
        nameLower.includes('shares') || 
        nameLower.includes('reactions')
    ) {
        return 300;
    }

    // Regra 3: Membros, Telegram ou Global (e NÃO for YouTube) -> 150%
    const isYoutube = nameLower.includes('youtube') || nameLower.includes('yt');
    if (
        !isYoutube && 
        (nameLower.includes('membros') || nameLower.includes('telegram') || nameLower.includes('global'))
    ) {
        return 150;
    }

    // Regra 4: Seguidores Brasileiros, Seguidores Brasil ou BR -> 140%
    const hasBr = 
        nameLower.includes('seguidores brasileiros') || 
        nameLower.includes('seguidores brasil') || 
        nameLower.includes('brasil') || 
        nameLower.includes('brasileiro') || 
        nameLower.includes('🇧🇷') || 
        /\bbr\b/.test(nameLower);

    if (hasBr) {
        return 140;
    }

    // Fallback -> 100%
    return 100;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Inicializa Supabase Admin (Para ler configurações protegidas)
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Tenta ler do corpo da requisição (se vier do frontend)
        let { api_url, api_key } = await req.json().catch(() => ({}))

        // 3. Se não veio na requisição (ex: Cron Job), busca no Banco
        if (!api_url || !api_key) {
            console.log("Configuração não enviada. Buscando no banco de dados...")

            const { data: config, error: configError } = await supabase
                .from('admin_config')
                .select('*')
                .single()

            if (configError || !config) {
                throw new Error('Nenhuma configuração encontrada no banco de dados.')
            }

            api_url = config.api_url
            api_key = config.api_key
        }

        if (!api_url || !api_key) {
            throw new Error('Configuração incompleta (URL ou Key faltando).')
        }

        console.log(`Iniciando sincronização com: ${api_url} usando Lógica de Precificação Dinâmica por Palavras-Chave.`)

        // 4. Busca Serviços no Fornecedor
        const params = new URLSearchParams();
        params.append('key', api_key);
        params.append('action', 'services');

        const response = await fetch(api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });

        const providerServices = await response.json();

        if (!Array.isArray(providerServices)) {
            console.error('Erro Fornecedor:', providerServices);
            throw new Error('A API do fornecedor não retornou uma lista válida.');
        }

        // 5. Processa e Calcula Preços via Pricing Middleware
        const servicesToUpsert = providerServices.map((s: any) => {
            const cost = parseFloat(s.rate);
            
            // Aplica a margem de lucro dinâmica com base em palavras-chave e custo
            const profitMargin = calculateDynamicMargin(s.name || '', cost);
            const finalPrice = cost + (cost * (profitMargin / 100));

            return {
                service_id: Number(s.service),
                name: s.name,
                category: s.category,
                rate: Number(finalPrice.toFixed(2)),
                min: Number(s.min),
                max: Number(s.max),
                type: s.type,
                description: s.description || 'Importado automaticamente.'
            }
        });

        // 6. Salva no Supabase
        const { error } = await supabase
            .from('services')
            .upsert(servicesToUpsert, { onConflict: 'service_id' })

        if (error) throw error;

        return new Response(
            JSON.stringify({ success: true, count: servicesToUpsert.length, source: 'database_config' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
