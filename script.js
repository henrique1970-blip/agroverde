document.getElementById('dataForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Impede o envio padrão do formulário

    const nome = document.getElementById('nome').value;
    const dataNascimento = document.getElementById('dataNascimento').value;
    const telefone = document.getElementById('telefone').value;
    const messageElement = document.getElementById('message');

    // URL do seu Apps Script implantado como aplicativo da web
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbzQrCQR9hBR4zGMCylDKFoIXtxSh6oL8PYv198mMD7rFIYiw1wSiWqxNlI2rm4-bkNM/exec'; // <-- COLOQUE SEU URL AQUI!

    // Dados a serem enviados
    const data = {
        nome: nome,
        dataNascimento: dataNascimento,
        telefone: telefone
    };

    // Enviar os dados usando fetch
    fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors', // Necessário para evitar erros CORS com Apps Script
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(data).toString()
    })
    .then(response => {
        // Como usamos 'no-cors', a resposta será opaca. Não podemos ler o corpo da resposta.
        // Apenas confirmamos que a requisição foi feita.
        messageElement.textContent = 'Dados enviados com sucesso! ✅';
        document.getElementById('dataForm').reset(); // Limpa o formulário
    })
    .catch(error => {
        console.error('Erro ao enviar os dados:', error);
        messageElement.textContent = 'Erro ao enviar os dados. Tente novamente. ❌';
    });
});