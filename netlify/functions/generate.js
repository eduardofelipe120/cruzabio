// netlify/functions/generate.js
//
// Esta função roda no servidor da Netlify, não no navegador do visitante.
// A chave da API fica numa variável de ambiente (configurada no painel da Netlify),
// nunca aparece no código que é enviado pro navegador, nunca vai pro GitHub.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY não configurada no servidor. Veja Site settings > Environment variables na Netlify.' })
    };
  }

  let parts;
  try {
    const body = JSON.parse(event.body || '{}');
    parts = body.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Corpo da requisição inválido: "parts" é obrigatório.' }) };
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido no corpo da requisição.' }) };
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    let response, data;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );

      data = await response.json();

      // 503 = modelo sobrecarregado do lado do Google, geralmente passageiro - tenta de novo
      if (response.status === 503 && attempt < maxAttempts) {
        await sleep(attempt * 1500); // espera 1.5s, depois 3s antes de tentar de novo
        continue;
      }
      break;
    }

    if (!response.ok || data.error) {
      const msg = (data.error && data.error.message) ? data.error.message : `Erro HTTP ${response.status}`;
      return { statusCode: response.status || 500, body: JSON.stringify({ error: msg }) };
    }

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
