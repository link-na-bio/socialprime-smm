// Test script to verify dynamic keyword profit margin rules and parsing

const keywordRules = [
    { keywords: 'visualizações, views, impressões', margin: 500 },
    { keywords: 'curtidas, likes, compartilhamentos, shares, reactions', margin: 300 },
    { keywords: 'membros, telegram, global', margin: 150 },
    { keywords: 'seguidores brasileiros, seguidores brasil, BR', margin: 140 }
];

const globalMargin = 200;

function calculateDynamicMargin(name, keywordRules, globalMargin) {
    const nameLower = name.toLowerCase();

    // Encontra a primeira regra que bate com o nome do serviço
    const matchingRule = keywordRules.find(rule => {
        if (!rule.keywords) return false;
        // Divide as palavras-chave por vírgula, limpa os espaços e filtra vazios
        const keywordsList = rule.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
        return keywordsList.some(keyword => nameLower.includes(keyword));
    });

    if (matchingRule) {
        return matchingRule.margin;
    }

    return globalMargin;
}

const tests = [
    { name: 'Instagram - Curtidas Brasileiras', expected: 300 }, // Matches 'curtidas' in rule 2
    { name: 'TikTok - Views no Vídeo', expected: 500 }, // Matches 'views' in rule 1
    { name: 'Seguidores Brasileiros Reais', expected: 140 }, // Matches 'seguidores brasileiros' in rule 4
    { name: 'Instagram - Seguidores Mundiais', expected: 200 }, // Fallback to global margin (no match)
    { name: 'Telegram Membros Ativos', expected: 150 }, // Matches 'membros' or 'telegram' in rule 3
    { name: 'YouTube Views Rápidas', expected: 500 }, // Matches 'views' in rule 1
    { name: 'Comentários Premium', expected: 200 } // Fallback to global margin (no match)
];

console.log("Running pricing logic validation tests...");
let passCount = 0;

for (const t of tests) {
    const got = calculateDynamicMargin(t.name, keywordRules, globalMargin);
    const passed = got === t.expected;
    if (passed) passCount++;
    console.log(`- Service: "${t.name}" => Expected Margin: ${t.expected}%, Got: ${got}% - ${passed ? '✅ PASSED' : '❌ FAILED'}`);
}

console.log(`\nTest results: ${passCount}/${tests.length} tests passed.`);
if (passCount === tests.length) {
    console.log("SUCCESS: Dynamic keyword rule pricing calculation works flawlessly!");
} else {
    console.log("FAILURE: Some test cases failed.");
    process.exit(1);
}
