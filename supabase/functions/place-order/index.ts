import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Identificar o Usuário
        const authHeader = req.headers.get('Authorization')!
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))

        if (userError || !user) throw new Error('Usuário não autenticado.')

        // 2. Receber dados do Pedido
        const body = await req.json()
        const serviceId = body.service || body.service_id || body.id;
        const link = body.link || body.url;
        const quantity = parseInt(body.quantity);

        if (!serviceId || !link || !quantity) throw new Error('Dados incompletos.')

        // 3. Buscar Preço e Margem
        const { data: serviceData, error: serviceError } = await supabaseClient
            .from('services')
            .select('rate, min, max, name, custom_margin, category')
            .eq('service_id', serviceId)
            .maybeSingle()

        // Backup: tentar pelo ID normal se não achar pelo service_id
        let localService = serviceData
        if (!localService) {
            const { data: serviceDataBackup } = await supabaseClient
                .from('services')
                .select('rate, min, max, name, custom_margin, category')
                .eq('id', serviceId)
                .maybeSingle()
            localService = serviceDataBackup
        }

        if (!localService) {
            console.error(`[PlaceOrder] Serviço ${serviceId} não encontrado.`)
            throw new Error(`Serviço ID ${serviceId} não encontrado (ou colunas incorretas).`)
        }

        // Buscar Configuração Global (Margem, API Key, URL, Margens por Categoria)
        const { data: config } = await supabaseClient
            .from('admin_config')
            .select('api_key, api_url, margin_percent, category_margins')
            .single()

        if (!config) throw new Error('Configuração global não encontrada.')

        // 4. Calcular Custo e Preço de Venda
        const costPrice = Number(localService.rate);
        
        let marginToUse = 100; // fallback padrão de 100%
        if (localService.custom_margin !== null && localService.custom_margin !== undefined) {
            marginToUse = Number(localService.custom_margin);
        } else {
            const nameLower = (localService.name || '').toLowerCase();
            const cost = costPrice;

            // Regra 5: Custo superior a R$ 100,00 -> Margem fixa de proteção de 60%
            if (cost > 100.00) {
                marginToUse = 60;
            }
            // Regra 1: Visualizações, Views ou Impressões -> 500%
            else if (
                nameLower.includes('visualizações') || 
                nameLower.includes('visualizacoes') || 
                nameLower.includes('views') || 
                nameLower.includes('impressões') || 
                nameLower.includes('impressoes')
            ) {
                marginToUse = 500;
            }
            // Regra 2: Curtidas, Likes, Compartilhamentos, Shares ou Reactions -> 300%
            else if (
                nameLower.includes('curtidas') || 
                nameLower.includes('likes') || 
                nameLower.includes('compartilhamentos') || 
                nameLower.includes('shares') || 
                nameLower.includes('reactions')
            ) {
                marginToUse = 300;
            }
            // Regra 3: Membros, Telegram ou Global (e NÃO for YouTube) -> 150%
            else if (
                !(nameLower.includes('youtube') || nameLower.includes('yt')) && 
                (nameLower.includes('membros') || nameLower.includes('telegram') || nameLower.includes('global'))
            ) {
                marginToUse = 150;
            }
            // Regra 4: Seguidores Brasileiros, Seguidores Brasil ou BR -> 140%
            else if (
                nameLower.includes('seguidores brasileiros') || 
                nameLower.includes('seguidores brasil') || 
                nameLower.includes('brasil') || 
                nameLower.includes('brasileiro') || 
                nameLower.includes('🇧🇷') || 
                /\bbr\b/.test(nameLower)
            ) {
                marginToUse = 140;
            }
        }
        
        const retailPricePer1k = costPrice * (1 + marginToUse / 100);
        
        const totalCost = (costPrice * quantity) / 1000;
        const totalRetailPrice = (retailPricePer1k * quantity) / 1000;

        // 5. Verificar Saldo
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('balance, total_spent')
            .eq('id', user.id)
            .single()

        if ((profile?.balance || 0) < totalRetailPrice) {
            return new Response(JSON.stringify({ error: `Saldo insuficiente. Necessário: R$ ${totalRetailPrice.toFixed(2)}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 6. Enviar para Agência Popular

        const params = new URLSearchParams()
        params.append('key', (config.api_key || '').trim())
        params.append('action', 'add')
        params.append('service', serviceId)
        params.append('link', link)
        params.append('quantity', quantity.toString())

        const apiUrl = (config.api_url || '').trim()
        if (!apiUrl) throw new Error('A URL da API do fornecedor não está configurada.')
        if (!(config.api_key || '').trim()) throw new Error('A chave de API (Token) do fornecedor não está configurada no painel.')

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        })

        const result = await response.json() // Tenta parse direto pois sabemos que funciona

        if (result.error) {
            return new Response(JSON.stringify({ error: result.error }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 7. SUCESSO: Descontar, Salvar e Registrar Nome
        await supabaseClient
            .from('profiles')
            .update({
                balance: (profile.balance - totalRetailPrice),
                total_spent: (Number(profile.total_spent || 0) + totalRetailPrice)
            })
            .eq('id', user.id)

        await supabaseClient
            .from('orders')
            .insert({
                user_id: user.id,
                service_id: serviceId,
                service_name: localService.name || 'Serviço Personalizado',
                service: `${serviceId} - ${localService.name || 'Personalizado'}`,
                link: link,
                quantity: quantity,
                amount: totalRetailPrice,
                charge: totalRetailPrice,
                status: 'pending',
                external_id: result.order,
                created_at: new Date().toISOString()
            })

        return new Response(JSON.stringify({ success: true, order: result.order }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (err) {
        console.error('[PlaceOrder] ERRO:', err.message)
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})