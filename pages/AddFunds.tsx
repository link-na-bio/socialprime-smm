import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Chave Geral do Bruno
const CHAVE_PIX_REAL = '02636623140';

// Códigos Copia e Cola estáticos e QR Codes do Bruno
const PACOTES_INFO: Record<string, any> = {
    '20': {
        nome: 'Recarga R$ 20',
        preco: 20.00,
        qrCodeImg: '/pix-20.png',
        copiaECola: '00020126330014br.gov.bcb.pix011102636623140520400005303986540520.005802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62170513SOCIALPRIME206304F279'
    },
    '50': {
        nome: 'Recarga R$ 50',
        preco: 50.00,
        qrCodeImg: '/pix-50.png',
        copiaECola: '00020126330014br.gov.bcb.pix011102636623140520400005303986540550.005802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62170513SOCIALPRIME506304BC0E'
    },
    '100': {
        nome: 'Recarga R$ 100',
        preco: 100.00,
        qrCodeImg: '/pix-100.png',
        copiaECola: '00020126330014br.gov.bcb.pix0111026366231405204000053039865406100.005802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62180514SOCIALPRIME1006304CFC2'
    },
    '200': {
        nome: 'Recarga R$ 200',
        preco: 200.00,
        qrCodeImg: '/pix-200.png',
        copiaECola: '00020126330014br.gov.bcb.pix0111026366231405204000053039865406200.005802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62180514SOCIALPRIME2006304A2C9'
    },
    '500': {
        nome: 'Recarga R$ 500',
        preco: 500.00,
        qrCodeImg: '/pix-500.png',
        copiaECola: '00020126330014br.gov.bcb.pix0111026366231405204000053039865406500.005802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62180514SOCIALPRIME50063045C26'
    },
    '500+': {
        nome: 'Recarga VIP R$ 500+',
        preco: 500.00,
        qrCodeImg: '/pix-500+.png',
        copiaECola: '00020126330014br.gov.bcb.pix0111026366231405204000053039865802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62180514SOCIALPRIMEVIP63043C0D'
    }
};

const AddFunds: React.FC = () => {
    const [amount, setAmount] = useState<string>('50');
    const [cpf, setCpf] = useState<string>('');
    const [phone, setPhone] = useState<string>('');
    const [loading, setLoading] = useState(false);

    // Estados do Fluxo Pix Manual
    const [showPixModal, setShowPixModal] = useState(false);
    const [showSuccessState, setShowSuccessState] = useState(false);
    const [copied, setCopied] = useState(false);
    const [comprovante, setComprovante] = useState<File | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [userProfile, setUserProfile] = useState<{ cpf?: string, cellphone?: string, email?: string } | null>(null);
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

    // Carregar informações de perfil do usuário
    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('cpf, cellphone')
                    .eq('id', user.id)
                    .single();

                setUserProfile({
                    cpf: profile?.cpf,
                    cellphone: profile?.cellphone,
                    email: user.email
                });

                if (profile?.cpf) setCpf(maskCPF(profile.cpf));
                if (profile?.cellphone) setPhone(maskPhone(profile.cellphone));
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

    // Abre o Modal do Pix Manual
    const handlePay = () => {
        if (!isValid()) return;
        setComprovante(null);
        setShowPixModal(true);
    };

    // Detectar seleção do comprovante
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setComprovante(e.target.files[0]);
        }
    };

    // Retorna as informações de Pix (predefinido ou dinâmico)
    const getPixInfo = () => {
        const amtStr = amount.trim();
        const predefined = PACOTES_INFO[amtStr];
        if (predefined) {
            return {
                qrCodeImg: predefined.qrCodeImg,
                copiaECola: predefined.copiaECola,
                isPredefined: true
            };
        }

        // Geração dinâmica para valores personalizados
        const numericAmount = parseFloat(amount.replace(',', '.'));
        const valorPixStr = isNaN(numericAmount) ? "1.00" : numericAmount.toFixed(2);

        const brCode = `00020101021226870014br.gov.bcb.pix25650017${CHAVE_PIX_REAL}5204000053039865405${valorPixStr}5802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62070503***6304`;

        return {
            qrCodeImg: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(brCode)}`,
            copiaECola: brCode,
            isPredefined: false
        };
    };

    const pixInfo = getPixInfo();

    const handleCopyPix = () => {
        navigator.clipboard.writeText(pixInfo.copiaECola);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Ação de Confirmação do Pix Manual (Upload + Gravação)
    const handleConfirmPix = async () => {
        if (!comprovante) {
            alert("Por favor, anexe o comprovante de pagamento.");
            return;
        }

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado no painel.");

            const numericAmount = parseFloat(amount.replace(',', '.'));
            const cleanCpf = cpf.replace(/\D/g, '');
            const cleanPhone = phone.replace(/\D/g, '');

            // Atualiza os dados cadastrais se ainda não salvos
            if (!userProfile?.cpf) {
                await supabase
                    .from('profiles')
                    .update({ cpf: cleanCpf, cellphone: cleanPhone })
                    .eq('id', user.id);
            }

            // 1. Gerar ID Único de Transação
            const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

            // 2. Fazer Upload do Arquivo para o Storage do Supabase (Bucket 'comprovantes_pix')
            const fileExt = comprovante.name.split('.').pop();
            const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${user.id}/${safeFileName}`;

            const { error: uploadError } = await supabase.storage
                .from('comprovantes_pix')
                .upload(filePath, comprovante);

            if (uploadError) throw uploadError;

            // Obter URL Pública do comprovante
            const { data: { publicUrl } } = supabase.storage
                .from('comprovantes_pix')
                .getPublicUrl(filePath);

            // 3. Inserir a transação pendente na tabela 'transactions'
            const { error: txError } = await supabase
                .from('transactions')
                .insert({
                    payment_id: transactionId,
                    user_id: user.id,
                    amount: numericAmount,
                    status: 'Pagamento em Análise'
                });

            if (txError) throw txError;

            // 4. Criar registro na tabela 'notificacoes_admin'
            await supabase.from('notificacoes_admin').insert({
                user_id: user.id,
                user_email: user.email,
                order_id: transactionId,
                pacote: `Recarga de R$ ${numericAmount.toFixed(2)}`,
                mensagem: 'Novo comprovante Pix enviado para análise manual!'
            });

            // 5. Salvar na tabela 'mensagens' para indexação do admin
            await supabase.from('mensagens').insert({
                user_id: user.id,
                order_id: transactionId,
                conteudo: publicUrl,
                tipo: 'comprovante'
            });

            // 6. Integração com o Webhook do Discord (Notificar Admin)
            const discordWebhookUrl = 'https://discord.com/api/webhooks/1492131248091435170/l4cqtcHnLulXpEDka8bsSon81D2_8OY5e5vP3kxlbI6UcIb5KOSIHmhwivBqPsDmuHdU';
            const valorFormatado = numericAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const mensagemDiscord = `@everyone 💸 **NOVO COMPROVANTE RECEBIDO (PIX MANUAL)** 💸\n\n🆔 **ID Transação:** #${transactionId}\n👤 **Cliente:** ${user.email}\n💰 **Valor do PIX:** R$ ${valorFormatado}\n\n🚀 Acesse o Painel Admin para conferir e aprovar o saldo imediatamente!`;

            try {
                await fetch(discordWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: mensagemDiscord })
                });
            } catch (err) {
                console.error("Falha ao enviar webhook ao Discord:", err);
            }

            // Exibir a tela de sucesso
            setTxId(transactionId);
            setShowSuccessState(true);
            setShowPixModal(false);

        } catch (error: any) {
            console.error("Erro ao processar comprovante:", error);
            alert("Erro ao enviar comprovante: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const predefinedAmounts = ['20', '50', '100', '200', '500'];

    return (
        <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-white">Adicionar Saldo</h1>
                <p className="text-text-secondary">Recarregue sua conta para continuar impulsionando suas redes.</p>
            </div>

            {/* TELA DE SUCESSO APÓS ENVIO DO COMPROVANTE */}
            {showSuccessState ? (
                <div className="bg-card-dark rounded-xl border border-emerald-500/50 p-8 shadow-lg shadow-emerald-900/20 animate-in fade-in zoom-in duration-300 flex flex-col items-center gap-6 text-center max-w-2xl mx-auto w-full">
                    <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2">
                        <span className="material-symbols-outlined text-4xl">check_circle</span>
                    </div>

                    <h2 className="text-2xl font-bold text-white">Comprovante Enviado com Sucesso!</h2>
                    <p className="text-text-secondary leading-relaxed">
                        Recebemos o seu comprovante e criamos a transação <strong className="text-white font-mono">#{txId}</strong>.
                        <br />
                        <span className="text-yellow-500 font-bold block mt-3">
                            Status atual: "Em Análise".
                        </span>
                        Seu saldo de <strong className="text-white">R$ {parseFloat(amount).toFixed(2).replace('.', ',')}</strong> será creditado em instantes assim que a equipe financeira conferir a transação.
                    </p>

                    <button
                        onClick={() => { setShowSuccessState(false); navigate('/history'); }}
                        className="mt-6 px-8 py-3.5 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">history</span>
                        Ver Histórico de Transações
                    </button>

                    <button
                        onClick={() => { setShowSuccessState(false); setComprovante(null); }}
                        className="text-gray-400 hover:text-white font-bold underline underline-offset-4 text-xs"
                    >
                        Fazer outro pagamento
                    </button>
                </div>
            ) : (
                <>
                    {/* MODAL DE PAGAMENTO PIX + UPLOAD */}
                    {showPixModal && (
                        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                            <div className="bg-card-dark border border-border-dark rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(19,127,236,0.15)] relative my-auto">
                                <div className="bg-white/5 border-b border-border-dark p-4 flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-primary">
                                        <span className="material-symbols-outlined">qr_code_2</span>
                                        <span className="font-bold tracking-wider text-sm uppercase">Pagamento via PIX</span>
                                    </div>
                                    <button onClick={() => setShowPixModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                <div className="p-6 flex flex-col items-center text-center">
                                    <h3 className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Valor a pagar</h3>
                                    <p className="text-3xl font-black text-white mb-6">R$ {parseFloat(amount).toFixed(2).replace('.', ',')}</p>

                                    <div className="w-full space-y-4 mb-6 flex flex-col items-center">
                                        <div className="bg-white p-3 rounded-xl border border-gray-200">
                                            {/* Imagem do QR Code Pix (Estático ou via Charts se for valor customizado) */}
                                            <img
                                                src={pixInfo.qrCodeImg}
                                                alt="QR Code PIX"
                                                className="w-40 h-40 object-contain rounded-lg"
                                                onError={(e) => {
                                                    e.currentTarget.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixInfo.copiaECola)}`;
                                                }}
                                            />
                                        </div>

                                        <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl text-left w-full text-xs">
                                            <p className="text-[10px] text-primary uppercase tracking-widest font-bold mb-2">Instruções de Pagamento:</p>
                                            <p className="text-gray-300 leading-relaxed font-light mb-4">
                                                1. Escaneie o QR Code acima ou use a chave Pix abaixo.<br />
                                                2. No app do banco, aparecerá o valor exato de <strong className="text-white font-bold">R$ {parseFloat(amount).toFixed(2).replace('.', ',')}</strong>.<br />
                                                3. Anexe o comprovante abaixo e finalize a recarga.
                                            </p>

                                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Chave Pix Aleatória:</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={pixInfo.copiaECola}
                                                    className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-[10px] text-gray-300 outline-none truncate font-mono"
                                                />
                                                <button
                                                    onClick={handleCopyPix}
                                                    className="bg-primary hover:bg-primary-dark text-white px-3 rounded-lg transition-all flex items-center justify-center shrink-0"
                                                >
                                                    <span className="material-symbols-outlined text-sm">{copied ? 'done' : 'content_copy'}</span>
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-500 mt-2">Beneficiário: Bruno Adriano Costa Reis</p>
                                        </div>
                                    </div>

                                    {/* Campo Seletor de Comprovante (Upload) */}
                                    <div className="w-full mb-6">
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            hidden
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                        />
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all ${comprovante
                                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                                    : 'border-border-dark hover:border-primary/50 bg-background-dark/50 hover:bg-background-dark'
                                                }`}
                                        >
                                            {comprovante ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined">file_present</span>
                                                    <span className="text-xs font-bold truncate max-w-[220px]">{comprovante.name}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-3xl text-gray-400 mb-1">upload_file</span>
                                                    <p className="text-xs font-bold text-white uppercase tracking-wider">Anexar Comprovante</p>
                                                    <p className="text-[9px] text-slate-500 mt-1">Clique para selecionar (Imagem ou PDF)</p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleConfirmPix}
                                        disabled={loading || !comprovante}
                                        className="w-full py-4 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary-dark transition-all rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                                    >
                                        {loading ? (
                                            <span className="material-symbols-outlined animate-spin">refresh</span>
                                        ) : (
                                            "Confirmar e Enviar Pix"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* INTERFACE DE FORMULÁRIO DE DADOS PESSOAIS */}
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
                                                className="w-full h-12 pl-4 pr-10 bg-background-dark border border-border-dark rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-gray-600 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-white/5 font-mono"
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
                                                className="w-full h-12 pl-4 pr-10 bg-background-dark border border-border-dark rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-gray-600 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-white/5 font-mono"
                                                placeholder="(00) 00000-0000"
                                            />
                                            {!!userProfile?.cellphone && (
                                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">lock</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4 p-4 rounded-lg bg-blue-900/20 border border-blue-900/50 text-sm">
                                <div className="flex gap-2">
                                    <span className="material-symbols-outlined text-primary">verified_user</span>
                                    <div className="text-blue-200">
                                        <span className="font-bold text-white block">Pagamento Direto</span>
                                        Seus dados são transmitidos com criptografia ponta a ponta.
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <span className="material-symbols-outlined text-primary">bolt</span>
                                    <div className="text-blue-200">
                                        <span className="font-bold text-white block">Conferência Rápida</span>
                                        O saldo é liberado assim que o administrador conferir o PIX.
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
                                                    <h4 className="font-bold text-white font-display">Pix Estático / Direto</h4>
                                                    <p className="text-xs text-text-secondary">Conferência manual pelo financeiro</p>
                                                </div>
                                                <div className="size-5 rounded-full border-2 border-primary flex items-center justify-center">
                                                    <div className="size-2.5 rounded-full bg-primary"></div>
                                                </div>
                                                <input type="radio" name="payment" defaultChecked className="hidden" />
                                            </label>
                                        </div>
                                    </div>

                                    {/* 3. Summary & Action */}
                                    <div className="mt-2 text-center">
                                        <div className="flex flex-col gap-3 mb-6">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-text-secondary">Taxa de intermediação</span>
                                                <span className="text-emerald-500 font-bold">R$ 0,00 (Grátis)</span>
                                            </div>
                                            <div className="flex justify-between items-center text-lg font-bold text-white border-t border-border-dark pt-3">
                                                <span>Total a transferir</span>
                                                <span>R$ {Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handlePay}
                                            disabled={loading || !isValid()}
                                            className="w-full h-14 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
                                        >
                                            <span className="material-symbols-outlined text-2xl">pix</span>
                                            Pagar Agora via PIX
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
                </>
            )}
        </div>
    );
};

export default AddFunds;