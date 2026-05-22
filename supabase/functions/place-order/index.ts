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
            .select('rate, min, max, name, custom_margin')
            .eq('service_id', serviceId)
            .maybeSingle()

        // Backup: tentar pelo ID normal se não achar pelo service_id
        let localService = serviceData
        if (!localService) {
            const { data: serviceDataBackup } = await supabaseClient
                .from('services')
                .select('rate, min, max, name, custom_margin')
                .eq('id', serviceId)
                .maybeSingle()
            localService = serviceDataBackup
        }

        if (!localService) {
            console.error(`[PlaceOrder] Serviço ${serviceId} não encontrado.`)
            throw new Error(`Serviço ID ${serviceId} não encontrado (ou colunas incorretas).`)
        }

        // Buscar Configuração Global (Margem, API Key, URL)
        const { data: config } = await supabaseClient
            .from('admin_config')
            .select('api_key, api_url, margin_percent')
            .single()

        if (!config) throw new Error('Configuração global não encontrada.')

        // 4. Calcular Custo e Preço de Venda
        const costPrice = Number(localService.rate);
        const marginToUse = (localService.custom_margin !== null && localService.custom_margin !== undefined) 
            ? Number(localService.custom_margin) 
            : Number(config.margin_percent || 200);
        
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
        params.append('key', config.api_key.trim())
        params.append('action', 'add')
        params.append('service', serviceId)
        params.append('link', link)
        params.append('quantity', quantity.toString())

        const response = await fetch(config.api_url.trim(), {
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