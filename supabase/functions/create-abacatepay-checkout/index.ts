// CHECKOUT ABACATEPAY v2.0
// Cria uma cobrança dinâmica via Pix na plataforma AbacatePay.
// O saldo será creditado automaticamente através do webhook de pagamento.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log("AbacatePay Checkout Service - Iniciado");

serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Leitura e validação dos dados recebidos
    const body = await req.json().catch(() => ({}));
    const { amount, customer, userId, origin } = body;

    console.log(`[AbacatePay] Iniciando checkout. UserID: ${userId}, Valor: ${amount}`);

    if (!userId || userId.length < 10) {
      console.error("ERRO: UserID inválido ou ausente!");
      return new Response(JSON.stringify({ error: "O campo userId é obrigatório e deve ser válido." }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!amount || Number(amount) <= 0) {
      console.error("ERRO: Valor de recarga inválido!");
      return new Response(JSON.stringify({ error: "O valor da recarga deve ser maior que zero." }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Preparação das chaves de retorno (HashRouter compatível)
    const baseOrigin = origin || "https://socialprime-smm.vercel.app";
    const returnUrl = `${baseOrigin}/#/dashboard`;
    const completionUrl = `${baseOrigin}/#/dashboard`;

    // 4. Conversão para centavos (AbacatePay exige inteiro em centavos. Ex: R$ 50.00 -> 5000)
    const amountInCents = Math.round(Number(amount) * 100);

    // 5. Preparação dos dados do cliente
    const customerName = customer?.name?.trim() || "Cliente SocialPrime";
    const customerEmail = customer?.email?.trim() || "email@socialprime.com";
    const customerTaxId = customer?.taxId ? customer.taxId.replace(/\D/g, '') : "19100000000";
    const customerCellphone = customer?.cellphone ? customer.cellphone.replace(/\D/g, '') : "";

    // 6. Payload para a API v2 da AbacatePay
    const payload = {
      frequency: "ONE_TIME",
      methods: ["PIX"],
      products: [
        {
          externalId: "recharge",
          name: "Recarga de Saldo - SocialPrime",
          quantity: 1,
          price: amountInCents
        }
      ],
      returnUrl: returnUrl,
      completionUrl: completionUrl,
      customer: {
        name: customerName,
        email: customerEmail,
        taxId: customerTaxId,
        cellphone: customerCellphone
      },
      metadata: {
        userId: String(userId)
      }
    };

    console.log("[AbacatePay] Enviando payload:", JSON.stringify(payload));

    // 7. Obter a chave de API da AbacatePay
    const apiKey = Deno.env.get('ABACATEPAY_ACCESS_TOKEN') || Deno.env.get('ABACATEPAY_KEY') || Deno.env.get('VITE_ABACATEPAY_KEY');
    if (!apiKey) {
      throw new Error("Chave de API AbacatePay ausente nas configurações do Supabase.");
    }

    // 8. Chamar API do AbacatePay
    const response = await fetch('https://api.abacatepay.com/v2/checkouts/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log(`[AbacatePay] Resposta da API (${response.status}):`, responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { error: responseText };
    }

    if (!response.ok) {
      console.error("[AbacatePay] Falha na resposta da API:", responseData);
      return new Response(JSON.stringify({ error: "Erro ao criar cobrança no AbacatePay.", details: responseData }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 9. Sucesso! Retorna a URL de redirecionamento para o Frontend
    const checkoutUrl = responseData.data?.url;
    if (!checkoutUrl) {
      console.error("[AbacatePay] URL de checkout não encontrada na resposta!");
      throw new Error("A API não retornou uma URL de checkout válida.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: checkoutUrl,
        id: responseData.data?.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error("[AbacatePay] Erro crítico no checkout:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
