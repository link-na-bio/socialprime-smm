// CHECKOUT V2.0 - CRIAÇÃO DE PIX BLINDADA
// Usa Deno.serve nativo (igual ao Webhook V10) para máxima compatibilidade.

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log("Checkout V2.0 - Serviço Iniciado");

Deno.serve(async (req) => {
    // 1. CORS Pre-flight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Leitura e Validação do Corpo
        const body = await req.json().catch(() => ({}));
        const { amount, customer, userId } = body;

        console.log(`[Checkout] Pedido recebido. User: ${userId}, Valor: ${amount}`);

        // TRAVA DE SEGURANÇA: Se não tiver UserID, nem tenta criar o Pix.
        if (!userId || userId.length < 10) {
            console.error("ERRO: UserID inválido ou ausente!");
            return new Response(JSON.stringify({ error: "UserID is mandatory" }), {
                status: 400, headers: corsHeaders
            });
        }

        if (!amount || Number(amount) <= 0) {
            return new Response(JSON.stringify({ error: "Invalid amount" }), {
                status: 400, headers: corsHeaders
            });
        }

        // 3. Preparação dos Dados do Cliente
        // O Mercado Pago é chato com nomes. Vamos garantir que tenha Nome e Sobrenome.
        let firstName = "Cliente";
        let lastName = "SocialPrime";

        if (customer?.name) {
            const parts = customer.name.trim().split(' ');
            if (parts.length > 0) firstName = parts[0];
            if (parts.length > 1) lastName = parts.slice(1).join(' ');
        }

        // 4. URL DO WEBHOOK (DINÂMICA E SEGURA)
        // Usamos a URL do seu projeto para garantir que o MP notifique o lugar certo.
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || "https://ejpyblnvjjqcfdazqquy.supabase.co";
        const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

        // 5. Payload para o Mercado Pago
        const payload = {
            transaction_amount: Number(amount),
            description: "Recarga SocialPrime",
            payment_method_id: "pix",
            payer: {
                email: customer?.email || "email@socialprime.com",
                first_name: firstName,
                last_name: lastName,
                identification: {
                    type: "CPF",
                    // Remove tudo que não for número do CPF para evitar erro
                    number: customer?.taxId ? customer.taxId.replace(/\D/g, '') : "19100000000"
                }
            },
            // AQUI ESTÁ O SEGREDO: O ID do usuário vai na referência externa
            external_reference: String(userId),
            notification_url: webhookUrl
        };

        console.log("Enviando para MP:", JSON.stringify(payload));

        // 6. Chamada à API do Mercado Pago
        const mpToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
        if (!mpToken) throw new Error("Token MP ausente no Supabase");

        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${mpToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': crypto.randomUUID()
            },
            body: JSON.stringify(payload)
        });

        const responseText = await mpRes.text();

        // Tenta ler o JSON, se falhar usa o texto cru
        let data;
        try { data = JSON.parse(responseText); } catch { data = { error: responseText }; }

        if (!mpRes.ok) {
            console.error("Erro MP:", data);
            return new Response(JSON.stringify({ error: "Erro ao criar Pix", details: data }), {
                status: 400, headers: corsHeaders
            });
        }

        // 7. Sucesso! Retorna o QR Code
        const qrCode = data.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
        const paymentId = data.id;

        console.log(`Pix Criado com Sucesso! ID: ${paymentId}`);

        return new Response(JSON.stringify({
            success: true,
            pixCode: qrCode,
            qrCodeBase64: qrCodeBase64,
            paymentId: paymentId,
            status: data.status
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error("Erro Crítico no Checkout:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500, headers: corsHeaders
        });
    }
});