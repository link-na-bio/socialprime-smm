import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const HomeLanding: React.FC = () => {
    // --- LÓGICA DE SESSÃO E REGISTRO ---
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState<any>(null);
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => subscription.unsubscribe();
    }, []);

    // --- LÓGICA DE ANIMAÇÃO AO ROLAR (SCROLL REVEAL) ---
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.1 });

        setTimeout(() => {
            document.querySelectorAll('.reveal, .reveal-left').forEach(el => observer.observe(el));
        }, 100);

        return () => observer.disconnect();
    }, []);

    // --- FUNÇÃO DE ROLAGEM SUAVE ---
    const scrollToSection = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            const headerOffset = 100;
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            alert('As senhas não coincidem!');
            return;
        }
        setLoading(true);
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: { data: { full_name: formData.fullName } }
            });
            if (authError) throw authError;
            if (authData.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([{ id: authData.user.id, full_name: formData.fullName, email: formData.email, balance: 0.00 }]);

                if (profileError && profileError.code !== '23505') throw profileError;
                alert('Conta criada com sucesso! Redirecionando...');
                navigate('/dashboard');
            }
        } catch (error: any) {
            alert('Atenção: ' + (error.message || 'Erro ao criar conta.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#05000a] text-white overflow-x-hidden font-sans selection:bg-fuchsia-500/30 selection:text-fuchsia-300 relative">

            {/* --- ESTILOS DE ANIMAÇÃO --- */}
            <style>{`
                .reveal {
                    opacity: 0;
                    transform: translateY(50px);
                    transition: all 1s cubic-bezier(0.5, 0, 0, 1);
                }
                .reveal.active {
                    opacity: 1;
                    transform: translateY(0);
                }
                .reveal-left {
                    opacity: 0;
                    transform: translateX(-50px);
                    transition: all 1s cubic-bezier(0.5, 0, 0, 1);
                }
                .reveal-left.active {
                    opacity: 1;
                    transform: translateX(0);
                }
                .delay-100 { transition-delay: 0.1s; }
                .delay-200 { transition-delay: 0.2s; }
                .delay-300 { transition-delay: 0.3s; }
                
                @keyframes float {
                    0% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(5deg); }
                    100% { transform: translateY(0px) rotate(0deg); }
                }
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                @keyframes float-slow {
                    0% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-10px) rotate(-5deg); }
                    100% { transform: translateY(0px) rotate(0deg); }
                }
                .animate-float-slow {
                    animation: float-slow 8s ease-in-out infinite;
                }
            `}</style>

            {/* --- BACKGROUND GALÁCTICO --- */}
            <div className="fixed inset-0 pointer-events-none z-0">
                {/* Imagem de Fundo (Galáxia) */}
                <div className="absolute inset-0 bg-[url('/bg-galaxy.jpg')] bg-cover bg-center bg-no-repeat opacity-60"></div>

                {/* Overlay Gradiente para suavizar */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#05000a]/80 via-transparent to-[#05000a]/90"></div>

                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04]"></div>
            </div>

            {/* --- NAVBAR --- */}
            <nav className="fixed top-0 left-0 w-full z-50 bg-[#05000a]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl transition-all">
                <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 md:h-24 flex justify-between items-center relative z-50">
                    <div className="flex items-center gap-2">
                        <img
                            src="/logo.png"
                            alt="SocialPrime"
                            className="h-10 md:h-20 w-auto object-contain transition-transform hover:scale-105 filter drop-shadow-[0_0_20px_rgba(192,38,211,0.3)]"
                        />
                    </div>
                    <div className="flex items-center gap-3 md:gap-8">
                        <a
                            href="#metodo"
                            onClick={(e) => scrollToSection(e, 'metodo')}
                            className="text-xs md:text-sm font-bold text-slate-300 hover:text-white transition-colors uppercase tracking-wider cursor-pointer whitespace-nowrap"
                        >
                            Como funciona
                        </a>
                        {session ? (
                            <Link to="/dashboard" className="px-4 py-2 md:px-6 md:py-3 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white text-xs md:text-sm font-bold transition-all shadow-lg shadow-fuchsia-500/25 flex items-center gap-2 transform hover:-translate-y-0.5 whitespace-nowrap ring-1 ring-white/20">
                                <span className="material-symbols-outlined text-[16px] md:text-[20px]">dashboard</span>
                                <span className="hidden md:inline">Acessar Painel</span>
                                <span className="md:hidden">Painel</span>
                            </Link>
                        ) : (
                            <Link to="/login" className="px-4 py-2 md:px-8 md:py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white text-xs md:text-sm font-bold transition-all whitespace-nowrap backdrop-blur-sm">
                                Login
                            </Link>
                        )}
                    </div>
                </div>
            </nav>

            {/* --- HERO SECTION --- */}
            <header className="relative pt-40 pb-20 lg:pt-48 lg:pb-32 px-6 overflow-hidden z-10">
                <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-16 items-center relative">

                    {/* ASTRONAUTA FLUTUANTE (Decoração) */}
                    <img
                        src="/astronauta-01.png"
                        alt="Astronaut"
                        className="absolute -top-20 right-10 md:right-96 w-[300px] md:w-[500px] opacity-60 pointer-events-none mix-blend-screen animate-float-slow z-0"
                    />

                    {/* Texto Hero */}
                    <div className="lg:col-span-7 text-center lg:text-left space-y-8 relative reveal">
                        {/* Selo Brilhante */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-900/30 border border-purple-500/30 backdrop-blur-md text-fuchsia-300 text-xs font-bold uppercase tracking-widest animate-fade-in-up shadow-[0_0_20px_rgba(192,38,211,0.2)]">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-fuchsia-500"></span>
                            </span>
                            Uma Agência de Outra Galáxia
                        </div>

                        <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight text-white drop-shadow-2xl">
                            Pare de Postar para <br className="hidden md:block" />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 animate-gradient-x">Ninguém Ver.</span>
                        </h1>

                        <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto lg:mx-0 font-medium">
                            Acredite que cada marca é um planeta que precisa ser estrategicamente cuidado para crescer e se destacar no universo digital.
                            <strong className="text-white block mt-2 tracking-wide">Rápido. Seguro. Automático. Sem login em rede social.</strong>
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
                            <div className="flex items-center gap-3 px-5 py-4 bg-[#130821]/80 rounded-2xl border border-white/5 hover:border-fuchsia-500/50 transition-all shadow-xl hover:shadow-fuchsia-500/10 group backdrop-blur-sm">
                                <span className="material-symbols-outlined text-green-400 group-hover:scale-110 transition-transform">verified</span>
                                <div className="text-left">
                                    <p className="text-xs text-slate-400 font-bold uppercase">Entrega</p>
                                    <p className="text-sm font-bold text-white">Imediata</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 px-5 py-4 bg-[#130821]/80 rounded-2xl border border-white/5 hover:border-cyan-500/50 transition-all shadow-xl hover:shadow-cyan-500/10 group backdrop-blur-sm">
                                <span className="material-symbols-outlined text-cyan-400 group-hover:scale-110 transition-transform">lock</span>
                                <div className="text-left">
                                    <p className="text-xs text-slate-400 font-bold uppercase">Segurança</p>
                                    <p className="text-sm font-bold text-white">Sem Senha</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Formulário Glassmorphism (CARD FLUTUANTE REMOVIDO) */}
                    <div className="lg:col-span-5 relative z-20">
                        <div className="bg-gradient-to-b from-white/10 to-purple-900/20 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden group hover:border-white/20 transition-all">
                            {/* Borda de brilho superior */}
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent opacity-50"></div>

                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-black text-white">Crie sua Conta Grátis</h3>
                                <p className="text-slate-400 text-sm mt-2">Junte-se à plataforma premium de SMM.</p>
                            </div>

                            <form onSubmit={handleRegister} className="space-y-4">
                                <div className="group/input">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nome Completo</label>
                                    <input required type="text" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} className="w-full bg-[#05000a]/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none transition-all placeholder:text-slate-700" placeholder="Ex: Bruno Silva" />
                                </div>

                                <div className="group/input">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Seu E-mail</label>
                                    <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-[#05000a]/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none transition-all placeholder:text-slate-700" placeholder="Ex: bruno@email.com" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="group/input">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Senha</label>
                                        <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full bg-[#05000a]/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none transition-all placeholder:text-slate-700" placeholder="••••••" />
                                    </div>
                                    <div className="group/input">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Confirmar</label>
                                        <input required type="password" value={formData.confirmPassword} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} className="w-full bg-[#05000a]/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none transition-all placeholder:text-slate-700" placeholder="••••••" />
                                    </div>
                                </div>

                                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-purple-600/20 transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center gap-2 mt-6 relative overflow-hidden bg-[length:200%_auto] animate-gradient-x border border-white/10">
                                    {loading ? (
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    ) : (
                                        <>
                                            ACESSAR O PAINEL AGORA
                                            <span className="material-symbols-outlined font-bold">arrow_forward</span>
                                        </>
                                    )}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <p className="text-xs text-slate-500">
                                    Ao se registrar, você concorda com nossos termos.
                                    <br />Já tem conta? <Link to="/login" className="text-fuchsia-400 hover:text-fuchsia-300 font-bold underline decoration-fuchsia-500/30 underline-offset-4 transition-colors">Fazer Login</Link>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* --- STATS BAR --- */}
            <div className="border-y border-white/5 bg-[#130821]/50 backdrop-blur-sm relative z-10">
                <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
                    {[
                        { label: 'Pedidos Entregues', val: '+150 Mil' },
                        { label: 'Clientes Satisfeitos', val: '+3.500' },
                        { label: 'Serviços Ativos', val: '+500' },
                        { label: 'Suporte', val: '24 Horas' },
                    ].map((stat, i) => (
                        <div key={i} className={`py-10 text-center group cursor-default hover:bg-white/5 transition-colors reveal delay-${i}00`}>
                            <h4 className="text-2xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-purple-300 group-hover:to-white transition-colors">{stat.val}</h4>
                            <p className="text-xs font-bold text-fuchsia-500/80 uppercase tracking-widest mt-2">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- MÉTODO SEGURO --- */}
            <section id="metodo" className="py-24 relative border-b border-white/5 scroll-mt-24 z-10 overflow-hidden">
                {/* ASTRONAUTA 02 */}
                <img src="/astronauta-02.png" alt="Astronaut" className="absolute -left-10 md:left-10 top-10 w-[200px] md:w-[400px] opacity-50 mix-blend-screen pointer-events-none animate-float" />

                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16 reveal">
                        <span className="inline-block py-1 px-3 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-4 border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                            Segurança Blindada
                        </span>
                        <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
                            Cresça Sem <span className="text-red-500 line-through decoration-4 decoration-red-500/50 opacity-80">Arriscar</span> Sua Conta
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            Tecnologia de ponta que respeita as diretrizes das redes sociais.
                            <span className="text-white font-bold block mt-2">Sua privacidade é nossa prioridade absoluta.</span>
                        </p>
                    </div>

                    <div className="grid md:grid-cols-4 gap-6">
                        {[
                            { title: "1. Escolha", desc: "Navegue por nossos serviços e escolha o impulso ideal.", icon: "touch_app", color: "text-cyan-400", bg: "bg-cyan-500/10" },
                            { title: "2. Insira o Link", desc: "Cole o link do perfil. Nunca pedimos sua senha.", icon: "lock", color: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", special: true },
                            { title: "3. Pagamento", desc: "Pague via Pix com aprovação instantânea.", icon: "pix", color: "text-purple-400", bg: "bg-purple-500/10" },
                            { title: "4. Decolagem", desc: "O sistema entrega seu pedido automaticamente.", icon: "rocket_launch", color: "text-pink-400", bg: "bg-pink-500/10" }
                        ].map((card, i) => (
                            <div key={i} className={`bg-[#130821] p-8 rounded-2xl border ${card.border || 'border-white/5'} hover:border-opacity-100 hover:border-white/20 transition-all group relative overflow-hidden hover:-translate-y-2 duration-300 shadow-lg reveal delay-${i}00`}>
                                {card.special && <div className="absolute top-0 right-0 bg-fuchsia-500 text-[#05000a] text-[10px] font-bold px-2 py-1 rounded-bl-lg">ZERO RISCO</div>}
                                <div className={`w-14 h-14 ${card.bg} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform ${card.color}`}>
                                    <span className="material-symbols-outlined text-3xl">{card.icon}</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{card.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- COMPARAÇÃO --- */}
            <section className="py-24 px-6 bg-[#05000a] relative z-10">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16 reveal">
                        <h2 className="text-3xl md:text-5xl font-black text-white mb-4">A Verdade Sobre o <span className="text-fuchsia-500">Crescimento</span></h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            O algoritmo prioriza quem já tem números. Quebre esse ciclo.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Lado Ruim */}
                        <div className="bg-[#0f0505] border border-red-500/10 p-10 rounded-3xl relative overflow-hidden group hover:border-red-500/30 transition-all reveal-left">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><span className="material-symbols-outlined text-8xl text-red-500">close</span></div>
                            <h3 className="text-2xl font-bold text-red-400 mb-4">O Jeito Tradicional (Lento)</h3>
                            <ul className="space-y-4 text-slate-400">
                                <li className="flex items-start gap-3"><span className="material-symbols-outlined text-red-500 shrink-0">sentiment_dissatisfied</span> Postar todo dia e ter 10 likes.</li>
                                <li className="flex items-start gap-3"><span className="material-symbols-outlined text-red-500 shrink-0">timer</span> Esperar anos para resultados.</li>
                            </ul>
                        </div>

                        {/* Lado Bom */}
                        <div className="bg-[#130821] border border-fuchsia-500/20 p-10 rounded-3xl relative overflow-hidden shadow-2xl shadow-purple-900/10 group hover:border-fuchsia-500/50 transition-all reveal delay-200">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><span className="material-symbols-outlined text-8xl text-fuchsia-500">check</span></div>
                            <h3 className="text-2xl font-bold text-fuchsia-400 mb-4">O Jeito SocialPrime (Smart)</h3>
                            <ul className="space-y-4 text-slate-300">
                                <li className="flex items-start gap-3"><span className="material-symbols-outlined text-fuchsia-500 shrink-0">rocket_launch</span> Impulso inicial imediato.</li>
                                <li className="flex items-start gap-3"><span className="material-symbols-outlined text-fuchsia-500 shrink-0">trending_up</span> Prova social que atrai orgânicos.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- CTA FINAL --- */}
            <section className="py-32 text-center px-6 relative overflow-hidden z-10">
                {/* ASTRONAUTA 03 */}
                <img src="/astronauta-03.png" alt="Astronaut" className="absolute -bottom-0 right-20 md:right-32 w-[150px] md:w-[300px] opacity-50 mix-blend-screen pointer-events-none animate-float-slow rotate-12" />

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 blur-[150px] rounded-full -z-10"></div>
                <h2 className="text-4xl md:text-6xl font-black text-white mb-8 drop-shadow-xl reveal">Sua Autoridade Começa Agora.</h2>
                <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="bg-white text-black hover:bg-slate-200 font-black py-5 px-10 rounded-full text-xl shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all hover:scale-105 flex items-center gap-2 mx-auto reveal delay-200">
                    CRIAR CONTA GRÁTIS
                    <span className="material-symbols-outlined">arrow_upward</span>
                </button>
            </section>

            {/* --- FOOTER --- */}
            <footer className="py-10 border-t border-white/5 bg-[#05000a] text-center z-10 relative">
                <div className="flex items-center justify-center gap-2 mb-6 opacity-80 hover:opacity-100 transition-opacity">
                    <img src="/logo.png" alt="SocialPrime" className="h-16 filter drop-shadow-[0_0_10px_rgba(192,38,211,0.3)]" />
                </div>
                <div className="flex justify-center gap-6 mb-4 text-xs font-medium text-slate-500">
                    <Link to="/terms" className="hover:text-white transition-colors">Termos de Uso</Link>
                    <Link to="/privacy" className="hover:text-white transition-colors">Política de Privacidade</Link>
                </div>
                <p className="text-slate-600 text-sm">© 2026 SocialPrime. Todos os direitos reservados.</p>
            </footer>

        </div>
    );
};

export default HomeLanding;