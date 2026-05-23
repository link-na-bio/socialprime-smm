import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Configuração do cliente Supabase com a Service Role (para ter poder de edição)
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // 1. Buscar as chaves da API na sua tabela de configuração
    const { data: config } = await supabaseClient
      .from('admin_config')
      .select('api_key, api_url')
      .single()

    if (!config) throw new Error('Configuração da API não encontrada.')

    // 2. Buscar pedidos que ainda não estão finalizados (pending, processing, in_progress)
    const { data: orders, error: ordersError } = await supabaseClient
      .from('orders')
      .select('id, user_id, external_id, status, charge')
      .in('status', ['pending', 'processing', 'in_progress'])
      .not('external_id', 'is', null)

    if (ordersError) throw ordersError
    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum pedido para atualizar.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(`[Cron] Verificando ${orders.length} pedidos...`)

    // 3. Loop para consultar cada pedido na Agência Popular
    for (const order of orders) {
      try {
        const params = new URLSearchParams()
        params.append('key', config.api_key.trim())
        params.append('action', 'status')
        params.append('order', order.external_id)

        const response = await fetch(config.api_url.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        })

        const result = await response.json()

        if (result.status) {
          // Mapeamento de Status: Converte o status da API para o seu padrão
          const statusMap: Record<string, string> = {
            'Pending': 'pending',
            'Processing': 'processing',
            'In progress': 'in_progress',
            'Completed': 'completed',
            'Partial': 'partial',
            'Canceled': 'canceled',
            'Refunded': 'refunded'
          }

          const newStatus = statusMap[result.status] || order.status

          // 4. Atualiza o banco de dados se o status mudou
          if (newStatus !== order.status) {
            await supabaseClient
              .from('orders')
              .update({
                status: newStatus,
                remains: result.remains || 0, // Opcional: guarda quanto falta entregar
                start_count: result.start_count || 0
              })
              .eq('id', order.id)

            console.log(`[Cron] Pedido ${order.id} atualizado para: ${newStatus}`)

            // REEMBOLSO AUTOMÁTICO SE CANCELADO OU REEMBOLSADO
            if (newStatus === 'canceled' || newStatus === 'refunded') {
              const { data: profile } = await supabaseClient
                .from('profiles')
                .select('balance, total_spent')
                .eq('id', order.user_id)
                .single()

              if (profile) {
                const refundAmount = Number(order.charge || 0)
                const currentBalance = Number(profile.balance || 0)
                const currentSpent = Number(profile.total_spent || 0)

                await supabaseClient
                  .from('profiles')
                  .update({
                    balance: currentBalance + refundAmount,
                    total_spent: Math.max(0, currentSpent - refundAmount)
                  })
                  .eq('id', order.user_id)

                console.log(`[Cron] Reembolso de R$ ${refundAmount} creditado ao usuário ${order.user_id} por cancelamento.`)
              }
            }


            let notificationMessage = `O status do pedido #${order.id.slice(0, 8)} mudou para ${newStatus}.`;
            let notificationType = 'info';

            if (newStatus === 'completed') {
              notificationMessage = `Seu pedido #${order.id.slice(0, 8)} foi concluído com sucesso!`;
              notificationType = 'success'; // Assuming you might have a 'success' type or keep 'info'
            } else if (newStatus === 'canceled' || newStatus === 'refunded') {
              notificationMessage = `Seu pedido #${order.id.slice(0, 8)} foi cancelado/reembolsado.`;
              notificationType = 'warning';
            } else if (newStatus === 'processing') {
              notificationMessage = `Seu pedido #${order.id.slice(0, 8)} está em processamento.`;
            }

            await supabaseClient
              .from('notifications')
              .insert({
                user_id: order.user_id,
                title: 'Atualização de Pedido',
                message: notificationMessage,
                type: notificationType === 'success' ? 'info' : notificationType, // Keep compatible with existing types if unsure
                is_read: false
              })

            console.log(`[Cron] Pedido ${order.id} atualizado para: ${newStatus} e notificação enviada.`)
          }
        }
      } catch (err) {
        console.error(`[Cron] Erro ao consultar pedido ${order.external_id}:`, err.message)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})