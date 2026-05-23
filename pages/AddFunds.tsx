import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const AddFunds: React.FC = () => {
    const [amount, setAmount] = useState<string>('50');
    const [cpf, setCpf] = useState<string>('');
    const [phone, setPhone] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [showPixModal, setShowPixModal] = useState(false);
    const [pixCode, setPixCode] = useState('');
    const [qrCodeBase64, setQrCodeBase64] = useState('');
    const [userProfile, setUserProfile] = useState<{ cpf?: string, cellphone?: string } | null>(null);
    const navigate = useNavigate();

    const maskCPF = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    };

    const maskPhone = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    };

    // Load saved data from profile
    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('cpf, cellphone')
                    .eq('id', user.id)
                    .single();

                if (profile) {
                    setUserProfile(profile);
                    if (profile.cpf) setCpf(maskCPF(profile.cpf));
                    if (profile.cellphone) setPhone(maskPhone(profile.cellphone));
                }
            }
        };
        loadProfile();
    }, []);

    const isValid = () => {
        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');
        const numericAmount = parseFloat(amount.replace(',', '.'));
        return cleanCpf.length === 11 && cleanPhone.length >= 10 && !isNaN(numericAmount) && numericAmount >= 1;
    };

    const handlePay = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                alert('Você precisa estar logado para adicionar saldo.');
                setLoading(false);
                return;
            }

            const numericAmount = parseFloat(amount.replace(',', '.'));

            if (numericAmount < 1) {
                alert('O valor mínimo para depósito é R$ 1,00');
                setLoading(false);
                return;
            }

            const cleanCpf = cpf.replace(/\D/g, '');
            const cleanPhone = phone.replace(/\D/g, '');

            // Save to profile ONLY if not already saved
            if (!userProfile?.cpf) {
                await supabase
                    .from('profiles')
                    .update({ cpf: cleanCpf, cellphone: cleanPhone })
                    .eq('id', user.id);
            }

            const { data, error } = await supabase.functions.invoke('create-abacatepay-checkout', {
                body: {
                    userId: user.id,
                    amount: numericAmount,
                    origin: window.location.origin,
                    customer: {
                        name: user.user_metadata.name || user.email,
                        email: user.email,
                        taxId: cleanCpf,
                        cellphone: cleanPhone
                    }
                }
            });

            if (error) {
                console.error('Erro na Edge Function:', error);
                if (data && data.error) {
                    console.error('Detalhe do erro:', data.error);
                }
                alert('Erro ao processar pagamento. Verifique o console para mais detalhes.');
                return;
            }

            // Redireciona o cliente para o checkout seguro da AbacatePay
            if (data?.success && data?.url) {
                window.location.href = data.url;
            } else {
                console.error('Erro ao criar cobrança (sem URL de checkout):', data);
                alert('Erro ao gerar Pix. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro inesperado. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(pixCode).then(() => {
            alert("Código Pix copiado!");
        });
    };

    const predefinedAmounts = ['20', '50', '100', '200', '500'];

    return (
        <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-white">Adicionar Saldo</h1>
                <p className="text-text-secondary">Recarregue sua conta para continuar impulsionando suas redes.</p>
            </div>

            {/* Pix Modal / Success State */}
            {showPixModal ? (
                <div className="bg-card-dark rounded-xl border border-emerald-500/50 p-8 shadow-lg shadow-emerald-900/20 animate-in fade-in zoom-in duration-300 flex flex-col items-center gap-6 text-center">
                    <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2">
                        <span className="material-symbols-outlined text-4xl">check_circle</span>
                    </div>

                    <h2 className="text-2xl font-bold text-white">Pix Gerado com Sucesso!</h2>
                    <p className="text-text-secondary max-w-md">
                        Escaneie o QR Code abaixo ou use o "Pix Copia e Cola" no app do seu banco.
                        <br />
                        <span className="text-sm text-yellow-500 mt-2 block">O saldo será creditado automaticamente assim que o pagamento for confirmado.</span>
                    </p>

                    <div className="bg-white p-4 rounded-lg">
                        <img
                            src={`data:image/png;base64,${qrCodeBase64}`}
                            alt="QR Code Pix"
                            className="w-48 h-48 object-contain"
                        />
                    </div>

                    <div className="w-full max-w-md flex flex-col gap-2">
                        <label className="text-sm font-medium text-text-secondary text-left">Pix Copia e Cola</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={pixCode}
                                className="flex-1 bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-sm text-gray-300 outline-none"
                            />
                            <button
                                onClick={copyToClipboard}
                                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">content_copy</span>
                                Copiar
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={() => { setShowPixModal(false); navigate(0); }}
                        className="mt-4 text-emerald-400 hover:text-emerald-300 font-bold underline underline-offset-4"
                    >
                        Fazer outro pagamento
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* LEFT COLUMN: Personal Data */}
                    <div className="flex flex-col gap-6">



                        <div>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">person</span>
                                1. Dados do Titular
                            </h3>

                            <div className="bg-card-dark rounded-xl border border-border-dark p-6 shadow-sm flex flex-col gap-5">
                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-3">
                                    <span className="material-symbols-outlined text-yellow-500 text-sm mt-0.5">info</span>
                                    <p className="text-sm text-yellow-200/80">
                                        Dados obrigatórios para emissão de comprovante e identificação do Pix.
                                    </p>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-text-secondary mb-2 block">CPF</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={cpf}
                                            onChange={(e) => setCpf(maskCPF(e.target.value))}
                                            disabled={!!userProfile?.cpf}
                                            className="w-full h-12 pl-4 pr-10 bg-background-dark border border-border-dark rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-gray-600 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-white/5"
                                            placeholder="000.000.000-00"
                                        />
                                        {!!userProfile?.cpf && (
                                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">lock</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-text-secondary mb-2 block">Celular / WhatsApp</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={phone}
                                            onChange={(e) => setPhone(maskPhone(e.target.value))}
                                            disabled={!!userProfile?.cellphone}
                                            className="w-full h-12 pl-4 pr-10 bg-background-dark border border-border-dark rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-gray-600 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-white/5"
                                            placeholder="(00) 00000-0000"
                                        />
                                        {!!userProfile?.cellphone && (
                                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">lock</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Info (Moved) */}
                        <div className="flex flex-col md:flex-row gap-4 p-4 rounded-lg bg-blue-900/20 border border-blue-900/50 text-sm">
                            <div className="flex gap-2">
                                <span className="material-symbols-outlined text-primary">verified_user</span>
                                <div className="text-blue-200">
                                    <span className="font-bold text-white block">Pagamento Seguro</span>
                                    Seus dados são processados com criptografia de ponta a ponta.
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className="material-symbols-outlined text-primary">bolt</span>
                                <div className="text-blue-200">
                                    <span className="font-bold text-white block">Liberação Automática</span>
                                    O saldo entra na sua conta segundos após o pagamento.
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* RIGHT COLUMN: Payment & Amount */}
                    <div className="flex flex-col gap-6">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">payments</span>
                                2. Detalhes do Pagamento
                            </h3>

                            <div className="bg-card-dark rounded-xl border border-border-dark p-6 shadow-sm flex flex-col gap-6">

                                {/* 1. Amount */}
                                <div>
                                    <label className="text-sm font-medium text-text-secondary mb-2 block">Valor da Recarga (R$)</label>
                                    <div className="relative mb-4">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white font-bold text-lg">R$</span>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className={`w-full h-14 pl-12 pr-4 bg-background-dark border border-border-dark rounded-lg text-white text-2xl font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all ${parseFloat(amount) < 1 ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                                            placeholder="0,00"
                                            step="any"
                                            min="1"
                                        />
                                        {parseFloat(amount) < 1 && (
                                            <p className="text-red-400 text-xs mt-1 absolute -bottom-5 left-0">Valor mínimo de R$ 1,00</p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                        {predefinedAmounts.map((val) => (
                                            <button
                                                key={val}
                                                onClick={() => setAmount(val)}
                                                className={`py-2 px-1 rounded-lg text-sm font-bold border transition-colors ${amount === val ? 'bg-white text-black border-white' : 'bg-transparent text-text-secondary border-border-dark hover:border-white hover:text-white'}`}
                                            >
                                                R$ {val}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="h-px bg-border-dark/50 my-2"></div>

                                {/* 2. Payment Method */}
                                <div>
                                    <label className="text-sm font-medium text-text-secondary mb-3 block">Método de Pagamento</label>
                                    <div className="flex flex-col gap-3">
                                        <label className="relative flex items-center gap-4 p-4 rounded-xl border-2 border-primary bg-primary/10 cursor-pointer shadow-lg shadow-primary/10 transition-all hover:bg-primary/20">
                                            <div className="flex items-center justify-center size-10 rounded-full bg-primary text-white">
                                                <span className="material-symbols-outlined">qr_code_2</span>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-white">Pix Automático via AbacatePay</h4>
                                                <p className="text-xs text-text-secondary">Aprovação imediata (24/7)</p>
                                            </div>
                                            <div className="size-5 rounded-full border-2 border-primary flex items-center justify-center">
                                                <div className="size-2.5 rounded-full bg-primary"></div>
                                            </div>
                                            <input type="radio" name="payment" defaultChecked className="hidden" />
                                        </label>

                                        <label className="relative flex items-center gap-4 p-4 rounded-xl border border-border-dark bg-background-dark/50 opacity-50 cursor-not-allowed">
                                            <div className="flex items-center justify-center size-10 rounded-full bg-gray-700 text-gray-400">
                                                <span className="material-symbols-outlined">credit_card</span>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-gray-400">Cartão de Crédito</h4>
                                                <p className="text-xs text-gray-500">Em breve</p>
                                            </div>
                                            <input type="radio" name="payment" disabled className="hidden" />
                                        </label>
                                    </div>
                                </div>

                                {/* 3. Summary & Action */}
                                <div className="mt-2 text-center">
                                    <div className="flex flex-col gap-3 mb-6">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-text-secondary">Taxa de processamento</span>
                                            <span className="text-emerald-500 font-bold">Grátis</span>
                                        </div>
                                        <div className="flex justify-between items-center text-lg font-bold text-white border-t border-border-dark pt-3">
                                            <span>Total a pagar</span>
                                            <span>R$ {Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handlePay}
                                        disabled={loading || !isValid()}
                                        className="w-full h-14 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
                                    >
                                        {loading ? (
                                            <span className="material-symbols-outlined animate-spin text-2xl">refresh</span>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-2xl">pix</span>
                                                Pagar com Pix
                                            </>
                                        )}
                                    </button>
                                    <p className="text-xs text-text-secondary mt-3">
                                        <span className="material-symbols-outlined text-[10px] align-middle mr-1">lock</span>
                                        Ambiente seguro e criptografado
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AddFunds;