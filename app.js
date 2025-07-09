const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzeCN-WZ4Y4B86rNzGNwGXgF1-0YiovM66XwzMRkr6b1wxxetC7IHSTZy3-QNjxh2JE/exec';

window.addEventListener('load', () => {
  const form = document.getElementById('personForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      nome: form.nome.value.trim(),
      nascimento: form.nascimento.value,
      telefone: form.telefone.value.trim()
    };
    console.log('Enviando:', payload);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      alert('Salvo na planilha!');
    } catch (err) {
      console.error('Falhou:', err);
      alert('Falha ao enviar — veja Console.');
    }
  });
});