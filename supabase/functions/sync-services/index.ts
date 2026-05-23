import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface KeywordRule {
    keywords: string;
    margin: number;
}

/**
 * Calculates the dynamic profit margin percentage for a SMM service.
 */
function calculateDynamicMargin(name: string, keywordRules: KeywordRule[], globalMargin: number): number {
    const nameLower = name.toLowerCase();

    // Encontra a primeira regra que bate com o nome do serviço
    const matchingRule = keywordRules.find(rule => {
        if (!rule.keywords) return false;
        // Divide as palavras-chave por vírgula, limpa os espaços e filtra vazios
        const keywordsList = rule.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
        return keywordsList.some(keyword => nameLower.includes(keyword));
    });

    if (matchingRule) {
        return matchingRule.margin;
    }

    return globalMargin;
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
        let { api_url, api_key, margin, keyword_rules } = await req.json().catch(() => ({}))

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
            margin = config.margin_percent
            keyword_rules = config.keyword_rules
        }

        if (!api_url || !api_key) {
            throw new Error('Configuração incompleta (URL ou Key faltando).')
        }

        const globalMargin = Number(margin) || 200;
        let rules: KeywordRule[] = [];
        try {
            rules = Array.isArray(keyword_rules)
                ? keyword_rules
                : JSON.parse(keyword_rules || '[]');
        } catch (e) {
            rules = [];
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

        // 5. Processa e Prepara para salvar os dados originais no banco
        const servicesToUpsert = providerServices.map((s: any) => {
            const cost = parseFloat(s.rate);
            
            // Calculamos apenas para fins de log ou auditoria se necessário
            const profitMargin = calculateDynamicMargin(s.name || '', rules, globalMargin);
            const finalPrice = cost + (cost * (profitMargin / 100));

            return {
                service_id: Number(s.service),
                name: s.name,
                category: s.category,
                rate: cost, // Salva o preço de custo original para que as regras sejam aplicadas dinamicamente sem double-compounding
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
