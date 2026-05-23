import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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

const Checkout: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const amountParam = searchParams.get('amount') || '50';
    const amountValue = parseFloat(amountParam.replace(',', '.'));

    const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutos em segundos
    const [comprovante, setComprovante] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [userProfile, setUserProfile] = useState<{ cpf?: string, cellphone?: string, email?: string } | null>(null);

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
            }
        };
        loadProfile();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Retorna as informações de Pix (predefinido ou dinâmico)
    const getPixInfo = () => {
        const amtStr = String(amountValue);
        const predefined = PACOTES_INFO[amtStr];
        if (predefined) {
            return {
                nome: predefined.nome,
                qrCodeImg: predefined.qrCodeImg,
                copiaECola: predefined.copiaECola,
                isPredefined: true
            };
        }
        
        // Geração dinâmica para valores personalizados
        const valorPixStr = isNaN(amountValue) ? "50.00" : amountValue.toFixed(2);
        const brCode = `00020101021226870014br.gov.bcb.pix25650017${CHAVE_PIX_REAL}5204000053039865405${valorPixStr}5802BR5924BRUNO ADRIANO COSTA REIS6008BRASILIA62070503***6304`;
        
        return {
            nome: `Recarga R$ ${parseFloat(valorPixStr).toFixed(2).replace('.', ',')}`,
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setComprovante(e.target.files[0]);
        }
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
            if (!user) throw new Error("Usuário não autenticado.");

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
                    amount: amountValue,
                    status: 'Pagamento em Análise'
                });

            if (txError) throw txError;

            // 4. Criar registro na tabela 'notificacoes_admin'
            await supabase.from('notificacoes_admin').insert({
                user_id: user.id,
                user_email: user.email,
                order_id: transactionId,
                pacote: pixInfo.nome,
                mensagem: 'Novo comprovante Pix enviado via Checkout!'
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
            const valorFormatado = amountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const mensagemDiscord = `@everyone 💸 **NOVO COMPROVANTE RECEBIDO (CHECKOUT PIX)** 💸\n\n🆔 **ID Transação:** #${transactionId}\n👤 **Cliente:** ${user.email}\n💰 **Valor do PIX:** R$ ${valorFormatado}\n\n🚀 Acesse o Painel Admin para conferir e aprovar o saldo imediatamente!`;
            
            try {
                await fetch(discordWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: mensagemDiscord })
                });
            } catch (err) {
                console.error("Falha ao enviar webhook ao Discord:", err);
            }

            // Redireciona o cliente para a tela de Sucesso
            navigate(`/checkout/success?amount=${amountValue}&txId=${transactionId}`);

        } catch (error: any) {
            console.error("Erro ao processar comprovante:", error);
            alert("Erro ao enviar comprovante: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-dark flex flex-col font-sans text-white">
            {/* Simple Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-card-dark">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-8 rounded-lg bg-primary/20 text-primary">
                        <span className="material-symbols-outlined">rocket_launch</span>
                    </div>
                    <h2 className="text-lg font-bold">SocialPrime Checkout</h2>
                </div>
            </header>

            <div className="flex-1 flex justify-center py-10 px-4 bg-[#0d1218]">
                <div className="w-full max-w-[1100px] flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-2xl sm:text-3xl font-black leading-tight tracking-tight">Checkout Pix</h1>
                            <p className="text-text-secondary text-sm sm:text-base">Efetue a transferência Pix e anexe o comprovante abaixo.</p>
                        </div>
                        <Link to="/add-funds" className="flex items-center gap-2 px-4 h-10 bg-card-dark border border-border-dark rounded-lg text-sm font-bold text-white hover:bg-border-dark transition-colors self-start sm:self-auto">
                            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                            Voltar
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                        {/* Left Column: Resumo */}
                        <section className="lg:col-span-5 flex flex-col gap-6">
                            <div className="bg-card-dark rounded-xl border border-border-dark overflow-hidden shadow-sm">
                                <div className="p-5 border-b border-border-dark bg-white/5">
                                    <h3 className="font-bold text-lg flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">receipt_long</span>
                                        Resumo da Recarga
                                    </h3>
                                </div>
                                <div className="p-6 flex flex-col gap-6">
                                    <div className="flex gap-4">
                                        <div className="size-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-inner">
                                            <span className="material-symbols-outlined text-white">account_balance_wallet</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">Item</span>
                                            <span className="font-semibold text-base leading-snug">{pixInfo.nome}</span>
                                        </div>
                                    </div>
                                    <div className="h-px bg-border-dark w-full"></div>
                                    <div className="bg-background-dark/30 rounded-lg p-4 flex flex-col gap-1 border border-dashed border-border-dark/50">
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="font-bold text-base">Total a Pagar</span>
                                            <span className="font-black text-2xl tracking-tight text-white font-mono">
                                                R$ {amountValue.toFixed(2).replace('.', ',')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Right Column: Payment */}
                        <section className="lg:col-span-7 flex flex-col">
                            <div className="bg-card-dark rounded-xl border border-border-dark shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-blue-400"></div>
                                <div className="p-6 md:p-8 flex flex-col items-center gap-6">
                                    {/* Timer */}
                                    <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4 bg-background-dark p-3 rounded-lg border border-border-dark">
                                        <div className="flex items-center gap-2">
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                                            </span>
                                            <span className="text-sm font-bold text-yellow-500 uppercase tracking-wide">Aguardando Pagamento</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-text-secondary text-sm font-mono">
                                            <span className="material-symbols-outlined text-[18px]">timer</span>
                                            <span>Expira em <span className="text-white font-bold">{formatTime(timeLeft)}</span></span>
                                        </div>
                                    </div>

                                    {/* QR Code */}
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <h4 className="text-lg font-bold text-center">Escaneie o QR Code</h4>
                                        <div className="p-4 bg-white rounded-xl shadow-inner border-4 border-gray-200">
                                            <img
                                                src={pixInfo.qrCodeImg}
                                                alt="QR Code Pix"
                                                className="w-48 h-48 object-contain rounded-lg"
                                                onError={(e) => {
                                                    e.currentTarget.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixInfo.copiaECola)}`;
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Copia e Cola */}
                                    <div className="w-full flex flex-col gap-3">
                                        <label className="text-sm font-medium text-text-secondary text-center">Ou use o Pix Copia e Cola</label>
                                        <div className="flex gap-2">
                                            <input
                                                className="w-full h-12 pl-4 rounded-lg bg-background-dark border border-border-dark text-gray-300 text-sm font-mono truncate focus:ring-2 focus:ring-primary outline-none"
                                                readOnly
                                                type="text"
                                                value={pixInfo.copiaECola}
                                            />
                                            <button
                                                onClick={handleCopyPix}
                                                className="h-12 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg px-4 flex items-center gap-2 transition-all shadow-lg shrink-0 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">{copied ? 'done' : 'content_copy'}</span>
                                                <span className="hidden sm:inline">Copiar</span>
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-500 text-center">Favorecido: Bruno Adriano Costa Reis • Chave Pix: {CHAVE_PIX_REAL}</p>
                                    </div>

                                    <div className="h-px bg-border-dark/50 w-full my-2"></div>

                                    {/* Uploader de Comprovante */}
                                    <div className="w-full">
                                        <label className="text-sm font-medium text-text-secondary text-left mb-2 block">Upload do Comprovante (Obrigatório)</label>
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            hidden
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                        />
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                                comprovante
                                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                                    : 'border-border-dark hover:border-primary/50 bg-background-dark/50 hover:bg-background-dark'
                                            }`}
                                        >
                                            {comprovante ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-2xl">file_present</span>
                                                    <span className="text-sm font-bold truncate max-w-[300px]">{comprovante.name}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-4xl text-gray-400 mb-1">upload_file</span>
                                                    <p className="text-sm font-bold text-white uppercase tracking-wider">Anexar Comprovante Pix</p>
                                                    <p className="text-xs text-slate-500 mt-1">Clique para selecionar imagem ou PDF</p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleConfirmPix}
                                        disabled={loading || !comprovante}
                                        className="w-full py-4 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        {loading ? (
                                            <span className="material-symbols-outlined animate-spin">refresh</span>
                                        ) : (
                                            "Confirmar e Concluir Pagamento"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Checkout;