// WEBHOOK FINAL - SOCIALPRIME (Produção)
import { createClient } from "supabase-js";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // 1. Tratamento de CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Leitura segura do corpo
        const rawBody = await req.text();
        let body;
        try {
            body = JSON.parse(rawBody);
        } catch {
            // Se não for JSON, ignora sem erro (pode ser ping do navegador)
            return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const { action, type, data } = body;
        const id = data?.id || body?.id;

        // 2. Filtro: Só processa pagamentos
        if (action === 'payment.updated' || action === 'payment.created' || type === 'payment') {
            if (!id) return new Response("OK", { status: 200, headers: corsHeaders });

            console.log(`[Webhook] Processando Pagamento ID: ${id}`);

            // 3. Consulta ao Mercado Pago (Validação Oficial)
            const mpToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
                headers: { 'Authorization': `Bearer ${mpToken}` }
            });

            if (!mpRes.ok) {
                console.error(`Erro ao consultar MP: ${mpRes.status}`);
                return new Response("OK", { status: 200, headers: corsHeaders });
            }

            const paymentData = await mpRes.json();

            // 4. Se Aprovado, adiciona saldo
            if (paymentData.status === 'approved') {
                const userId = paymentData.external_reference;
                const amount = Number(paymentData.transaction_amount);
                const paymentId = String(id);

                if (!userId) {
                    console.error("Pagamento sem UserID (external_reference). Ignorado.");
                    return new Response("OK", { status: 200, headers: corsHeaders });
                }

                // Conexão Admin (Service Role) para ignorar RLS e escrever no saldo
                const sbUrl = Deno.env.get('SUPABASE_URL');
                const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

                const supabaseAdmin = createClient(sbUrl!, sbKey!, {
                    auth: { autoRefreshToken: false, persistSession: false }
                });

                // IDEMPOTENCIA: Verifica se já processou
                const { data: existingTx } = await supabaseAdmin
                    .from('transactions')
                    .select('id')
                    .eq('payment_id', paymentId)
                    .single();

                if (existingTx) {
                    console.log(`[Webhook] Pagamento ${paymentId} já processado anteriormente. Ignorando duplicidade.`);
                    return new Response("OK", { status: 200, headers: corsHeaders });
                }

                // Leitura do saldo atual
                const { data: profile, error: fetchError } = await supabaseAdmin
                    .from('profiles')
                    .select('balance')
                    .eq('id', userId)
                    .single();

                if (fetchError) {
                    console.error(`Erro ao ler perfil ${userId}:`, fetchError);
                    return new Response("OK", { status: 200, headers: corsHeaders });
                }

                const newBalance = Number(profile?.balance || 0) + amount;

                // Atualização do Saldo
                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', userId);

                if (updateError) {
                    console.error("Erro ao atualizar saldo:", updateError);
                } else {
                    console.log(`SUCESSO: Saldo de ${userId} atualizado (+R$${amount}). Novo total: R$${newBalance}`);

                    // Registra a transação para evitar duplicidade futura
                    await supabaseAdmin
                        .from('transactions')
                        .insert({
                            payment_id: paymentId,
                            user_id: userId,
                            amount: amount,
                            status: 'approved'
                        });
                }
            }
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error("Erro no Webhook:", err);
        // Sempre retorna 200 para o Mercado Pago não ficar reenviando em caso de erro interno nosso
        return new Response(JSON.stringify({ error: "Internal Error" }), { status: 200, headers: corsHeaders });
    }
});