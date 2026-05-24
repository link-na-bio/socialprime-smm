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

    const allowedKeywords = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter', 'Google'];
    const allowedKeywordsLower = allowedKeywords.map(k => k.toLowerCase());

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

        // Limpa espaços em branco para evitar erros com chaves/URLs copiadas
        api_url = api_url.trim();
        api_key = api_key.trim();

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

        // 5. Aplica filtro rigoroso (whitelist) case-insensitive
        const filteredServices = providerServices.filter((s: any) => {
            if (!s.name) return false;
            const nameLower = s.name.toLowerCase();
            return allowedKeywordsLower.some(keyword => nameLower.includes(keyword));
        });

        console.log(`Filtrados ${filteredServices.length} de ${providerServices.length} serviços para importação.`);

        // 6. Processa e Prepara para salvar os dados originais no banco
        const servicesToUpsert = filteredServices.map((s: any) => {
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

        // 7. Salva no Supabase os serviços autorizados pela whitelist
        if (servicesToUpsert.length > 0) {
            const { error: upsertError } = await supabase
                .from('services')
                .upsert(servicesToUpsert, { onConflict: 'service_id' });

            if (upsertError) throw upsertError;
        }

        // 8. Remove/Desativa do banco todos os serviços atuais que não se enquadram na nova regra
        const { data: dbServices, error: fetchError } = await supabase
            .from('services')
            .select('service_id, name');

        if (fetchError) throw fetchError;

        let deletedCount = 0;
        if (dbServices && dbServices.length > 0) {
            const servicesToDelete = dbServices.filter((s: any) => {
                if (!s.name) return true; // Deleta sem nome
                const nameLower = s.name.toLowerCase();
                return !allowedKeywordsLower.some(keyword => nameLower.includes(keyword));
            });

            if (servicesToDelete.length > 0) {
                const idsToDelete = servicesToDelete.map((s: any) => s.service_id);
                console.log(`Deletando ${idsToDelete.length} serviços antigos que não correspondem à whitelist.`);
                
                const { error: deleteError } = await supabase
                    .from('services')
                    .delete()
                    .in('service_id', idsToDelete);

                if (deleteError) throw deleteError;
                deletedCount = idsToDelete.length;
            }
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                importedCount: servicesToUpsert.length, 
                deletedCount: deletedCount, 
                source: 'database_config' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
