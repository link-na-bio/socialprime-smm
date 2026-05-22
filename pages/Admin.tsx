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

    useEffect(() => {
        loadDashboard();
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
        </div>
    );
};

export default Admin;