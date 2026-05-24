import fs from 'fs';
import path from 'path';

const dumpFilePath = 'f:\\SITES GITHUB\\socialprime\\dump_servicos.txt';
const outputFilePath = 'f:\\SITES GITHUB\\socialprime\\servicos_com_margens_dinamicas.md';

/**
 * Calculates the dynamic profit margin percentage for a service based on its name and cost.
 */
function calculateDynamicMargin(name, cost) {
    const nameLower = name.toLowerCase();

    // Regra 5: Custo superior a R$ 100,00 -> Margem fixa de proteção de 60%
    if (cost > 100.00) {
        return { margin: 60, rule: 'Custo > R$ 100 (Proteção 60%)' };
    }

    // Regra 1: Visualizações, Views ou Impressões -> 500%
    if (
        nameLower.includes('visualizações') || 
        nameLower.includes('visualizacoes') || 
        nameLower.includes('views') || 
        nameLower.includes('impressões') || 
        nameLower.includes('impressoes')
    ) {
        return { margin: 500, rule: 'Visualizações / Views / Impressões (500%)' };
    }

    // Regra 2: Curtidas, Likes, Compartilhamentos, Shares ou Reactions -> 300%
    if (
        nameLower.includes('curtidas') || 
        nameLower.includes('likes') || 
        nameLower.includes('compartilhamentos') || 
        nameLower.includes('shares') || 
        nameLower.includes('reactions')
    ) {
        return { margin: 300, rule: 'Curtidas / Likes / Compartilhamentos / Reactions (300%)' };
    }

    // Regra 3: Membros, Telegram ou Global (e NÃO for YouTube) -> 150%
    const isYoutube = nameLower.includes('youtube') || nameLower.includes('yt');
    if (
        !isYoutube && 
        (nameLower.includes('membros') || nameLower.includes('telegram') || nameLower.includes('global'))
    ) {
        return { margin: 150, rule: 'Membros / Telegram / Global [Não-YT] (150%)' };
    }

    // Regra 4: Seguidores Brasileiros, Seguidores Brasil ou BR -> 140%
    const hasBr = 
        nameLower.includes('seguidores brasileiros') || 
        nameLower.includes('seguidores brasil') || 
        nameLower.includes('brasil') || 
        nameLower.includes('brasileiro') || 
        nameLower.includes('🇧🇷') || 
        /\bbr\b/.test(nameLower);

    if (hasBr) {
        return { margin: 140, rule: 'Seguidores Brasileiros / Brasil / BR (140%)' };
    }

    // Fallback -> 100%
    return { margin: 100, rule: 'Fallback Padrão (100%)' };
}

function parseDump() {
    const content = fs.readFileSync(dumpFilePath, 'utf-8');
    const lines = content.split('\n');
    
    const services = [];
    let currentId = null;
    let currentName = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (/^\d+$/.test(line)) {
            currentId = parseInt(line);
            currentName = null;
            continue;
        }
        
        if (currentId && !currentName && line.length > 0 && !line.startsWith('R$')) {
            currentName = line;
            continue;
        }
        
        if (currentId && currentName && line.startsWith('R$')) {
            const parts = line.split('\t');
            const rateStr = parts[0] ? parts[0].trim() : 'R$ 0,00';
            const min = parts[1] ? parts[1].trim() : '10';
            const max = parts[2] ? parts[2].trim() : '1000';
            
            // Extrai o custo numérico
            // Formato: R$ 25,00 -> 25.00 | R$ 0,50 -> 0.50 | R$ 17000,00 -> 17000.00
            const costClean = rateStr.replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.');
            const cost = parseFloat(costClean) || 0;
            
            services.push({
                id: currentId,
                name: currentName,
                cost: cost,
                costStr: rateStr,
                min: min,
                max: max
            });
            
            currentId = null;
            currentName = null;
        }
    }
    
    return services;
}

function main() {
    console.log("Parsing dump file...");
    const rawServices = parseDump();
    
    const allowedKeywords = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter', 'Google'];
    const allowedKeywordsLower = allowedKeywords.map(k => k.toLowerCase());

    const services = rawServices.filter(s => {
        if (!s.name) return false;
        const nameLower = s.name.toLowerCase();
        return allowedKeywordsLower.some(keyword => nameLower.includes(keyword));
    });

    console.log(`Parsed ${rawServices.length} services, filtered to ${services.length} whitelisted services.`);

    // Cabeçalho Markdown
    let md = `# Relatório Comparativo - Precificação Dinâmica por Palavra-Chave\n\n`;
    md += `Este relatório apresenta a precificação final calculada pelo **Pricing Middleware** para cada serviço, baseado no nome e custo de API original.\n\n`;
    md += `| ID | Nome do Serviço | Custo Fornecedor (por 1k) | Regra Aplicada | Margem | Preço Final Cliente (por 1k) |\n`;
    md += `| :--- | :--- | :--- | :--- | :---: | :--- |\n`;

    for (const s of services) {
        const { margin, rule } = calculateDynamicMargin(s.name, s.cost);
        const finalPrice = s.cost * (1 + margin / 100);
        
        const costFormatted = `R$ ${s.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const finalFormatted = `R$ ${finalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        md += `| **${s.id}** | ${s.name} | ${costFormatted} | _${rule}_ | **${margin}%** | **${finalFormatted}** |\n`;
    }

    fs.writeFileSync(outputFilePath, md, 'utf-8');
    console.log(`Relatório de margens dinâmicas salvo com sucesso em: ${outputFilePath}`);
}

main();
