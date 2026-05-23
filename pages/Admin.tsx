import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

// Definição dos tipos de dados
interface UserProfile {
    id: string;
    full_name: string;
    email: string;
    balance: number;
    total_spent: number;
    status?: string;
}

interface AdminMetrics {
    total_users: number;
    total_orders: number;
    total_revenue: number;
    total_cost: number;
    net_profit: number;
}

const Admin: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Estado para controlar a privacidade (Olhinho)
    const [showValues, setShowValues] = useState(true);

    // Estado para as métricas financeiras
    const [metrics, setMetrics] = useState<AdminMetrics>({
        total_users: 0,
        total_orders: 0,
        total_revenue: 0,
        total_cost: 0,
        net_profit: 0
    });

    // Estados do Modal de Saldo
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [amountToAdd, setAmountToAdd] = useState('');
    const [processing, setProcessing] = useState(false);

    // Estados do Pix Manual
    const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
    const [isApproving, setIsApproving] = useState(false);
    const [comprovanteModal, setComprovanteModal] = useState<{
        isOpen: boolean;
        url: string;
        txId: string;
        userId: string;
        amount: number;
        full_name: string;
        email: string;
    }>({ isOpen: false, url: '', txId: '', userId: '', amount: 0, full_name: '', email: '' });

    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        loadDashboard();

        // 🌟 REALTIME DE TRANSAÇÕES PIX PENDENTES
        const channel = supabase
            .channel('admin_transactions_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transactions' },
                () => {
                    console.log('Fila de Pix atualizada em tempo real!');
                    loadDashboard();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const loadDashboard = async () => {
        try {
            // 1. Busca CONFIGURAÇÕES DE MARKETING (Fake Data / Offsets)
            const { data: settings } = await supabase
                .from('admin_settings')
                .select('*')
                .single();

            // Variáveis de offset (começam zeradas)
            let offRevenue = 0, offCost = 0, offProfit = 0, offUsers = 0, offOrders = 0;

            // Se o modo simulado estiver ATIVO, carrega os valores
            if (settings && settings.is_simulated) {
                offRevenue = Number(settings.revenue_offset) || 0;
                offCost = Number(settings.cost_offset) || 0;
                offProfit = Number(settings.profit_offset) || 0;
                offUsers = Number(settings.users_offset) || 0;
                offOrders = Number(settings.orders_offset) || 0;
            }

            // 2. Busca DADOS REAIS (Banco de Dados)
            const { data: realMetrics, error: metricsError } = await supabase.rpc('get_admin_stats');

            if (metricsError) console.error('Erro ao carregar métricas:', metricsError);

            // 3. MESCLA REAL + FAKE
            if (realMetrics) {
                setMetrics({
                    total_revenue: (realMetrics.total_revenue || 0) + offRevenue,
                    total_cost: (realMetrics.total_cost || 0) + offCost,
                    net_profit: (realMetrics.net_profit || 0) + offProfit,
                    total_users: (realMetrics.total_users || 0) + offUsers,
                    total_orders: (realMetrics.total_orders || 0) + offOrders
                });
            }

            // 4. Busca LISTA DE USUÁRIOS
            const { data: usersData, error: usersError } = await supabase.rpc('get_admin_users_list');

            if (usersError) throw usersError;

            const formattedUsers: UserProfile[] = (usersData || []).map((user: any) => ({
                id: user.id,
                full_name: user.full_name || 'Usuário sem nome',
                email: user.email || 'Sem email',
                balance: user.balance || 0,
                total_spent: user.total_spent || 0,
                status: user.status || 'Ativo'
            }));

            setUsers(formattedUsers);

            // 5. Busca transações Pix pendentes ('Pagamento em Análise')
            const { data: txData, error: txError } = await supabase
                .from('transactions')
                .select('*')
                .eq('status', 'Pagamento em Análise')
                .order('created_at', { ascending: false });

            if (!txError && txData) {
                const userIds = Array.from(new Set(txData.map((tx: any) => tx.user_id)));
                if (userIds.length > 0) {
                    const { data: profilesData } = await supabase
                        .from('profiles')
                        .select('id, full_name')
                        .in('id', userIds);

                    const { data: notificationsData } = await supabase
                        .from('notificacoes_admin')
                        .select('order_id, user_email')
                        .in('order_id', txData.map((tx: any) => tx.payment_id));

                    const mapped = txData.map((tx: any) => {
                        const profile = profilesData?.find((p: any) => p.id === tx.user_id);
                        const notif = notificationsData?.find((n: any) => n.order_id === tx.payment_id);
                        return {
                            ...tx,
                            full_name: profile?.full_name || 'Usuário Sem Nome',
                            email: notif?.user_email || 'email@desconhecido.com'
                        };
                    });
                    setPendingTransactions(mapped);
                } else {
                    setPendingTransactions([]);
                }
            } else {
                setPendingTransactions([]);
            }

        } catch (error: any) {
            console.error('Erro Geral Admin:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddBalance = async () => {
        if (!selectedUser || !amountToAdd) return;
        const valor = parseFloat(amountToAdd.replace(',', '.'));
        if (isNaN(valor) || valor <= 0) return alert('Valor inválido');

        const confirmacao = window.confirm(`Confirmar adição de R$ ${valor.toFixed(2)} para ${selectedUser.full_name}?`);
        if (!confirmacao) return;

        setProcessing(true);
        try {
            const novoSaldo = (selectedUser.balance || 0) + valor;
            const { error } = await supabase
                .from('profiles')
                .update({ balance: novoSaldo })
                .eq('id', selectedUser.id);

            if (error) throw error;
            loadDashboard();
            setIsModalOpen(false);
            setAmountToAdd('');
            alert('Saldo adicionado com sucesso!');
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    // Abre o visualizador do comprovante de Pix Manual
    const handleViewComprovante = async (tx: any) => {
        try {
            const { data, error } = await supabase
                .from('mensagens')
                .select('conteudo')
                .eq('order_id', tx.payment_id)
                .eq('tipo', 'comprovante')
                .order('criado_em', { ascending: false })
                .limit(1)
                .single();

            if (error || !data) {
                alert("Não foi possível encontrar o comprovante deste pagamento.");
                return;
            }

            setComprovanteModal({
                isOpen: true,
                url: data.conteudo,
                txId: tx.payment_id,
                userId: tx.user_id,
                amount: tx.amount,
                full_name: tx.full_name,
                email: tx.email
            });
        } catch (err: any) {
            alert('Erro ao buscar comprovante: ' + err.message);
        }
    };

    // Executa a aprovação do Pix manual (Credita saldo + Cria notificação)
    const handleApprovePix = async () => {
        if (!comprovanteModal.txId || !comprovanteModal.userId) return;
        setIsApproving(true);

        try {
            // 1. Atualizar a transação para 'approved' no banco
            const { error: txError } = await supabase
                .from('transactions')
                .update({ status: 'approved' })
                .eq('payment_id', comprovanteModal.txId);

            if (txError) throw txError;

            // 2. Buscar saldo atual do perfil do cliente
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('balance, total_spent')
                .eq('id', comprovanteModal.userId)
                .single();

            if (profileError || !profile) throw new Error("Perfil do usuário não encontrado.");

            // 3. Somar o Pix ao saldo do usuário
            const novoSaldo = Number(profile.balance || 0) + Number(comprovanteModal.amount);

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ balance: novoSaldo })
                .eq('id', comprovanteModal.userId);

            if (updateError) throw updateError;

            // 4. Registrar notificação de sucesso para o cliente
            await supabase.from('notifications').insert({
                user_id: comprovanteModal.userId,
                title: 'Depósito Pix Aprovado! 🎉',
                message: `Seu Pix de R$ ${comprovanteModal.amount.toFixed(2).replace('.', ',')} foi aprovado pela equipe financeira e o saldo já está disponível na sua conta!`,
                type: 'info',
                is_read: false
            });

            // 5. Atualizar notificação de admin para 'lida'
            await supabase
                .from('notificacoes_admin')
                .update({ lida: true })
                .eq('order_id', comprovanteModal.txId);

            alert('PIX Aprovado com sucesso! Saldo creditado e notificação enviada ao cliente.');
            setComprovanteModal({ isOpen: false, url: '', txId: '', userId: '', amount: 0, full_name: '', email: '' });
            loadDashboard();

        } catch (err: any) {
            console.error(err);
            alert('Erro ao aprovar Pix: ' + err.message);
        } finally {
            setIsApproving(false);
        }
    };

    const handleSyncServices = async () => {
        const confirm = window.confirm("Deseja realmente sincronizar e atualizar todos os serviços, preços e limites mínimos/máximos com a Agência Popular?");
        if (!confirm) return;

        setSyncing(true);
        try {
            // 1. Busca configurações de admin_config
            const { data: config, error: configError } = await supabase
                .from('admin_config')
                .select('api_url, api_key, margin_percent, keyword_rules')
                .single();

            if (configError) {
                throw new Error(`Erro ao buscar configurações no banco de dados: ${configError.message} (${configError.code})`);
            }

            if (!config || !config.api_key) {
                throw new Error("Configurações do fornecedor (API Key) vazias ou não encontradas em admin_config.");
            }

            // 2. Invoca a Edge Function de Sincronização passando as credenciais no body
            const { data: syncRes, error: syncError } = await supabase.functions.invoke('sync-services', {
                body: {
                    api_url: config.api_url,
                    api_key: config.api_key,
                    margin: config.margin_percent,
                    keyword_rules: config.keyword_rules
                }
            });

            if (syncError) {
                let errorMessage = syncError.message;
                try {
                    if ('context' in syncError && (syncError as any).context) {
                        const context = (syncError as any).context;
                        if (typeof context.json === 'function') {
                            const body = await context.json();
                            if (body && body.error) errorMessage = body.error;
                        } else if (typeof context.text === 'function') {
                            const text = await context.text();
                            if (text) errorMessage = text;
                        }
                    }
                } catch (e) {
                    console.error("Erro ao extrair corpo do erro da Edge Function:", e);
                }
                throw new Error(errorMessage);
            }

            if (!syncRes || syncRes.error) {
                throw new Error(syncRes?.error || "Erro desconhecido na sincronização.");
            }

            alert(`Sincronização concluída com sucesso! ${syncRes.count} serviços foram atualizados com os novos valores, limites mínimos e descrições do fornecedor!`);
            loadDashboard();

        } catch (err: any) {
            console.error("Falha ao sincronizar:", err);
            alert("Erro na sincronização: " + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const filteredUsers = users.filter(user => {
        const term = searchTerm.toLowerCase();
        return (
            (user.full_name || '').toLowerCase().includes(term) ||
            (user.email || '').toLowerCase().includes(term) ||
            (user.id || '').toLowerCase().includes(term)
        );
    });

    // Helper para exibir valor ou "bloqueado"
    const displayMoney = (value: number) => {
        if (!showValues) return 'R$ ••••••';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatMoney = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    if (loading) return <div className="p-10 text-white animate-pulse">Carregando painel do comandante...</div>;

    return (
        <div className="space-y-8 pb-20">

            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="inline-flex items-center px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider mb-3">
                        Modo Administrador
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Painel de Controle</h1>
                    <p className="text-slate-400 mt-2 text-lg">
                        Visão geral financeira e gerenciamento de usuários.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSyncServices}
                        disabled={syncing}
                        className="bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-black px-4 py-2.5 rounded-lg font-black transition-all flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/10 cursor-pointer"
                    >
                        <span className={`material-symbols-outlined text-[20px] ${syncing ? 'animate-spin' : ''}`}>sync</span>
                        {syncing ? 'Sincronizando...' : 'Sincronizar Serviços'}
                    </button>
                    <button
                        onClick={() => {
                            const pwd = prompt('Digite a senha de administrador:');
                            if (pwd === '123456') navigate('/admin/config');
                            else alert('Senha incorreta');
                        }}
                        className="bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-white px-4 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 text-sm shadow-sm"
                    >
                        <span className="material-symbols-outlined text-[20px]">settings</span>
                        Configurações
                    </button>
                </div>
            </div>

            {/* --- BLOCO FINANCEIRO (Cards) --- */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-500">payments</span>
                        Financeiro
                    </h2>
                    <button
                        onClick={() => setShowValues(!showValues)}
                        className="text-slate-500 hover:text-white text-sm flex items-center gap-1 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            {showValues ? 'visibility' : 'visibility_off'}
                        </span>
                        {showValues ? 'Ocultar Valores' : 'Mostrar Valores'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Card 1: Faturamento (Posição 1) */}
                    <div className="bg-[#111827] p-6 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-all">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Faturamento Total</p>
                                <h3 className="text-3xl font-black text-white">
                                    {displayMoney(metrics.total_revenue || 0)}
                                </h3>
                                <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                                    <span className="material-symbols-outlined text-[14px]">trending_up</span>
                                    +24% este mês
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="p-3 bg-[#1f2937] rounded-lg text-blue-500">
                                    <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                                </div>
                                <button onClick={() => setShowValues(!showValues)} className="text-slate-600 hover:text-white transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">{showValues ? 'visibility' : 'visibility_off'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
                    </div>

                    {/* Card 2: Lucro Líquido (POSIÇÃO 2 - DESTAQUE) */}
                    <div className="bg-[#111827] p-6 rounded-xl border border-emerald-900/30 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Lucro Real (Líquido)</p>
                                <h3 className="text-3xl font-black text-emerald-400">
                                    {displayMoney(metrics.net_profit || 0)}
                                </h3>
                                <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                                    <span className="material-symbols-outlined text-[14px]">trending_up</span>
                                    +18% este mês
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="p-3 bg-[#1f2937] rounded-lg text-emerald-500 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-2xl">attach_money</span>
                                </div>
                                <button onClick={() => setShowValues(!showValues)} className="text-slate-600 hover:text-emerald-500 transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">{showValues ? 'visibility' : 'visibility_off'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl group-hover:bg-emerald-500/30 transition-all"></div>
                    </div>

                    {/* Card 3: Custo API (POSIÇÃO 3) */}
                    <div className="bg-[#111827] p-6 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-red-500/30 transition-all">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Custo API (Fornecedor)</p>
                                <h3 className="text-3xl font-black text-white">
                                    {displayMoney(metrics.total_cost || 0)}
                                </h3>
                                <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                                    <span className="material-symbols-outlined text-[14px]">trending_flat</span>
                                    Estável
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="p-3 bg-[#1f2937] rounded-lg text-red-500">
                                    <span className="material-symbols-outlined text-2xl">trending_down</span>
                                </div>
                                <button onClick={() => setShowValues(!showValues)} className="text-slate-600 hover:text-white transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">{showValues ? 'visibility' : 'visibility_off'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all"></div>
                    </div>

                </div>
            </div>

            {/* --- BLOCO OPERACIONAL --- */}
            <div>
                <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-purple-500">analytics</span>
                    Operacional
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Card Usuários */}
                    <div className="bg-[#111827] p-6 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition-all">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Usuários</p>
                                <h3 className="text-3xl font-black text-white">{metrics.total_users}</h3>
                                <p className="text-xs text-slate-500 mt-2">Cadastrados na plataforma</p>
                            </div>
                            <div className="p-3 bg-[#1f2937] rounded-lg text-purple-500 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-2xl">group</span>
                            </div>
                        </div>
                        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
                    </div>

                    {/* Card Pedidos */}
                    <div className="bg-[#111827] p-6 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pedidos Realizados</p>
                                <h3 className="text-3xl font-black text-white">{metrics.total_orders}</h3>
                                <p className="text-xs text-slate-500 mt-2">Processados com sucesso</p>
                            </div>
                            <div className="p-3 bg-[#1f2937] rounded-lg text-indigo-500 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-2xl">shopping_cart</span>
                            </div>
                        </div>
                        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
                    </div>
                </div>
            </div>

            {/* --- TRANSAÇÕES PIX PENDENTES (Realtime) --- */}
            {pendingTransactions.length > 0 && (
                <div className="bg-[#111827] rounded-xl border border-emerald-900/30 shadow-lg overflow-hidden shadow-emerald-950/5 animate-in fade-in slide-in-from-top-4 duration-300 mb-8">
                    <div className="p-6 border-b border-slate-800 bg-emerald-950/10 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-400 animate-pulse">payments</span>
                            Pix Pendentes para Análise ({pendingTransactions.length})
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest animate-pulse">
                            Tempo Real Ativo
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#0b111a] text-slate-400">
                                <tr>
                                    <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">ID Transação</th>
                                    <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Cliente</th>
                                    <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Valor Solicitado</th>
                                    <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-center">Status</th>
                                    <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {pendingTransactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-slate-800/20 bg-emerald-950/5 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-amber-500">
                                            #{tx.payment_id}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-white">{tx.full_name}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{tx.email}</div>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-bold text-white">
                                            R$ {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse">
                                                Em Análise
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleViewComprovante(tx)}
                                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 inline-flex shadow-lg shadow-emerald-500/10 active:scale-95"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">file_open</span>
                                                Ver Comprovante
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TABELA DE USUÁRIOS --- */}
            <div className="bg-[#111827] rounded-xl border border-slate-800 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">manage_accounts</span>
                        Gerenciar Usuários
                    </h3>

                    <div className="relative w-full md:w-auto">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">search</span>
                        <input
                            type="text"
                            placeholder="Buscar nome, email ou ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-[#0b111a] border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none w-full md:w-80 transition-all placeholder:text-slate-600"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#0b111a] text-slate-400">
                            <tr>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Usuário / ID</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">E-mail</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Saldo Atual</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Gasto Total</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined text-4xl opacity-20">search_off</span>
                                            <p>Nenhum usuário encontrado para "{searchTerm}"</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-800/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-white group-hover:text-primary transition-colors">{user.full_name}</div>
                                            <div className="text-[10px] text-slate-600 font-mono mt-1 uppercase tracking-wide">{user.id}</div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 font-medium">
                                            {user.email}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`font-mono font-bold ${user.balance > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                {formatMoney(user.balance)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-bold text-slate-300">
                                            {formatMoney(user.total_spent)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                                                {user.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => { setSelectedUser(user); setIsModalOpen(true); }}
                                                className="text-slate-500 hover:text-white hover:bg-slate-700 p-2 rounded-lg transition-all"
                                                title="Editar Saldo"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Saldo (Mantido igual) */}
            {isModalOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#1e293b] rounded-2xl p-6 w-full max-w-md border border-slate-700 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-white">Adicionar Saldo</h3>
                                <p className="text-slate-400 text-sm mt-1">
                                    Beneficiário: <strong className="text-white">{selectedUser.full_name}</strong>
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 mb-6">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Valor a creditar (R$)</label>
                            <input
                                type="number"
                                value={amountToAdd}
                                onChange={(e) => setAmountToAdd(e.target.value)}
                                placeholder="0,00"
                                className="w-full bg-transparent border-none text-white text-3xl font-bold focus:ring-0 p-0 placeholder:text-slate-700"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-slate-400 hover:text-white font-medium hover:bg-slate-800 rounded-lg transition-colors">Cancelar</button>
                            <button onClick={handleAddBalance} disabled={processing} className="flex-1 py-3 bg-primary hover:bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 transition-all">
                                {processing ? 'Processando...' : 'Confirmar Crédito'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Conferência e Visualização do Comprovante */}
            {comprovanteModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#1e293b] border border-slate-700 w-full max-w-xl overflow-hidden shadow-2xl rounded-2xl">
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <h3 className="font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined text-emerald-400 animate-pulse">payments</span>
                                Conferência de PIX Manual
                            </h3>
                            <button 
                                onClick={() => setComprovanteModal({ isOpen: false, url: '', txId: '', userId: '', amount: 0, full_name: '', email: '' })} 
                                className="text-slate-400 hover:text-white"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col items-center bg-slate-950/40 text-center">
                            <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">Comprovante anexado pelo cliente:</p>
                            <div className="relative w-full max-w-sm h-[380px] border border-slate-800 rounded-xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
                                {comprovanteModal.url.includes('.pdf') ? (
                                    <iframe src={comprovanteModal.url} className="w-full h-full" title="PDF do Comprovante" />
                                ) : (
                                    <img src={comprovanteModal.url} alt="Comprovante Pix" className="w-full h-full object-contain" />
                                )}
                            </div>
                            <div className="mt-4 text-xs text-slate-400 space-y-1">
                                <p>Cliente: <strong className="text-white">{comprovanteModal.full_name} ({comprovanteModal.email})</strong></p>
                                <p>Valor: <strong className="text-emerald-400 font-mono font-bold text-sm">R$ {comprovanteModal.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between gap-4">
                            <button
                                onClick={() => setComprovanteModal({ isOpen: false, url: '', txId: '', userId: '', amount: 0, full_name: '', email: '' })}
                                className="flex-1 py-3 bg-[#334155] text-slate-300 text-xs font-bold uppercase tracking-widest hover:text-white hover:bg-slate-700 rounded-xl transition-all"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={handleApprovePix}
                                disabled={isApproving}
                                className="flex-1 py-3 bg-emerald-500 text-black text-xs font-bold uppercase tracking-widest hover:bg-emerald-400 rounded-xl transition-all flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50"
                            >
                                {isApproving ? (
                                    <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                        Aprovar PIX e Liberar Saldo
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;