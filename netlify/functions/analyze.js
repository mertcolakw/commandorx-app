const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Anahtar, Netlify'ın gizli ortam değişkenlerinden okunacak
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=" + GEMINI_API_KEY;

// Bu fonksiyon, tarayıcıdan gelen isteği yakalar ve Gemini'a güvenle iletir.
exports.handler = async (event, context) => {
    // Sadece POST isteklerini kabul et
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: "Method Not Allowed" };
    }
    
    try {
        // Ön yüzden gelen veriyi ayrıştır: Prompt, Schema ve System Instruction
        const { prompt, schema, systemInstructionText } = JSON.parse(event.body);

        // API isteği gövdesini oluştur
        const payload = { 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema },
            systemInstruction: { parts: [{ text: systemInstructionText }] },
        };

        // Gecikme ve tekrar deneme mantığı
        const maxRetries = 5;
        let delay = 1000;
        let response;
        
        for (let i = 0; i < maxRetries; i++) {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429 && i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }

            if (response.ok) {
                const data = await response.json();
                
                // Gemini'dan gelen ham JSON metnini temizle ve döndür
                let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (jsonText && typeof jsonText === 'string') {
                    if (jsonText.startsWith("```json")) {
                        jsonText = jsonText.substring(7).trim(); 
                    }
                    if (jsonText.endsWith("```")) {
                        jsonText = jsonText.substring(0, jsonText.length - 3).trim(); 
                    }
                } else if (typeof jsonText !== 'string' && data.error) {
                     // Bazen Netlify'ın API'sı hatayı doğrudan döndürür
                     throw new Error(data.error.message || "Bilinmeyen API hatası");
                }


                // Başarılı yanıtı tarayıcıya geri gönder
                return {
                    statusCode: 200,
                    body: JSON.stringify(jsonText)
                };
            } else {
                const errorBody = await response.text();
                console.error("Gemini API Error:", response.status, errorBody);
                if (i === maxRetries - 1) throw new Error(`API isteği başarısız oldu: ${response.status}`);
            }
        }
        
    } catch (error) {
        console.error("Serverless Function Hata:", error.message);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Dahili Sunucu Hatası", details: error.message }) 
        };
    }
};