// WEBHOOK DE CONFIRMAÇÃO DO ABACATEPAY
// Valida pagamentos Pix do AbacatePay e adiciona saldo instantaneamente ao cliente.

import { createClient } from "supabase-js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// -----------------------------------------------------------------------------
// Função Criptográfica Auxiliar: Validação HMAC SHA256 Nativa (Web Crypto API)
// -----------------------------------------------------------------------------
async function verifyHmacSignature(secret: string, rawBody: string, signatureFromHeader: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureArrayBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      messageData
    );

    const calculatedSignature = Array.from(new Uint8Array(signatureArrayBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return calculatedSignature === signatureFromHeader.toLowerCase();
  } catch (err) {
    console.error("[Webhook Cryptography] Erro ao verificar assinatura HMAC:", err);
    return false;
  }
}

// -----------------------------------------------------------------------------
// Servidor Deno Principal
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Capturar o corpo da requisição em texto bruto (necessário para o HMAC)
    const rawBody = await req.text();
    if (!rawBody) {
      return new Response("Corpo vazio recebido.", { status: 400, headers: corsHeaders });
    }

    // 2. Parse do JSON recebido
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("JSON inválido.", { status: 400, headers: corsHeaders });
    }

    console.log("[AbacatePay Webhook] Payload recebido:", JSON.stringify(payload));

    const event = payload?.event;
    const data = payload?.data;
    
    // 3. Validação de Assinatura (Segurança Criptográfica)
    const webhookSecret = Deno.env.get('ABACATEPAY_WEBHOOK_SECRET');
    const signatureFromHeader = req.headers.get('x-webhook-signature');

    if (webhookSecret) {
      if (!signatureFromHeader) {
        console.error("[AbacatePay Webhook] A assinatura 'x-webhook-signature' está ausente no cabeçalho!");
        return new Response("Assinatura ausente.", { status: 401, headers: corsHeaders });
      }

      const isSignatureValid = await verifyHmacSignature(webhookSecret.trim(), rawBody, signatureFromHeader);
      if (!isSignatureValid) {
        console.error("[AbacatePay Webhook] FRAUDE DETECTADA: Assinatura inválida!");
        return new Response("Assinatura inválida.", { status: 401, headers: corsHeaders });
      }
      console.log("[AbacatePay Webhook] Assinatura HMAC validada com sucesso!");
    } else {
      console.warn("[AbacatePay Webhook] AVISO: A variável 'ABACATEPAY_WEBHOOK_SECRET' não está definida. Rodando em modo de segurança simplificada.");
    }

    // 4. Filtrar pelo evento correto: checkout.completed
    if (event === 'checkout.completed') {
      const checkoutId = data?.id;
      const status = data?.status; // e.g. "PAID"
      const amountInCents = data?.amount; // valor total em centavos
      const userId = data?.metadata?.userId;

      console.log(`[AbacatePay Webhook] Processando Checkout Pago. ID: ${checkoutId}, UserID: ${userId}, Centavos: ${amountInCents}, Status: ${status}`);

      if (!userId) {
        console.error("[AbacatePay Webhook] ERRO: UserId ausente nos metadados da cobrança. Impossível creditar.");
        return new Response("OK", { status: 200, headers: corsHeaders }); // Retorna 200 para evitar loops de reenvio da AbacatePay
      }

      const amountBrl = Number(amountInCents) / 100;
      if (isNaN(amountBrl) || amountBrl <= 0) {
        console.error("[AbacatePay Webhook] ERRO: Valor inválido recebido:", amountInCents);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // 5. Conectar com o Supabase (Ignorar RLS usando o Service Role Key nativo)
      const sbUrl = Deno.env.get('SUPABASE_URL')!;
      const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseAdmin = createClient(sbUrl, sbKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // 6. IDEMPOTENCIA: Verificar se essa transação/checkout já foi creditada
      const { data: existingTx } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('payment_id', checkoutId)
        .maybeSingle();

      if (existingTx) {
        console.log(`[AbacatePay Webhook] Cobrança ${checkoutId} já foi processada anteriormente. Pulando crédito.`);
        return new Response(JSON.stringify({ success: true, duplicated: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 7. Ler o saldo atual do cliente
      const { data: profile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (fetchError || !profile) {
        console.error(`[AbacatePay Webhook] ERRO ao buscar o perfil do usuário ${userId}:`, fetchError);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // 8. Calcular e atualizar o novo saldo
      const currentBalance = Number(profile.balance || 0);
      const newBalance = currentBalance + amountBrl;

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (updateError) {
        console.error(`[AbacatePay Webhook] ERRO ao atualizar saldo do usuário ${userId}:`, updateError);
        return new Response("Erro interno ao atualizar saldo.", { status: 500, headers: corsHeaders });
      }

      console.log(`[AbacatePay Webhook] SUCESSO: R$ ${amountBrl} creditado ao usuário ${userId}. Novo saldo: R$ ${newBalance}`);

      // 9. Registrar na tabela de transações para evitar re-processamento no futuro
      const { error: insertTxError } = await supabaseAdmin
        .from('transactions')
        .insert({
          payment_id: checkoutId,
          user_id: userId,
          amount: amountBrl,
          status: 'approved'
        });

      if (insertTxError) {
        console.error("[AbacatePay Webhook] ALERTA: Erro ao salvar transação de segurança:", insertTxError);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("[AbacatePay Webhook] Erro crítico:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Retorna 200 para evitar que o gateway fique reenviando em caso de falha de código local
    });
  }
});
