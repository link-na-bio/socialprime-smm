import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const ApiConfig: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isSimulated, setIsSimulated] = useState(false);

    // Estados dos números "Fake" (Offsets da Estratégia de Visualização)
    const [usersOffset, setUsersOffset] = useState(0);
    const [ordersOffset, setOrdersOffset] = useState(0);
    const [revenueOffset, setRevenueOffset] = useState(0.0);
    const [costOffset, setCostOffset] = useState(0.0);
    const [profitOffset, setProfitOffset] = useState(0.0);

    // Estados do Provedor e Lucros (admin_config)
    const [marginPercent, setMarginPercent] = useState<number>(200);
    const [apiUrl, setApiUrl] = useState<string>('https://agenciapopular.com/api/v2');
    const [apiKey, setApiKey] = useState<string>('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // 1. Busca configurações de admin_settings
            const { data: settings } = await supabase
                .from('admin_settings')
                .select('*')
                .single();

            if (settings) {
                setIsSimulated(settings.is_simulated || false);
                setUsersOffset(settings.users_offset || 0);
                setOrdersOffset(settings.orders_offset || 0);
                setRevenueOffset(settings.revenue_offset || 0);
                setCostOffset(settings.cost_offset || 0);
                setProfitOffset(settings.profit_offset || 0);
            }

            // 2. Busca configurações de admin_config (API & Margem de Lucro)
            const { data: config } = await supabase
                .from('admin_config')
                .select('*')
                .single();

            if (config) {
                setMarginPercent(Number(config.margin_percent) || 200);
                setApiUrl(config.api_url || 'https://agenciapopular.com/api/v2');
                setApiKey(config.api_key || '');
            }
        } catch (error) {
            console.log('Configurações carregadas com sucesso.');
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // 1. Atualiza ou Cria admin_settings
            const { data: existingSettings } = await supabase.from('admin_settings').select('id').single();

            if (existingSettings) {
                await supabase
                    .from('admin_settings')
                    .update({
                        is_simulated: isSimulated,
                        users_offset: Number(usersOffset),
                        orders_offset: Number(ordersOffset),
                        revenue_offset: Number(revenueOffset),
                        cost_offset: Number(costOffset),
                        profit_offset: Number(profitOffset),
                        updated_at: new Date(),
                    })
                    .eq('id', existingSettings.id);
            } else {
                await supabase.from('admin_settings').insert({
                    is_simulated: isSimulated,
                    users_offset: Number(usersOffset),
                    orders_offset: Number(ordersOffset),
                    revenue_offset: Number(revenueOffset),
                    cost_offset: Number(costOffset),
                    profit_offset: Number(profitOffset),
                });
            }

            // 2. Atualiza ou Cria admin_config (Provedor SMM)
            const { data: existingConfig } = await supabase.from('admin_config').select('id').single();

            if (existingConfig) {
                await supabase
                    .from('admin_config')
                    .update({
                        api_url: apiUrl,
                        api_key: apiKey,
                        margin_percent: Number(marginPercent),
                        updated_at: new Date(),
                    })
                    .eq('id', existingConfig.id);
            } else {
                await supabase.from('admin_config').insert({
                    id: 1,
                    api_url: apiUrl,
                    api_key: apiKey,
                    margin_percent: Number(marginPercent),
                });
            }

            alert('Configurações salvas e aplicadas com sucesso!');
            navigate('/admin');
        } catch (error: any) {
            alert('Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20 space-y-8">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-black text-white">Configurações Gerais</h1>
                    <p className="text-slate-400 mt-2">
                        Gerencie a margem de lucro do seu negócio, conexões de API e estratégia de visualização.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/admin')}
                    className="bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-white px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm shadow-sm"
                >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Voltar
                </button>
            </div>

            {/* CARD 1: CONFIGURAÇÃO DE PREÇOS E PROVEDOR */}
            <div className="bg-[#111827] rounded-xl border border-slate-800 p-8 shadow-2xl space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                    <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <span className="material-symbols-outlined text-2xl">percent</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Lucro & Conexão API</h3>
                        <p className="text-sm text-slate-400">Configure a sua margem de lucro e os tokens de integração.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Margem de Lucro */}
                    <div className="bg-[#0b111a] p-5 rounded-lg border border-slate-800 flex flex-col gap-2 md:col-span-2">
                        <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                            Margem de Lucro Global (%)
                        </label>
                        <p className="text-[11px] text-slate-500">Exemplo: 200% significa que um serviço de custo R$ 1,00 será vendido a R$ 3,00 para o cliente.</p>
                        <div className="relative mt-2">
                            <input
                                type="number"
                                value={marginPercent}
                                onChange={(e) => setMarginPercent(Number(e.target.value))}
                                className="w-full bg-[#111a22] border border-slate-700 rounded-lg p-3 text-white text-xl font-bold focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                placeholder="200"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-xl">%</span>
                        </div>
                    </div>

                    {/* URL da API */}
                    <div className="bg-[#0b111a] p-5 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                            URL da API do Fornecedor
                        </label>
                        <input
                            type="text"
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                            className="w-full bg-[#111a22] border border-slate-700 rounded-lg p-3 text-white font-medium focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                            placeholder="https://agenciapopular.com/api/v2"
                        />
                    </div>

                    {/* Chave de API */}
                    <div className="bg-[#0b111a] p-5 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                            Token da API (API Key)
                        </label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full bg-[#111a22] border border-slate-700 rounded-lg p-3 text-white font-medium focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm font-mono"
                            placeholder="Cole o seu Token da Agência Popular..."
                        />
                    </div>
                </div>
            </div>

            {/* CARD 2: ESTRATÉGIA DE VISUALIZAÇÃO */}
            <div className="bg-[#111827] rounded-xl border border-slate-800 p-8 shadow-2xl space-y-6">
                {/* Header do Card */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${isSimulated ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-500'}`}>
                            <span className="material-symbols-outlined text-2xl">monitoring</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Modo Marketing (Estratégia de Visualização)</h3>
                            <p className="text-sm text-slate-400">Configure a percepção de volume do seu negócio (soma offsets aos dados reais).</p>
                        </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                        onClick={() => setIsSimulated(!isSimulated)}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${isSimulated ? 'bg-purple-600' : 'bg-slate-700'
                            }`}
                    >
                        <span
                            className={`${isSimulated ? 'translate-x-8' : 'translate-x-1'
                                } inline-block h-5 w-5 transform rounded-full bg-white transition-transform`}
                        />
                    </button>
                </div>

                {/* Grid de Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Faturamento */}
                    <div className="bg-[#0b111a] p-4 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                            + Faturamento (R$)
                        </label>
                        <input
                            type="number"
                            value={revenueOffset}
                            onChange={(e) => setRevenueOffset(Number(e.target.value))}
                            className="w-full bg-transparent border-none text-white text-xl font-bold focus:ring-0 p-0 placeholder:text-slate-800 outline-none"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Lucro */}
                    <div className="bg-[#0b111a] p-4 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                            + Lucro Líquido (R$)
                        </label>
                        <input
                            type="number"
                            value={profitOffset}
                            onChange={(e) => setProfitOffset(Number(e.target.value))}
                            className="w-full bg-transparent border-none text-white text-xl font-bold focus:ring-0 p-0 placeholder:text-slate-800 outline-none"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Custo */}
                    <div className="bg-[#0b111a] p-4 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-red-400 uppercase tracking-wider block">
                            + Custo API (R$)
                        </label>
                        <input
                            type="number"
                            value={costOffset}
                            onChange={(e) => setCostOffset(Number(e.target.value))}
                            className="w-full bg-transparent border-none text-white text-xl font-bold focus:ring-0 p-0 placeholder:text-slate-800 outline-none"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Usuários */}
                    <div className="bg-[#0b111a] p-4 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-purple-400 uppercase tracking-wider block">
                            + Usuários (Qtd)
                        </label>
                        <input
                            type="number"
                            value={usersOffset}
                            onChange={(e) => setUsersOffset(Number(e.target.value))}
                            className="w-full bg-transparent border-none text-white text-xl font-bold focus:ring-0 p-0 placeholder:text-slate-800 outline-none"
                            placeholder="0"
                        />
                    </div>

                    {/* Pedidos */}
                    <div className="bg-[#0b111a] p-4 rounded-lg border border-slate-800 flex flex-col gap-2">
                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                            + Pedidos (Qtd)
                        </label>
                        <input
                            type="number"
                            value={ordersOffset}
                            onChange={(e) => setOrdersOffset(Number(e.target.value))}
                            className="w-full bg-transparent border-none text-white text-xl font-bold focus:ring-0 p-0 placeholder:text-slate-800 outline-none"
                            placeholder="0"
                        />
                    </div>
                </div>
            </div>

            {/* BOTÃO SALVAR */}
            <div className="flex justify-end pt-4">
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                    <span className="material-symbols-outlined">save</span>
                    {loading ? 'Salvando...' : 'Salvar Todas as Configurações 🚀'}
                </button>
            </div>
        </div>
    );
};

export default ApiConfig;