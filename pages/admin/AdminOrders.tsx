import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface Transaction {
    id: string;
    payment_id: string;
    user_id: string;
    amount: number;
    status: string;
    created_at: string;
    full_name?: string;
    email?: string;
}

const AdminOrders: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [filterStatus, setFilterStatus] = useState<string>('todos');
    const [isApproving, setIsApproving] = useState(false);
    
    // Modal de comprovante
    const [comprovanteModal, setComprovanteModal] = useState<{
        isOpen: boolean;
        url: string;
        txId: string;
        userId: string;
        amount: number;
        full_name: string;
        email: string;
    }>({ isOpen: false, url: '', txId: '', userId: '', amount: 0, full_name: '', email: '' });

    const loadTransactions = async () => {
        try {
            // Busca transações
            const { data: txData, error: txError } = await supabase
                .from('transactions')
                .select('*')
                .order('created_at', { ascending: false });

            if (txError) throw txError;

            if (txData && txData.length > 0) {
                const userIds = Array.from(new Set(txData.map((tx: any) => tx.user_id)));
                
                // Busca perfis correspondentes
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', userIds);

                // Busca e-mails reais da tabela notificacoes_admin
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
                setTransactions(mapped);
            } else {
                setTransactions([]);
            }
        } catch (error: any) {
            console.error('Erro ao carregar transações:', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTransactions();

        // 🌟 Escuta em tempo real do Supabase
        const channel = supabase
            .channel('admin_orders_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transactions' },
                () => {
                    console.log('Transações atualizadas em tempo real!');
                    loadTransactions();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Abre o visualizador do comprovante buscando na tabela mensagens
    const handleViewComprovante = async (tx: Transaction) => {
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
                alert("Não foi possível encontrar o comprovante deste pagamento na tabela mensagens.");
                return;
            }

            setComprovanteModal({
                isOpen: true,
                url: data.conteudo,
                txId: tx.payment_id,
                userId: tx.user_id,
                amount: tx.amount,
                full_name: tx.full_name || 'Usuário Sem Nome',
                email: tx.email || 'email@desconhecido.com'
            });
        } catch (err: any) {
            alert('Erro ao buscar comprovante: ' + err.message);
        }
    };

    // Aprova o Pix Manual
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
                .select('balance')
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
            loadTransactions();

        } catch (err: any) {
            console.error(err);
            alert('Erro ao aprovar Pix: ' + err.message);
        } finally {
            setIsApproving(false);
        }
    };

    // Rejeitar Pix / Cancelar
    const handleRejectPix = async (paymentId: string) => {
        const confirm = window.confirm("Deseja realmente cancelar/recusar este Pix?");
        if (!confirm) return;

        try {
            const { error } = await supabase
                .from('transactions')
                .update({ status: 'canceled' })
                .eq('payment_id', paymentId);

            if (error) throw error;
            alert("Pix cancelado com sucesso.");
            loadTransactions();
        } catch (err: any) {
            alert("Erro ao cancelar Pix: " + err.message);
        }
    };

    // Filtragem
    const filteredTransactions = transactions.filter(tx => {
        if (filterStatus === 'todos') return true;
        if (filterStatus === 'pendentes') return tx.status === 'Pagamento em Análise';
        if (filterStatus === 'aprovados') return tx.status === 'approved';
        if (filterStatus === 'cancelados') return tx.status === 'canceled';
        return true;
    });

    if (loading) return <div className="p-10 text-white animate-pulse">Carregando fila de monitoramento...</div>;

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <div className="inline-flex items-center px-2.5 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-3">
                        Monitoramento de Pagamentos
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Pedidos & Transações Pix</h1>
                    <p className="text-slate-400 mt-2 text-sm md:text-base">
                        Fila de depósitos Pix com escuta Supabase Realtime ativa.
                    </p>
                </div>
                
                {/* Status Filters */}
                <div className="flex bg-[#0b111a] border border-slate-800 rounded-lg p-1">
                    <button 
                        onClick={() => setFilterStatus('todos')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'todos' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        Todos
                    </button>
                    <button 
                        onClick={() => setFilterStatus('pendentes')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all relative ${filterStatus === 'pendentes' ? 'bg-emerald-500 text-black' : 'text-slate-400 hover:text-white'}`}
                    >
                        Em Análise
                        {transactions.filter(t => t.status === 'Pagamento em Análise').length > 0 && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500 animate-ping"></span>
                        )}
                    </button>
                    <button 
                        onClick={() => setFilterStatus('aprovados')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'aprovados' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        Aprovados
                    </button>
                </div>
            </div>

            {/* Fila de Transações */}
            <div className="bg-[#111827] rounded-xl border border-slate-800 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-[#0b111a]/40">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">receipt_long</span>
                        Pedidos Registrados ({filteredTransactions.length})
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
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Valor R$</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Data</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-center">Status</th>
                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined text-4xl opacity-20">payments</span>
                                            <p>Nenhuma transação encontrada nesta categoria.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map((tx) => (
                                    <tr key={tx.id} className={`hover:bg-slate-800/20 transition-colors ${tx.status === 'Pagamento em Análise' ? 'bg-emerald-950/5' : ''}`}>
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
                                        <td className="px-6 py-4 text-xs text-slate-400">
                                            {new Date(tx.created_at).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {tx.status === 'Pagamento em Análise' ? (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse">
                                                    Em Análise
                                                </span>
                                            ) : tx.status === 'approved' ? (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                    Aprovado
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-500 border border-red-500/20">
                                                    Cancelado
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            {tx.status === 'Pagamento em Análise' && (
                                                <>
                                                    <button
                                                        onClick={() => handleViewComprovante(tx)}
                                                        className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition-all inline-flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 active:scale-95 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">file_open</span>
                                                        Conferer Comprovante
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectPix(tx.payment_id)}
                                                        className="px-3.5 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 font-bold text-xs rounded-lg transition-all inline-flex items-center gap-1.5 active:scale-95 cursor-pointer"
                                                        title="Recusar Pix"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

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

export default AdminOrders;
