import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const CheckoutSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const amountParam = searchParams.get('amount') || '0';
    const txIdParam = searchParams.get('txId') || 'N/A';

    const amountValue = parseFloat(amountParam.replace(',', '.'));
    const amountFormatted = isNaN(amountValue) 
        ? 'R$ 0,00' 
        : amountValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="min-h-screen bg-background-dark flex flex-col font-sans text-white bg-[#0d1218] relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

            {/* Simple Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-card-dark/60 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-8 rounded-lg bg-primary/20 text-primary">
                        <span className="material-symbols-outlined">rocket_launch</span>
                    </div>
                    <h2 className="text-lg font-bold">SocialPrime</h2>
                </div>
            </header>

            <div className="flex-1 flex items-center justify-center py-12 px-4 z-10">
                <div className="w-full max-w-[600px] bg-card-dark/40 backdrop-blur-xl rounded-2xl border border-border-dark p-8 md:p-10 shadow-2xl relative overflow-hidden flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400"></div>

                    {/* Glowing Check Icon */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl scale-120 animate-pulse"></div>
                        <div className="relative size-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <span className="material-symbols-outlined text-5xl">check_circle</span>
                        </div>
                    </div>

                    <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight mb-3">
                        Comprovante Enviado!
                    </h1>
                    
                    <p className="text-text-secondary text-sm md:text-base max-w-md mb-8 leading-relaxed">
                        Recebemos o seu comprovante com sucesso. O setor financeiro está realizando a conferência da transação para creditar o seu saldo.
                    </p>

                    {/* Transaction Details Card */}
                    <div className="w-full bg-[#0a0f16]/80 rounded-xl border border-border-dark/60 p-6 mb-8 text-left space-y-4">
                        <div className="flex justify-between items-center pb-3 border-b border-border-dark/40">
                            <span className="text-text-secondary text-xs font-semibold uppercase tracking-wider">ID da Transação</span>
                            <span className="font-mono font-bold text-sm text-yellow-500 bg-yellow-500/10 px-2.5 py-0.5 rounded border border-yellow-500/20">
                                #{txIdParam}
                            </span>
                        </div>

                        <div className="flex justify-between items-center pb-3 border-b border-border-dark/40">
                            <span className="text-text-secondary text-xs font-semibold uppercase tracking-wider">Valor a creditar</span>
                            <span className="font-bold text-lg text-white">
                                {amountFormatted}
                            </span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-text-secondary text-xs font-semibold uppercase tracking-wider">Status do Pagamento</span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 uppercase tracking-widest animate-pulse">
                                <span className="size-1.5 rounded-full bg-yellow-500"></span>
                                Em Análise
                            </span>
                        </div>
                    </div>

                    {/* Instruction Box */}
                    <div className="w-full bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mb-8 flex gap-3 text-left">
                        <span className="material-symbols-outlined text-primary text-2xl shrink-0 mt-0.5">info</span>
                        <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">O que acontece agora?</h4>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                A conferência é realizada rapidamente de forma manual. Assim que aprovada, você receberá uma notificação em sua conta e o saldo de <strong className="text-white">{amountFormatted}</strong> estará disponível para você realizar novos pedidos instantaneamente!
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="w-full flex flex-col sm:flex-row gap-4">
                        <Link
                            to="/history"
                            className="flex-1 h-12 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-sm"
                        >
                            <span className="material-symbols-outlined text-[20px]">history</span>
                            Histórico de Saldos
                        </Link>
                        <Link
                            to="/dashboard"
                            className="flex-1 h-12 bg-card-dark border border-border-dark hover:bg-border-dark text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <span className="material-symbols-outlined text-[20px]">dashboard</span>
                            Ir para Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutSuccess;
