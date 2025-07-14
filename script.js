// Função para carregar o nome do usuário armazenado localmente
function loadUserName() {
    const savedUserName = localStorage.getItem('userName');
    if (savedUserName) {
        document.getElementById('userName').value = savedUserName;
    }
}

// Salva o nome do usuário ao digitar
document.getElementById('userName').addEventListener('input', (event) => {
    localStorage.setItem('userName', event.target.value);
});

// Função para exibir as seções do formulário com base na atividade selecionada
function showActivityFields() {
    const activity = document.getElementById('activity').value;
    const activitySections = document.querySelectorAll('.activity-fields');

    activitySections.forEach(section => {
        section.style.display = 'none'; // Esconde todas as seções de atividade
        // Remove 'required' de todos os campos para evitar validação de campos ocultos
        section.querySelectorAll('[required]').forEach(input => input.removeAttribute('required'));
    });

    const selectedActivitySection = document.getElementById(`fields-${activity}`);
    if (selectedActivitySection) {
        selectedActivitySection.style.display = 'block'; // Mostra a seção da atividade selecionada
        // Adiciona 'required' de volta aos campos da seção visível
        selectedActivitySection.querySelectorAll('[data-original-required]').forEach(input => {
            input.setAttribute('required', 'true');
        });
    }

    calculateTotalArea(); // Recalcula a área ao mudar a atividade (pode mudar talhões selecionados)
}

// Adiciona um listener para a mudança de atividade
document.getElementById('activity').addEventListener('change', showActivityFields);


// --- Funções para Talhões e Cálculo de Área ---

const talhoesData = {
    "Setor 1": {
        "Talhão 1A": 50,
        "Talhão 1B": 75,
        "Talhão 1C": 60
    },
    "Setor 2": {
        "Talhão 2A": 120,
        "Talhão 2B": 90
    },
    "Setor 3": {
        "Talhão 3A": 80,
        "Talhão 3B": 110,
        "Talhão 3C": 45
    }
};

function populateLocais() {
    const localSelect = document.getElementById('local');
    // Limpa opções existentes
    localSelect.innerHTML = '<option value="">Selecione o Local</option>';
    for (const local in talhoesData) {
        const option = document.createElement('option');
        option.value = local;
        option.textContent = local;
        localSelect.appendChild(option);
    }
}

function populateTalhoes() {
    const localSelect = document.getElementById('local');
    const talhaoSelect = document.getElementById('talhoes');
    const selectedLocal = localSelect.value;

    talhaoSelect.innerHTML = ''; // Limpa opções existentes

    if (selectedLocal && talhoesData[selectedLocal]) {
        for (const talhao in talhoesData[selectedLocal]) {
            const option = document.createElement('option');
            option.value = talhao;
            option.textContent = `${talhao} (${talhoesData[selectedLocal][talhao]} ha)`;
            talhaoSelect.appendChild(option);
        }
    }
    calculateTotalArea(); // Recalcula a área ao mudar os talhões
}

function calculateTotalArea() {
    const talhaoSelect = document.getElementById('talhoes');
    const selectedLocal = document.getElementById('local').value;
    const totalAreaDisplay = document.getElementById('totalAreaDisplay');
    let totalArea = 0;
    let selectedTalhoesNames = [];

    if (selectedLocal && talhoesData[selectedLocal]) {
        Array.from(talhaoSelect.selectedOptions).forEach(option => {
            const talhaoName = option.value;
            if (talhoesData[selectedLocal][talhaoName]) {
                totalArea += talhoesData[selectedLocal][talhaoName];
                selectedTalhoesNames.push(talhaoName);
            }
        });
    }

    totalAreaDisplay.textContent = `Área Total Selecionada: ${totalArea.toFixed(2)} ha`;
    document.getElementById('selectedTalhoesSummary').value = selectedTalhoesNames.join(', '); // Atualiza o campo oculto para o Apps Script
}

// Adiciona listeners para local e talhões
document.getElementById('local').addEventListener('change', populateTalhoes);
document.getElementById('talhoes').addEventListener('change', calculateTotalArea);


// --- Funções para Adicionar/Remover Produtos/Insumos (Listas Dinâmicas) ---

// Função genérica para adicionar item (produto/insumo)
function addDynamicItem(containerId, inputPrefix) {
    const container = document.getElementById(containerId);
    const itemCount = container.children.length; // Conta itens já existentes

    // Limite de 5 itens para o PDF
    if (itemCount >= 5) {
        alert('Máximo de 5 itens por lista.');
        return;
    }

    const newItemDiv = document.createElement('div');
    newItemDiv.className = 'dynamic-item';
    newItemDiv.innerHTML = `
        <input type="text" placeholder="${inputPrefix} Nome" class="${inputPrefix}-name" required>
        <input type="text" placeholder="Dosagem" class="${inputPrefix}-dosagem" required>
        <button type="button" onclick="removeDynamicItem(this)">Remover</button>
    `;
    container.appendChild(newItemDiv);
}

// Função genérica para remover item (produto/insumo)
function removeDynamicItem(buttonElement) {
    buttonElement.parentElement.remove();
}

// Listeners para os botões de adicionar
document.getElementById('addProdutoTratamentoBtn').addEventListener('click', () => addDynamicItem('produtosTratamentoContainer', 'produto'));
document.getElementById('addInsumoPlantioBtn').addEventListener('click', () => addDynamicItem('insumosPlantioContainer', 'insumo'));
document.getElementById('addProdutoPulverizacaoBtn').addEventListener('click', () => addDynamicItem('produtosPulverizacaoContainer', 'produto'));
document.getElementById('addProdutoLancasBtn').addEventListener('click', () => addDynamicItem('produtosLancasContainer', 'produto'));


// --- Lógica de Submissão do Formulário ---

async function submitForm(event) {
    event.preventDefault(); // Previne o comportamento padrão de submissão do formulário

    const form = document.getElementById('osForm');
    const formMessageElement = document.getElementById('formMessage');
    formMessageElement.textContent = 'Enviando dados...';
    formMessageElement.className = 'message loading'; // Estilo para mensagem de carregamento

    // --- Captura de dados comuns a todas as OS ---
    const activity = document.getElementById('activity').value;
    const userName = document.getElementById('userName').value;
    const local = document.getElementById('local').value;
    const talhoes = document.getElementById('selectedTalhoesSummary').value; // Talhões selecionados como string
    const observacao = document.getElementById('observacao').value;
    
    // NOVO: Captura a área total do campo de exibição
    const totalAreaDisplay = document.getElementById('totalAreaDisplay').textContent.replace('Área Total Selecionada: ', '').replace(' ha', '');


    // Objeto base com dados comuns
    const data = {
        activity: activity,
        userName: userName,
        local: local,
        talhoes: talhoes,
        totalArea: totalAreaDisplay, // <-- NOVO: Adicionado para ser enviado ao Apps Script
        observacao: observacao
    };

    // --- Captura de dados específicos da atividade ---
    if (activity === 'Preparo de Area') {
        data.maquina = document.getElementById('pa_maquina').value;
        data.operadores = document.getElementById('pa_operadores').value;
        data.implemento = document.getElementById('pa_implemento').value;
    } else if (activity === 'Tratamento de Sementes') {
        data.culturaCultivar = document.getElementById('ts_culturaCultivar').value;
        data.qtdSementesKg = document.getElementById('ts_qtdSementesKg').value;
        data.dataInicio = document.getElementById('ts_dataInicio').value;
        data.dataTermino = document.getElementById('ts_dataTermino').value;
        const produtosTratamento = Array.from(document.querySelectorAll('#produtosTratamentoContainer .dynamic-item')).map(item => ({
            produto: item.querySelector('.produto-name').value,
            dosagem: item.querySelector('.produto-dosagem').value
        }));
        data.produtosDosagens = produtosTratamento.map(p => `${p.produto}: ${p.dosagem}`).join(', '); // Formato "Produto: Dosagem, Produto2: Dosagem2"
        data.maquina = document.getElementById('ts_maquina').value;
        data.operadores = document.getElementById('ts_operadores').value;
    } else if (activity === 'Plantio') {
        data.culturaCultivar = document.getElementById('p_culturaCultivar').value;
        data.qtdHaMax = document.getElementById('p_qtdHaMax').value;
        data.qtdHaMin = document.getElementById('p_qtdHaMin').value;
        const insumosPlantio = Array.from(document.querySelectorAll('#insumosPlantioContainer .dynamic-item')).map(item => ({
            insumo: item.querySelector('.insumo-name').value,
            dosagem: item.querySelector('.insumo-dosagem').value
        }));
        data.insumos = insumosPlantio.map(i => `${i.insumo}: ${i.dosagem}`).join(', ');
        data.dataInicio = document.getElementById('p_dataInicio').value;
        data.dataTermino = document.getElementById('p_dataTermino').value;
        data.trator = document.getElementById('p_trator').value;
        data.implemento = document.getElementById('p_implemento').value;
        data.plantasPorMetro = document.getElementById('p_plantasPorMetro').value;
        data.espacamentoPlantas = document.getElementById('p_espacamentoPlantas').value;
        data.pms = document.getElementById('p_pms').value;
        data.operadores = document.getElementById('p_operadores').value;
    } else if (activity === 'Pulverizacao') {
        data.culturaCultivar = document.getElementById('pv_culturaCultivar').value;
        const produtosPulverizacao = Array.from(document.querySelectorAll('#produtosPulverizacaoContainer .dynamic-item')).map(item => ({
            produto: item.querySelector('.produto-name').value,
            dosagem: item.querySelector('.produto-dosagem').value
        }));
        data.produtosQtdHa = produtosPulverizacao.map(p => `${p.produto}: ${p.dosagem}`).join(', ');
        data.dataInicio = document.getElementById('pv_dataInicio').value;
        data.dataTermino = document.getElementById('pv_dataTermino').value;
        data.maquina = document.getElementById('pv_maquina').value;
        data.bico = document.getElementById('pv_bico').value;
        data.capacidadeTanque = document.getElementById('pv_capacidadeTanque').value;
        data.vazaoLHa = document.getElementById('pv_vazaoLHa').value;
        data.operadores = document.getElementById('pv_operadores').value;
        data.pressao = document.getElementById('pv_pressao').value;
        data.doseHa = document.getElementById('pv_doseHa').value;
        data.doseTanque = document.getElementById('pv_doseTanque').value;
        data.implemento = document.getElementById('pv_implemento').value;
    } else if (activity === 'Colheita') {
        data.culturaCultivar = document.getElementById('c_culturaCultivar').value;
        data.produtividadeEstimada = document.getElementById('c_produtividadeEstimada').value;
        data.dataInicio = document.getElementById('c_dataInicio').value;
        data.dataTermino = document.getElementById('c_dataTermino').value;
        data.maquina = document.getElementById('c_maquina').value;
        data.operadoresMaquina = document.getElementById('c_operadoresMaquina').value;
        data.caminhao = document.getElementById('c_caminhao').value;
        data.motoristas = document.getElementById('c_motoristas').value;
        data.trator = document.getElementById('c_trator').value;
        data.operadoresTrator = document.getElementById('c_operadoresTrator').value;
        data.implemento = document.getElementById('c_implemento').value;
    } else if (activity === 'Lanças') {
        data.culturaCultivar = document.getElementById('l_culturaCultivar').value;
        const produtosLancas = Array.from(document.querySelectorAll('#produtosLancasContainer .dynamic-item')).map(item => ({
            produto: item.querySelector('.produto-name').value,
            dosagem: item.querySelector('.produto-dosagem').value
        }));
        data.produtosQtdHa = produtosLancas.map(p => `${p.produto}: ${p.dosagem}`).join(', ');
        data.dataInicio = document.getElementById('l_dataInicio').value;
        data.dataTermino = document.getElementById('l_dataTermino').value;
        data.maquina = document.getElementById('l_maquina').value;
        data.operadores = document.getElementById('l_operadores').value;
        data.implemento = document.getElementById('l_implemento').value;
    }

    // URL de implantação do seu Apps Script
    // IMPORTANTE: SUBSTITUA ESTE VALOR PELA URL DA SUA IMPLANTAÇÃO DO APPS SCRIPT
    const url = 'https://script.google.com/macros/s/AKfycbxbTT_yp28Bi6GCRtMBcS1FwqC79efimp88mDY02pV_c1j_cEmKw9qnsG0MuwLYuFq2pQ/exec'; // <-- ATUALIZE ESTA URL

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: new URLSearchParams(data), // Envia os dados como application/x-www-form-urlencoded
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.ok) {
            const result = await response.json(); // <-- ALTERADO: Agora espera JSON
            if (result.success) {
                // ALTERADO: Exibe o OS ID e o link do PDF
                formMessageElement.innerHTML = `Ordem de Serviço **${result.osId.substring(0, 8)}** salva com sucesso! <br> PDF gerado: <a href="${result.pdfLink}" target="_blank">Abrir PDF da OS</a>`;
                formMessageElement.className = 'message success';
                resetForm(); // Limpa o formulário após o sucesso
            } else {
                formMessageElement.textContent = `Erro: ${result.message}`;
                formMessageElement.className = 'message error';
            }
        } else {
            formMessageElement.textContent = `Erro ao enviar dados: ${response.statusText}`;
            formMessageElement.className = 'message error';
        }
    } catch (error) {
        formMessageElement.textContent = `Erro de conexão: ${error.message}`;
        formMessageElement.className = 'message error';
        console.error('Erro na requisição:', error);
    }
}

// Listener para o evento de submissão do formulário
document.getElementById('osForm').addEventListener('submit', submitForm);

// Função para resetar o formulário
function resetForm() {
    document.getElementById('osForm').reset();
    showActivityFields(); // Esconde campos específicos novamente
    calculateTotalArea(); // Reseta a área total
    // Limpar listas dinâmicas
    document.querySelectorAll('.dynamic-items-container').forEach(container => {
        container.innerHTML = ''; // Remove todos os itens
    });
}

// Inicializa a página ao carregar
document.addEventListener('DOMContentLoaded', () => {
    loadUserName();
    populateLocais();
    populateTalhoes(); // Chamar para garantir que os talhões são carregados e a área calculada inicialmente
    showActivityFields(); // Esconde todas as seções no início
});