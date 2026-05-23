import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ============================================================================
// 🚨 INTERRUPTOR DO MODO DE TESTE 🚨
// ============================================================================
const MODO_TESTE = false; // true = Simula | false = Real
// ============================================================================

interface Service {
  service_id: number;
  name: string;
  category: string;
  rate: number; // Preço de Custo (Baixo)
  min: number;
  max: number;
  type: string;
  description?: string;
  custom_margin?: number | null;
}

const NewOrder: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Margem Padrão (Começa em 200% para garantir lucro mesmo se falhar a busca)
  const [globalMargin, setGlobalMargin] = useState<number>(200);
  const [categoryMargins, setCategoryMargins] = useState<{ category: string; margin: number }[]>([]);

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1000);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [link, setLink] = useState('');

  const location = useLocation();
  const navigate = useNavigate();

  // 1. Busca Saldo e Configuração
  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', user.id)
          .single();
        if (profile) setUserBalance(profile.balance);
      }

      // Busca Margem Global e por Categoria
      const { data: config } = await supabase
        .from('admin_config')
        .select('margin_percent, category_margins')
        .single();

      if (config) {
        setGlobalMargin(config.margin_percent);
        try {
          const parsed = Array.isArray(config.category_margins)
            ? config.category_margins
            : JSON.parse(config.category_margins || '[]');
          setCategoryMargins(parsed);
        } catch (e) {
          setCategoryMargins([]);
        }
      }
    };
    fetchInitialData();
  }, []);

  // 2. Busca Serviços
  useEffect(() => {
    const fetchServices = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('services').select('*');

      if (!error && data) {
        setServices(data);
        // CORRIGIDO AQUI: Removido o parêntese extra que estava quebrando o código
        const uniqueCategories = Array.from(new Set(data.map((s: Service) => s.category)));
        setCategories(uniqueCategories);

        const params = new URLSearchParams(location.search);
        const categoryParam = params.get('category');
        if (categoryParam) {
          const match = uniqueCategories.find(c => c.toLowerCase().includes(categoryParam.toLowerCase()));
          if (match) setSelectedCategory(match);
        }
      }
      setLoading(false);
    };

    fetchServices();
  }, [location.search]);

  const selectedService = services.find(s => s.service_id.toString() === selectedServiceId);

  // ==========================================================================
  // 💰 CALCULADORA DE PREÇO REAL
  // ==========================================================================
  const getFinalPricePer1k = (service: Service | undefined) => {
    if (!service) return 0;
 
    // Define qual margem usar (Personalizada, Categoria ou Global)
    let marginToUse = globalMargin;
    if (service.custom_margin !== null && service.custom_margin !== undefined) {
      marginToUse = service.custom_margin;
    } else if (service.category && categoryMargins.length > 0) {
      // Correspondência textual flexível (case-insensitive substring)
      const matchingMargin = categoryMargins.find((item) =>
        item && item.category && service.category.toLowerCase().includes(item.category.toLowerCase().trim())
      );
      if (matchingMargin) {
        marginToUse = matchingMargin.margin;
      }
    }
 
    // Custo * (1 + Margem/100). Ex: 0.50 * (1 + 2) = 1.50
    return service.rate * (1 + marginToUse / 100);
  };

  const finalRate = getFinalPricePer1k(selectedService);
  const total = selectedService ? (quantity / 1000) * finalRate : 0;

  const filteredServices = services.filter(s => {
    return selectedCategory ? s.category === selectedCategory : true;
  });

  const handleCreateOrder = async () => {
    if (!selectedService || !link || !quantity) return alert('Preencha todos os campos!');

    // Validação de Limites Mínimo e Máximo do Serviço
    if (selectedService.min && quantity < selectedService.min) {
      return alert(`Quantidade mínima permitida para este serviço é: ${selectedService.min}`);
    }
    if (selectedService.max && quantity > selectedService.max) {
      return alert(`Quantidade máxima permitida para este serviço é: ${selectedService.max}`);
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não logado');

      // Nome salvo com ID para facilitar suporte
      const nomeParaSalvar = `${selectedService.service_id} - ${selectedService.name}`;

      let externalOrderId = null;

      if (MODO_TESTE) {
        await new Promise(r => setTimeout(r, 800));
        externalOrderId = 888000 + Math.floor(Math.random() * 1000);
      } else {
        const { data: apiResponse, error } = await supabase.functions.invoke('place-order', {
          body: { service: selectedService.service_id, link, quantity }
        });
        
        if (error) {
          let errorMessage = error.message;
          try {
            if ('context' in error && (error as any).context) {
              const context = (error as any).context;
              if (typeof context.json === 'function') {
                const body = await context.json();
                if (body && body.error) errorMessage = body.error;
              } else if (typeof context.text === 'function') {
                const text = await context.text();
                if (text) errorMessage = text;
              }
            }
          } catch (e) {
            console.error("Erro ao extrair corpo de erro da Edge Function:", e);
          }
          throw new Error(errorMessage);
        }

        if (!apiResponse || apiResponse.error) {
          throw new Error(apiResponse?.error || 'Erro na API do fornecedor.');
        }
        externalOrderId = apiResponse.order;
      }

      alert(MODO_TESTE ? 'PEDIDO TESTE REALIZADO!' : 'Pedido realizado com sucesso!');
      setLink('');
      setQuantity(1000);

    } catch (error: any) {
      console.error(error);
      alert('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full pb-32">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-white mb-2">Novo Pedido</h2>
        <p className="text-text-secondary">Impulsione suas redes agora.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Esquerda */}
        <div className="lg:col-span-8 bg-card-dark rounded-xl border border-border-dark p-6">

          {/* Categoria */}
          <div className="mb-6">
            <label className="text-white text-sm font-bold mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">category</span> Categoria
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-[#111a22] border border-slate-700 text-white p-3 rounded-lg pr-10"
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value); setSelectedServiceId(''); }}
              >
                <option value="" disabled>Selecione...</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-secondary">
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>

          {/* Serviço */}
          <div className="mb-6">
            <label className="text-white text-sm font-bold mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">design_services</span> Serviço
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-[#111a22] border border-slate-700 text-white p-3 rounded-lg pr-10 disabled:opacity-50"
                value={selectedServiceId}
                onChange={e => setSelectedServiceId(e.target.value)}
                disabled={!selectedCategory}
              >
                <option value="" disabled>
                  {filteredServices.length === 0 ? "Nenhum serviço disponível" : "Escolha o serviço..."}
                </option>
                {filteredServices.map(service => {
                  // CÁLCULO VISUAL DO PREÇO
                  const price = getFinalPricePer1k(service);
                  return (
                    <option key={service.service_id} value={service.service_id}>
                      {service.service_id} - {service.name} - R$ {price.toFixed(2)}/k
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-secondary">
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>

          {/* Link e Quantidade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-white text-sm font-bold mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">link</span> Link
              </label>
              <input
                type="url"
                className="w-full bg-[#111a22] border border-slate-700 text-white p-3 rounded-lg"
                placeholder="https://..."
                value={link}
                onChange={e => setLink(e.target.value)}
              />
            </div>
            <div>
              <label className="text-white text-sm font-bold mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">numbers</span> Quantidade
              </label>
              <input
                type="number"
                className="w-full bg-[#111a22] border border-slate-700 text-white p-3 rounded-lg"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
              />
              <div className="text-xs text-slate-500 mt-1 flex justify-between px-1">
                <span>Mín: {selectedService?.min || 100}</span>
                <span>Max: {selectedService?.max || '∞'}</span>
              </div>
            </div>
          </div>

          {/* Info Box COM DESCRIÇÃO RESTAURADA */}
          {selectedService && (
            <div className="mt-6 bg-[#137fec]/10 border border-primary/20 rounded-lg p-4 flex gap-4 items-start">
              <span className="material-symbols-outlined text-primary mt-0.5">info</span>
              <div className="text-sm text-text-secondary space-y-1 w-full">
                <p className="text-white font-medium mb-2">Detalhes do Serviço (ID: {selectedService.service_id})</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mb-4 border-b border-primary/20 pb-3">
                  <li>Min/Max: <span className="text-white">{selectedService.min} / {selectedService.max}</span></li>
                  <li>Tipo: <span className="text-white">{selectedService.type}</span></li>
                </ul>

                {/* AQUI ESTÁ A MÁGICA DAS DESCRIÇÕES */}
                <div className="mt-2">
                  {selectedService.description && selectedService.description.length > 5 ? (
                    <div
                      className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedService.description }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      Descrição não fornecida pelo operador para este serviço.
                    </p>
                  )}
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Direita: Resumo */}
        <div className="lg:col-span-4 relative">
          <div className="sticky top-6 bg-card-dark rounded-xl border border-border-dark p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-dark">
              <h3 className="text-lg font-bold text-white">Resumo</h3>
              <span className="material-symbols-outlined text-text-secondary">receipt_long</span>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-start gap-4">
                <span className="text-sm text-slate-400">Serviço:</span>
                <span className="text-sm text-white font-medium text-right w-40 truncate">
                  {selectedService ? `${selectedService.service_id} - ${selectedService.name}` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Preço por 1k:</span>
                <span className="text-white font-medium">
                  {selectedService ? `R$ ${finalRate.toFixed(2)}` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Quantidade:</span>
                <span className="text-white font-medium">{quantity}</span>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-4">
              <div className="flex justify-between items-end mb-1">
                <span className="text-slate-300">Total</span>
                <span className="text-3xl font-black text-primary">
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-right text-xs text-slate-500 mb-6">
                Saldo: R$ {userBalance?.toFixed(2) || '0.00'}
              </p>

              <button
                onClick={handleCreateOrder}
                disabled={!selectedService || total === 0 || loading || (userBalance !== null && userBalance < total)}
                className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Processando...' : 'Finalizar Pedido'}
                {!loading && <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewOrder;